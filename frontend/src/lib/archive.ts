import { esUrlDeImagenValida } from '@arcana/tarot-core';
import type { CustomCard, CustomDeck, Reading, Ritual, Spread, YesNoAnswer } from '../types';

/* ==========================================================================
   Exportar / importar el archivo del usuario en JSON.

   Motivo: el localStorage del navegador no tiene historial ni copia de
   seguridad. Si se borra el perfil o se limpia el navegador, los mazos, las
   tiradas, las lecturas y los rituales desaparecen sin dejar rastro. Un
   archivo JSON que el usuario guarda en su disco es el único respaldo posible
   sin cuentas ni backend extra.

   Todo es client-side: no se sube nada a ningún servidor.

   VERSIONES DEL FORMATO
   - v1: mazos, tiradas y lecturas. Sin rituales.
   - v2: agrega `rituals`.

   Los archivos v1 se siguen aceptando: `rituals` llega como lista vacía. Un
   respaldo que no tenga la clave no es inválido, es anterior. Sólo se rechaza
   un archivo de una versión FUTURA, que es el caso en el que no sabemos qué
   campos trae y no lo podemos leer con seguridad.

   IMÁGENES DE LAS CARTAS (dentro de v2)
   Cada carta de un mazo puede traer `imageUrl`: una dirección https:// a la
   imagen. Es un campo opcional nuevo, no una versión nueva: un archivo sin
   imágenes es igual que antes y una app anterior simplemente lo ignora. Al
   importar, una `imageUrl` que no sea https:// válida se descarta y la carta
   queda con su símbolo. El formato completo está en `docs/formato-de-datos.md`.
   ========================================================================== */

/** Versión actual del formato. */
export const ARCHIVE_VERSION = 2;
/** Primera versión con rituales. */
const RITUALS_SINCE = 2;

export interface Archive {
  format: 'arcana-archive';
  version: number;
  exportedAt: string;
  decks: CustomDeck[];
  spreads: Spread[];
  readings: Reading[];
  /** Presente desde v2. En v1 queda como lista vacía al importar. */
  rituals: Ritual[];
}

const KIND_LABELS: Record<'decks' | 'spreads' | 'readings' | 'rituals', string> = {
  decks: 'mazos',
  spreads: 'tiradas',
  readings: 'lecturas',
  rituals: 'rituales',
};

/* -------------------------------------------------------------------------- */
/* Exportar                                                                    */
/* -------------------------------------------------------------------------- */

export interface ExportOptions {
  decks?: boolean;
  spreads?: boolean;
  readings?: boolean;
  rituals?: boolean;
}

/** Arma el objeto de archivo con lo seleccionado. */
export function buildArchive(
  data: {
    customDecks: CustomDeck[];
    customSpreads: Spread[];
    history: Reading[];
    /** Opcional: si el store aún no tiene rituales, el respaldo sale sin ellos. */
    rituals?: Ritual[];
  },
  options: ExportOptions = {},
): Archive {
  const { decks = true, spreads = true, readings = true, rituals = true } = options;
  return {
    format: 'arcana-archive',
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    decks: decks ? data.customDecks : [],
    spreads: spreads ? data.customSpreads : [],
    readings: readings ? data.history : [],
    rituals: rituals ? (data.rituals ?? []) : [],
  };
}

/** Texto apto para un nombre de archivo: minúsculas, sin tildes ni espacios. */
function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sin-nombre'
  );
}

/**
 * Nombre del archivo según lo que lleva adentro, para que no todos se llamen
 * igual: `arcana-mazo-mi-oraculo-2026-10-24.json`, `arcana-lecturas-…`,
 * `arcana-respaldo-…` (todo), o la lista de lo que incluye.
 */
export function nombreDeArchivo(archive: Archive): string {
  const fecha = new Date().toISOString().slice(0, 10);
  const partes = (['decks', 'spreads', 'readings', 'rituals'] as const).filter(
    (k) => archive[k].length > 0,
  );
  let cuerpo: string;
  if (partes.length === 1 && partes[0] === 'decks' && archive.decks.length === 1) {
    cuerpo = `mazo-${slug(archive.decks[0].name)}`;
  } else if (partes.length === 1 && partes[0] === 'spreads' && archive.spreads.length === 1) {
    cuerpo = `tirada-${slug(archive.spreads[0].name)}`;
  } else if (partes.length === 4) {
    cuerpo = 'respaldo';
  } else if (partes.length === 0) {
    cuerpo = 'vacio';
  } else {
    cuerpo = partes.map((k) => KIND_LABELS[k]).join('-');
  }
  return `arcana-${cuerpo}-${fecha}.json`;
}

