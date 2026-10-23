import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import { assertCanCreate, registrarUso } from './limits';

/* ---------- Validación de entrada ----------

   Antes el body iba directo a Prisma: si faltaba un campo o venía con otro
   tipo, explotaba la base y el usuario recibía un 500 sin explicación. Ahora
   se comprueba la forma antes de escribir y el error es un 400 que dice qué
   campo está mal.

   `parcial` es para las actualizaciones: un campo que no viene se deja como
   está, pero si viene tiene que tener el tipo correcto. */

type Regla = 'texto' | 'textoOpcional' | 'lista' | 'objeto' | 'objetoOpcional' | 'booleano';

function validar(
  input: unknown,
  reglas: Record<string, Regla>,
  codigo: string,
  parcial = false,
): void {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw ApiError.badRequest(codigo, 'El cuerpo tiene que ser un objeto JSON.');
  }
  const datos = input as Record<string, unknown>;
  for (const [campo, regla] of Object.entries(reglas)) {
    const valor = datos[campo];
    const opcional = regla === 'textoOpcional' || regla === 'objetoOpcional' || regla === 'booleano';
    if (valor === undefined || valor === null) {
      if (parcial || opcional) continue;
      throw ApiError.badRequest(codigo, `Falta el campo "${campo}".`);
    }
    const ok =
      regla === 'texto'
        ? typeof valor === 'string' && valor.trim() !== ''
        : regla === 'textoOpcional'
          ? typeof valor === 'string'
          : regla === 'lista'
            ? Array.isArray(valor)
            : regla === 'objeto' || regla === 'objetoOpcional'
              ? typeof valor === 'object' && !Array.isArray(valor)
              : typeof valor === 'boolean';
    if (!ok) {
      const esperado = {
        texto: 'un texto no vacío',
        textoOpcional: 'un texto',
        lista: 'una lista',
        objeto: 'un objeto',
        objetoOpcional: 'un objeto',
        booleano: 'true o false',
      }[regla];
      throw ApiError.badRequest(codigo, `El campo "${campo}" tiene que ser ${esperado}.`);
    }
  }
}

const REGLAS_MAZO = { name: 'texto', description: 'textoOpcional', allowReversed: 'booleano', cards: 'lista' } as const;
const REGLAS_TIRADA = { name: 'texto', description: 'textoOpcional', preset: 'textoOpcional', positions: 'lista' } as const;
const REGLAS_LECTURA = {
  title: 'textoOpcional',
  question: 'textoOpcional',
  questionCategory: 'textoOpcional',
  system: 'texto',
  spread: 'objeto',
  /* Sólo las lecturas con mazo propio lo traen: en Rider-Waite y Oráculo no
     viene, y exigirlo rechazaba cualquier lectura normal. */
  deck: 'objetoOpcional',
  cards: 'lista',
} as const;
const REGLAS_RITUAL = {
  title: 'texto',
  body: 'texto',
  phase: 'textoOpcional',
  source: 'textoOpcional',
  sourceDetail: 'textoOpcional',
  sourceVerified: 'booleano',
  date: 'textoOpcional',
  festivalId: 'textoOpcional',
  notes: 'textoOpcional',
  materials: 'textoOpcional',
} as const;

/* ==========================================================================
   Servicios de datos de usuario: mazos, tiradas y lecturas.
   ========================================================================== */

/* ---------- Mazos personalizados ---------- */

export interface UserDeckInput {
  id?: string;
  name: string;
  description?: string;
  allowReversed: boolean;
  cards: unknown[];
}

/**
 * Perfil del usuario autenticado, tomado de nuestra tabla (fuente de verdad
 * del rol). El frontend lo usa para mostrar u ocultar el acceso a administración
 * sin depender de los claims de Clerk.
 */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'No existe el usuario en la base.');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function listUserDecks(userId: string) {
  const decks = await prisma.userDeck.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return decks.map((d) => ({
    ...d,
    cards: JSON.parse(d.cards),
  }));
}

export async function getUserDeck(userId: string, id: string) {
  const deck = await prisma.userDeck.findFirst({ where: { id, userId } });
  if (!deck) throw ApiError.notFound('DECK_NOT_FOUND', 'No existe un mazo con ese id.');
  return { ...deck, cards: JSON.parse(deck.cards) };
}

