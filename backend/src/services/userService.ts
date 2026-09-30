import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';

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
  const id = input.id ?? `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const deck = await prisma.userDeck.create({
    data: {
      id,
      userId,
      name: input.name,
      description: input.description,
      allowReversed: input.allowReversed,
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
  const id = input.id ?? `spread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const spread = await prisma.userSpread.create({
    data: {
      id,
      userId,
      name: input.name,
      description: input.description,
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
    orderBy: { createdAt: 'desc' },
    take: 100,
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
  const id = input.id ?? `read_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const reading = await prisma.userReading.create({
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
  });
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
  source?: string;
  sourceDetail?: string;
  sourceVerified?: boolean;
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
  if (input.phase !== undefined && !VALID_PHASES.has(input.phase)) {
    throw ApiError.badRequest('RITUAL_PHASE_INVALID', `"${input.phase}" no es una fase lunar válida.`);
  }
  const id = input.id ?? `rit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return prisma.userRitual.create({
    data: {
      id,
      userId,
      title: input.title,
      body: input.body,
      phase: input.phase ?? 'any',
      source: input.source,
      sourceDetail: input.sourceDetail,
      sourceVerified: input.sourceVerified ?? false,
    },
  });
}

/** Upsert de ritual, mismo criterio que `upsertUserDeck`. */
export async function upsertUserRitual(userId: string, id: string, input: Partial<UserRitualInput>) {
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
    const created = await prisma.userRitual.create({
      data: {
        id,
        userId,
        title: input.title,
        body: input.body,
        phase: input.phase ?? 'any',
        source: input.source,
        sourceDetail: input.sourceDetail,
        sourceVerified: input.sourceVerified ?? false,
      },
    });
    return { ritual: created, created: true };
  }

  const ritual = await prisma.userRitual.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.sourceDetail !== undefined ? { sourceDetail: input.sourceDetail } : {}),
      ...(input.sourceVerified !== undefined ? { sourceVerified: input.sourceVerified } : {}),
    },
  });
  return { ritual, created: false };
}

export async function deleteUserRitual(userId: string, id: string) {
  const existing = await prisma.userRitual.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound('RITUAL_NOT_FOUND', 'No existe un ritual con ese id.');
  await prisma.userRitual.delete({ where: { id } });
}