/** Descarga el archivo al disco, con un nombre que dice qué contiene. */
export function downloadArchive(archive: Archive, nombre = nombreDeArchivo(archive)): void {
  const json = JSON.stringify(archive, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Libera el object URL: sin esto el blob queda retenido en memoria.
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Importar                                                                    */
/* -------------------------------------------------------------------------- */

export type ImportKind = keyof typeof KIND_LABELS;

export interface ImportPreview {
  archive: Archive;
  decks: number;
  spreads: number;
  readings: number;
  rituals: number;
  total: number;
}

export class ArchiveError extends Error {}

/**
 * Valida que el texto sea un archivo de Arcana utilizable.
 * Lanzar un error con mensaje claro es mejor que dejar que reviente más
 * abajo con un `undefined` que nadie entiende.
 */
export function parseArchive(raw: string): ImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ArchiveError('El archivo no es un JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ArchiveError('El archivo no tiene la forma de un archivo de Arcana.');
  }

  const candidate = parsed as Partial<Archive>;

  if (candidate.format !== 'arcana-archive') {
    throw new ArchiveError('Este archivo no fue exportado desde Arcana.');
  }
  if (typeof candidate.version !== 'number') {
    throw new ArchiveError('El archivo no declara su versión.');
  }
  if (candidate.version > ARCHIVE_VERSION) {
    throw new ArchiveError(
      `El archivo es de una versión más nueva (v${candidate.version}) que la app soporta ` +
        `(v${ARCHIVE_VERSION}). Actualiza Arcana para poder importarlo.`,
    );
  }

  /* Cada lista se acepta sólo si es un array; si falta, se trata como vacía
     para que un archivo incompleto no bloquee la importación. Un respaldo v1
     no tiene `rituals`, y eso es lo esperado: no es un archivo roto. */
  const decks = Array.isArray(candidate.decks) ? candidate.decks : [];
  const spreads = Array.isArray(candidate.spreads) ? candidate.spreads : [];
  const readings = Array.isArray(candidate.readings) ? candidate.readings : [];
  const rituals = Array.isArray(candidate.rituals) ? candidate.rituals : [];

  /* Descartamos entradas sin id: sin id no se puede deduplicar ni guardar. */
  const withId = <T extends { id?: unknown }>(list: T[]): T[] =>
    list.filter((item) => item && typeof item.id === 'string' && item.id.length > 0);

  const cleanDecks = (withId(decks) as CustomDeck[]).map(normalizarMazo);
  const cleanSpreads = withId(spreads) as Spread[];
  const cleanReadings = withId(readings) as Reading[];
  const cleanRituals = withId(rituals) as Ritual[];

  const descartados =
    decks.length + spreads.length + readings.length + rituals.length -
    (cleanDecks.length + cleanSpreads.length + cleanReadings.length + cleanRituals.length);
  if (descartados > 0) {
    console.warn(`[arcana] Se descartaron ${descartados} entradas sin id al importar.`);
  }

  return {
    archive: {
      format: 'arcana-archive',
      /* Se guarda como v2 aunque venga de un v1: al reexportarlo ya trae la
         lista de rituales, vacía si el archivo original no la tenía. */
      version: ARCHIVE_VERSION,
      exportedAt: candidate.exportedAt ?? new Date().toISOString(),
      decks: cleanDecks,
      spreads: cleanSpreads,
      readings: cleanReadings,
      rituals: cleanRituals,
    },
    decks: cleanDecks.length,
    spreads: cleanSpreads.length,
    readings: cleanReadings.length,
    rituals: cleanRituals.length,
    total:
      cleanDecks.length +
      cleanSpreads.length +
      cleanReadings.length +
      cleanRituals.length,
  };
}

/**
 * Deja un mazo importado listo para usar, aunque se haya escrito a mano:
 * - cartas: sólo las que tienen `name`; si les falta `id`, se les pone uno;
 * - `imageUrl`: sólo si es una dirección https:// válida. Una inválida (http://,
 *   data:, texto suelto) se quita en vez de rechazar el archivo entero: la
 *   carta sirve igual con su símbolo, y si quedara guardada el servidor
 *   rechazaría el mazo al sincronizarlo;
 * - `allowReversed`, `createdAt` y `updatedAt` toman un valor por defecto si
 *   faltan, y el mazo sin nombre se llama «Mazo importado».
 */
export function normalizarMazo(deck: CustomDeck): CustomDeck {
  const ahora = Date.now();
  const crudas: unknown[] = Array.isArray(deck.cards) ? deck.cards : [];
  const cards = crudas.flatMap((cruda, i): CustomCard[] => {
    if (cruda === null || typeof cruda !== 'object') return [];
    const { imageUrl, ...card } = cruda as CustomCard;
    if (typeof card.name !== 'string' || !card.name.trim()) return [];
    const id = typeof card.id === 'string' && card.id ? card.id : `${deck.id}_carta_${i + 1}`;
    const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    const limpia = normalizarTemas({ ...card, id });
    return [url && esUrlDeImagenValida(url) ? { ...limpia, imageUrl: url } : limpia];
  });
  return {
    ...deck,
    name: typeof deck.name === 'string' && deck.name.trim() ? deck.name : 'Mazo importado',
    allowReversed: typeof deck.allowReversed === 'boolean' ? deck.allowReversed : true,
    createdAt: typeof deck.createdAt === 'number' ? deck.createdAt : ahora,
    updatedAt: typeof deck.updatedAt === 'number' ? deck.updatedAt : ahora,
    cards,
  };
}

/**
 * Nombres en inglés que usan otras apps y guías de mazos, y el campo de
 * Arcana al que corresponden. Así un mazo «celestial» con `love` o `career`
 * se importa sin tener que renombrar nada a mano.
 */
const ALIAS_DE_TEMAS: Record<string, 'loveHint' | 'workHint' | 'moneyHint' | 'healthHint' | 'yesNoReason'> = {
  love: 'loveHint',
  amor: 'loveHint',
  career: 'workHint',
  work: 'workHint',
  trabajo: 'workHint',
  money: 'moneyHint',
  finance: 'moneyHint',
  finances: 'moneyHint',
  dinero: 'moneyHint',
  health: 'healthHint',
  salud: 'healthHint',
  yesNoText: 'yesNoReason',
};

const RESPUESTAS: Record<string, YesNoAnswer> = {
  si: 'si',
  sí: 'si',
  yes: 'si',
  no: 'no',
  incierto: 'incierto',
  quizas: 'incierto',
  quizás: 'incierto',
  maybe: 'incierto',
  uncertain: 'incierto',
};

/**
 * Pasa los alias a los campos de Arcana (sin pisar uno que ya venga con su
 * nombre propio) y deja `yesNo` sólo si es una respuesta conocida: `si`,
 * `no` o `incierto` (también entiende `yes`, `maybe`, `sí`, `quizás`).
 */
function normalizarTemas(card: CustomCard): CustomCard {
  const salida: Record<string, unknown> = { ...card };
  for (const [alias, campo] of Object.entries(ALIAS_DE_TEMAS)) {
    const valor = salida[alias];
    if (valor === undefined) continue;
    delete salida[alias];
    if (typeof valor === 'string' && valor.trim() && !salida[campo]) salida[campo] = valor;
  }
  const respuesta = salida.yesNo;
  delete salida.yesNo;
  if (typeof respuesta === 'string') {
    const conocida = RESPUESTAS[respuesta.trim().toLowerCase()];
    if (conocida) salida.yesNo = conocida;
  }
  return salida as unknown as CustomCard;
}

/** ¿Esta versión del formato trae rituales? */
export function archiveHasRituals(version: number): boolean {
  return version >= RITUALS_SINCE;
}

/** Lee un File del <input type="file"> y devuelve el archivo validado. */
export async function readArchiveFile(file: File): Promise<ImportPreview> {
  const text = await file.text();
  return parseArchive(text);
}

export { KIND_LABELS };