export async function createUserDeck(userId: string, input: UserDeckInput) {
  validar(input, REGLAS_MAZO, 'DECK_INVALID');
  const id = input.id ?? `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const deck = await prisma.userDeck.create({
    data: {
      id,
      userId,
      name: input.name,
      description: input.description,
      allowReversed: input.allowReversed ?? true,
      cards: JSON.stringify(input.cards),
    },
  });
  return { ...deck, cards: JSON.parse(deck.cards) };
}

/**
 * Upsert de mazo: si el id no existe para este usuario, lo crea.
 *
 * El frontend manda siempre el mazo completo por esta ruta, incluso cuando es
 * nuevo, así que una sola petición alcanza para crear y para actualizar. Antes
 * el frontend probaba con PUT y caía en un 404 para recién ahí hacer el POST:
 * funcionaba, pero cada mazo nuevo generaba un 404 en la consola y una
 * petición extra. Devolvemos `created` para que el controller elija 200 o 201.
 */
export async function upsertUserDeck(userId: string, id: string, input: Partial<UserDeckInput>) {
  validar(input, REGLAS_MAZO, 'DECK_INVALID', true);
  const existing = await prisma.userDeck.findFirst({ where: { id, userId } });

  if (!existing) {
    /* El id es clave primaria GLOBAL, no única por usuario. Si ya existe pero
       es de otra cuenta, el `create` haría saltar una violación de unicidad y el
       usuario vería un error sin explicación. Pasa al importar un respaldo
       exportado de otra cuenta, así que vale la pena nombrarlo. */
    const foreign = await prisma.userDeck.findUnique({ where: { id } });
    if (foreign) {
      throw new ApiError(
        409,
        'DECK_ID_TAKEN',
        `El identificador "${id}" ya está en uso por otra cuenta. Volvé a exportar e importar el mazo, o crealo de nuevo.`,
      );
    }

    /* Crear exige los campos obligatorios. Si vienen parciales, fallamos con un
       mensaje claro en vez de dejar que Prisma reviente por un null. */
    if (input.name === undefined || input.cards === undefined) {
      throw ApiError.badRequest(
        'DECK_INCOMPLETE',
        'Para crear un mazo hacen falta "name" y "cards".',
      );
    }
    /* El PUT también crea, así que también tiene que respetar el tope del
       plan. Sin esto, mandar ids nuevos por PUT esquivaba el `enforceLimit`
       del POST y el plan gratuito no tenía límite. */
    await assertCanCreate(userId, 'decks');

    const created = await prisma.userDeck.create({
      data: {
        id,
        userId,
        name: input.name,
        description: input.description,
        allowReversed: input.allowReversed ?? true,
        cards: JSON.stringify(input.cards),
      },
    });
    return { deck: { ...created, cards: JSON.parse(created.cards) }, created: true };
  }

  const deck = await prisma.userDeck.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.allowReversed !== undefined ? { allowReversed: input.allowReversed } : {}),
      ...(input.cards !== undefined ? { cards: JSON.stringify(input.cards) } : {}),
    },
  });
  return { deck: { ...deck, cards: JSON.parse(deck.cards) }, created: false };
}

export async function deleteUserDeck(userId: string, id: string) {
  const existing = await prisma.userDeck.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('DECK_NOT_FOUND', 'No existe un mazo con ese id.');
  await prisma.userDeck.delete({ where: { id } });
}

/* ---------- Tiradas personalizadas ---------- */

export interface UserSpreadInput {
  id?: string;
  name: string;
  description: string;
  preset?: string;
  positions: unknown[];
}

export async function listUserSpreads(userId: string) {
  const spreads = await prisma.userSpread.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return spreads.map((s) => ({
    ...s,
    positions: JSON.parse(s.positions),
  }));
}

export async function getUserSpread(userId: string, id: string) {
  const spread = await prisma.userSpread.findFirst({ where: { id, userId } });
  if (!spread) throw ApiError.notFound('SPREAD_NOT_FOUND', 'No existe una tirada con ese id.');
  return { ...spread, positions: JSON.parse(spread.positions) };
}

export async function createUserSpread(userId: string, input: UserSpreadInput) {
  validar(input, REGLAS_TIRADA, 'SPREAD_INVALID');
  const id = input.id ?? `spread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const spread = await prisma.userSpread.create({
    data: {
      id,
      userId,
      name: input.name,
      description: input.description ?? '',
      preset: input.preset,
      positions: JSON.stringify(input.positions),
    },
  });
  return { ...spread, positions: JSON.parse(spread.positions) };
}

/** Upsert de tirada. Mismo criterio que `upsertUserDeck`. */
export async function upsertUserSpread(
  userId: string,
  id: string,
  input: Partial<UserSpreadInput>,
) {
  validar(input, REGLAS_TIRADA, 'SPREAD_INVALID', true);
  const existing = await prisma.userSpread.findFirst({ where: { id, userId } });

  if (!existing) {
    const foreign = await prisma.userSpread.findUnique({ where: { id } });
    if (foreign) {
      throw new ApiError(
        409,
        'SPREAD_ID_TAKEN',
        `El identificador "${id}" ya está en uso por otra cuenta. Volvé a exportar e importar la tirada, o creala de nuevo.`,
      );
    }

    if (input.name === undefined || input.positions === undefined) {
      throw ApiError.badRequest(
        'SPREAD_INCOMPLETE',
        'Para crear una tirada hacen falta "name" y "positions".',
      );
    }
    /* Mismo tope que el POST: ver `upsertUserDeck`. */
    await assertCanCreate(userId, 'spreads');

    const created = await prisma.userSpread.create({
      data: {
        id,
        userId,
        name: input.name,
        description: input.description ?? '',
        preset: input.preset,
        positions: JSON.stringify(input.positions),
      },
    });
    return { spread: { ...created, positions: JSON.parse(created.positions) }, created: true };
  }

  const spread = await prisma.userSpread.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.preset !== undefined ? { preset: input.preset } : {}),
      ...(input.positions !== undefined ? { positions: JSON.stringify(input.positions) } : {}),
    },
  });
  return { spread: { ...spread, positions: JSON.parse(spread.positions) }, created: false };
}

export async function deleteUserSpread(userId: string, id: string) {
  const existing = await prisma.userSpread.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('SPREAD_NOT_FOUND', 'No existe una tirada con ese id.');
  await prisma.userSpread.delete({ where: { id } });
}

/* ---------- Lecturas ---------- */

export interface UserReadingInput {
  id?: string;
  title?: string;
  question?: string;
  questionCategory?: string;
  system: string;
  spread: unknown;
  deck?: unknown;
  cards: unknown[];
}

export async function listUserReadings(userId: string) {
  const readings = await prisma.userReading.findMany({
    where: { userId },
    /* Sin `take`. Antes se cortaba en 100, y un usuario Pro (sin tope) con
       más lecturas dejaba de ver las viejas sin ningún aviso; además el
       frontend usa esta lista para saber qué falta subir del navegador, y con
       el corte volvía a subir lecturas que ya estaban. */
    orderBy: { createdAt: 'desc' },
  });
  return readings.map((r) => ({
    ...r,
    spread: JSON.parse(r.spread),
    deck: r.deck ? JSON.parse(r.deck) : undefined,
    cards: JSON.parse(r.cards),
  }));
}

export async function getUserReading(userId: string, id: string) {
  const reading = await prisma.userReading.findFirst({ where: { id, userId } });
  if (!reading) throw ApiError.notFound('READING_NOT_FOUND', 'No existe una lectura con ese id.');
  return {
    ...reading,
    spread: JSON.parse(reading.spread),
    deck: reading.deck ? JSON.parse(reading.deck) : undefined,
    cards: JSON.parse(reading.cards),
  };
}

export async function createUserReading(userId: string, input: UserReadingInput) {
  validar(input, REGLAS_LECTURA, 'READING_INVALID');
  const id = input.id ?? `read_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  /* La lectura y el registro de uso van juntos: si uno falla, no queda el
     otro. Así nunca hay una lectura guardada que no cuente para el tope
     semanal, ni un uso contado sin lectura. */
  const [reading] = await prisma.$transaction([
    prisma.userReading.create({
      data: {
        id,
        userId,
        title: input.title,
        question: input.question,
        questionCategory: input.questionCategory,
        system: input.system,
        spread: JSON.stringify(input.spread),
        deck: input.deck ? JSON.stringify(input.deck) : null,
        cards: JSON.stringify(input.cards),
      },
    }),
    registrarUso(userId, 'readings'),
  ]);
  return {
    ...reading,
    spread: JSON.parse(reading.spread),
    deck: reading.deck ? JSON.parse(reading.deck) : undefined,
    cards: JSON.parse(reading.cards),
  };
}

export async function deleteUserReading(userId: string, id: string) {
  const existing = await prisma.userReading.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('READING_NOT_FOUND', 'No existe una lectura con ese id.');
  await prisma.userReading.delete({ where: { id } });
}

/* ---------- Rituales ---------- */

export interface UserRitualInput {
  id?: string;
  title: string;
  body: string;
  /** Fase lunar (uno de los ids de lib/lunar.ts) o 'any'. */
  phase?: string;
  source?: string | null;
  sourceDetail?: string | null;
  sourceVerified?: boolean;
  /** Día local 'AAAA-MM-DD' al que se ata el ritual. */
  date?: string | null;
  /** Id de la festividad a la que se ata. */
  festivalId?: string | null;
  notes?: string | null;
  materials?: string | null;
  /** ISO del momento en que se marcó hecho; null = pendiente. */
  completedAt?: string | null;
}

/** Largos máximos: un ritual es texto del usuario, no un archivo. */
const LARGO_MAX = { title: 200, body: 8000, notes: 8000, materials: 4000, source: 300, sourceDetail: 300 } as const;
const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FESTIVIDAD_RE = /^[a-z0-9-]{1,40}$/;

/**
 * Lo que `validar` no cubre: formatos y largos de los campos nuevos.
 *
 * - `date` es un DÍA del calendario del usuario, no un instante: 'AAAA-MM-DD'
 *   y que exista (no 2026-02-30).
 * - `completedAt` es un instante ISO o null.
 * - Un texto opcional vacío se guarda como null, para que "borrar la nota"
 *   la borre de verdad y no deje un "" que la interfaz muestre como nota.
 */
function validarRitual(input: Partial<UserRitualInput>): void {
  const malo = (msg: string) => ApiError.badRequest('RITUAL_INVALID', msg);

  for (const [campo, max] of Object.entries(LARGO_MAX)) {
    const v = (input as Record<string, unknown>)[campo];
    if (typeof v === 'string' && v.length > max) {
      throw malo(`El campo "${campo}" admite hasta ${max} caracteres.`);
    }
  }
  if (typeof input.date === 'string' && input.date !== '') {
    const m = DIA_RE.exec(input.date);
    const anio = m ? Number(m[1]) : NaN;
    const d = m ? new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[3]))) : null;
    const existe =
      d !== null &&
      d.getUTCFullYear() === anio &&
      d.getUTCMonth() === Number(m![2]) - 1 &&
      d.getUTCDate() === Number(m![3]);
    if (!existe || anio < 1900 || anio > 2100) {
      throw malo('"date" tiene que ser un día válido con la forma AAAA-MM-DD, entre 1900 y 2100.');
    }
  }
  if (typeof input.festivalId === 'string' && input.festivalId !== '' && !FESTIVIDAD_RE.test(input.festivalId)) {
    throw malo('"festivalId" no es un identificador de festividad válido.');
  }
  if (input.completedAt !== undefined && input.completedAt !== null) {
    if (typeof input.completedAt !== 'string' || Number.isNaN(Date.parse(input.completedAt))) {
      throw malo('"completedAt" tiene que ser una fecha ISO o null.');
    }
  }
}

/** Texto opcional para la base: vacío o null → null, ausente → undefined. */
const opcional = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v);

/** Los campos del ritual que vienen en `input`, listos para Prisma. */
function datosRitual(input: Partial<UserRitualInput>) {
  const datos: Record<string, unknown> = {};
  if (input.title !== undefined) datos.title = input.title;
  if (input.body !== undefined) datos.body = input.body;
  if (input.phase !== undefined) datos.phase = input.phase;
  if (input.sourceVerified !== undefined) datos.sourceVerified = input.sourceVerified;
  for (const campo of ['source', 'sourceDetail', 'date', 'festivalId', 'notes', 'materials'] as const) {
    const v = opcional(input[campo]);
    if (v !== undefined) datos[campo] = v;
  }
  if (input.completedAt !== undefined) {
    datos.completedAt = input.completedAt === null ? null : new Date(input.completedAt);
  }
  return datos;
}

/** Las ocho fases que el frontend puede mandar, más 'any'. */
const VALID_PHASES = new Set([
  'any',
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
]);

export async function listUserRituals(userId: string) {
  return prisma.userRitual.findMany({
    where: { userId },
    orderBy: [{ phase: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function createUserRitual(userId: string, input: UserRitualInput) {
  validar(input, REGLAS_RITUAL, 'RITUAL_INVALID');
  validarRitual(input);
  if (input.phase !== undefined && !VALID_PHASES.has(input.phase)) {
    throw ApiError.badRequest('RITUAL_PHASE_INVALID', `"${input.phase}" no es una fase lunar válida.`);
  }
  const id = input.id ?? `rit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return prisma.userRitual.create({
    data: {
      sourceVerified: false,
      phase: 'any',
      ...datosRitual(input),
      id,
      userId,
      title: input.title,
      body: input.body,
    },
  });
}

/** Upsert de ritual, mismo criterio que `upsertUserDeck`. */
export async function upsertUserRitual(userId: string, id: string, input: Partial<UserRitualInput>) {
  validar(input, REGLAS_RITUAL, 'RITUAL_INVALID', true);
  validarRitual(input);
  if (input.phase !== undefined && !VALID_PHASES.has(input.phase)) {
    throw ApiError.badRequest('RITUAL_PHASE_INVALID', `"${input.phase}" no es una fase lunar válida.`);
  }
  const existing = await prisma.userRitual.findFirst({ where: { id, userId } });

  if (!existing) {
    const foreign = await prisma.userRitual.findUnique({ where: { id } });
    if (foreign) {
      throw new ApiError(
        409,
        'RITUAL_ID_TAKEN',
        `El identificador "${id}" ya está en uso por otra cuenta. Volvé a exportar e importar el ritual, o crealo de nuevo.`,
      );
    }
    if (input.title === undefined || input.body === undefined) {
      throw ApiError.badRequest(
        'RITUAL_INCOMPLETE',
        'Para crear un ritual hacen falta "title" y "body".',
      );
    }
    /* Mismo tope que el POST: ver `upsertUserDeck`. */
    await assertCanCreate(userId, 'rituals');

    const created = await prisma.userRitual.create({
      data: {
        sourceVerified: false,
        phase: 'any',
        ...datosRitual(input),
        id,
        userId,
        title: input.title,
        body: input.body,
      },
    });
    return { ritual: created, created: true };
  }

  const ritual = await prisma.userRitual.update({
    where: { id },
    data: datosRitual(input),
  });
  return { ritual, created: false };
}

export async function deleteUserRitual(userId: string, id: string) {
  const existing = await prisma.userRitual.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('RITUAL_NOT_FOUND', 'No existe un ritual con ese id.');
  await prisma.userRitual.delete({ where: { id } });
}

/* ---------- Notas de festividades ---------- */

const NOTA_MAX = 4000;

function validarNota(festivalId: string, anio: number) {
  if (!FESTIVIDAD_RE.test(festivalId)) {
    throw ApiError.badRequest('FESTIVAL_INVALID', 'No es un identificador de festividad válido.');
  }
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
    throw ApiError.badRequest('ANIO_FUERA_DE_RANGO', 'El año tiene que estar entre 1900 y 2100.');
  }
}

/** Notas del usuario, de un año o de todos. */
export async function listFestivalNotes(userId: string, anio?: number) {
  if (anio !== undefined && (!Number.isInteger(anio) || anio < 1900 || anio > 2100)) {
    throw ApiError.badRequest('ANIO_FUERA_DE_RANGO', 'El año tiene que estar entre 1900 y 2100.');
  }
  return prisma.userFestivalNote.findMany({
    where: { userId, ...(anio !== undefined ? { year: anio } : {}) },
    orderBy: [{ year: 'desc' }, { festivalId: 'asc' }],
  });
}

/**
 * Guarda la nota de una festividad en un año. Una nota vacía la BORRA: es lo
 * que espera quien vacía el campo y toca guardar. Devuelve null en ese caso.
 */
export async function saveFestivalNote(userId: string, festivalId: string, anio: number, body: unknown) {
  validarNota(festivalId, anio);
  if (typeof body !== 'string') {
    throw ApiError.badRequest('FESTIVAL_NOTE_INVALID', 'El campo "body" tiene que ser un texto.');
  }
  if (body.length > NOTA_MAX) {
    throw ApiError.badRequest('FESTIVAL_NOTE_INVALID', `La nota admite hasta ${NOTA_MAX} caracteres.`);
  }
  const clave = { userId_festivalId_year: { userId, festivalId, year: anio } };
  if (body.trim() === '') {
    await prisma.userFestivalNote.deleteMany({ where: { userId, festivalId, year: anio } });
    return null;
  }
  return prisma.userFestivalNote.upsert({
    where: clave,
    create: { userId, festivalId, year: anio, body },
    update: { body },
  });
}

export async function deleteFestivalNote(userId: string, festivalId: string, anio: number) {
  validarNota(festivalId, anio);
  await prisma.userFestivalNote.deleteMany({ where: { userId, festivalId, year: anio } });
}
