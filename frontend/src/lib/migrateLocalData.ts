import { userService } from '../services/userService';
import type { CustomDeck, Reading, Spread } from '../types';

/* ==========================================================================
   Migración de datos del navegador a la cuenta.

   Antes de la autenticación, los mazos propios, las tiradas personalizadas y
   el historial vivían sólo en localStorage. Al iniciar sesión hay que subirlos
   a la base para que acompañen al usuario entre dispositivos.

   Lee el localStorage directamente (no el store) a propósito: `loadUserData`
   pisa el estado con lo que devuelve la API, así que si esperáramos a leer
   desde el store después de esa llamada, los datos locales ya se habrían
   perdido. Además la migración es idempotente: si un id ya existe en la base
   no lo vuelve a crear, así que se puede correr varias veces sin duplicar.
   ========================================================================== */

const STORAGE_KEY = 'arcana-storage-v1';

export interface MigrationReport {
  /* Cuánto había en el navegador (para diagnosticar). */
  localDecksFound: number;
  localSpreadsFound: number;
  localReadingsFound: number;
  /* Cuánto se subió efectivamente. */
  decksUploaded: number;
  spreadsUploaded: number;
  readingsUploaded: number;
  skipped: number;
}

/** Lee el sobre persistido por Zustand y devuelve sus listas. */
function readLocalData(): {
  customDecks: CustomDeck[];
  customSpreads: Spread[];
  history: Reading[];
} {
  const empty = { customDecks: [], customSpreads: [], history: [] };
  if (typeof localStorage === 'undefined') return empty;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed?.state;
    if (!state) return empty;

    return {
      customDecks: Array.isArray(state.customDecks) ? (state.customDecks as CustomDeck[]) : [],
      customSpreads: Array.isArray(state.customSpreads) ? (state.customSpreads as Spread[]) : [],
      history: Array.isArray(state.history) ? (state.history as Reading[]) : [],
    };
  } catch {
    // Un sobre corrupto no debe romper el arranque de la app.
    return empty;
  }
}

/**
 * Sube a la cuenta todo lo que esté en el localStorage y todavía no exista en
 * la base. Se puede volver a ejecutar sin efectos: compara por id.
 */
export async function migrateLocalDataToAccount(): Promise<MigrationReport> {
  const local = readLocalData();
  const report: MigrationReport = {
    localDecksFound: local.customDecks.length,
    localSpreadsFound: local.customSpreads.length,
    localReadingsFound: local.history.length,
    decksUploaded: 0,
    spreadsUploaded: 0,
    readingsUploaded: 0,
    skipped: 0,
  };

  // Traemos lo que ya está en la cuenta para no duplicar por id.
  const [remoteDecks, remoteSpreads, remoteReadings] = await Promise.all([
    userService.listDecks(),
    userService.listSpreads(),
    userService.listReadings(),
  ]);
  const deckIds = new Set(remoteDecks.map((d) => d.id));
  const spreadIds = new Set(remoteSpreads.map((s) => s.id));
  const readingIds = new Set(remoteReadings.map((r) => r.id));

  for (const deck of local.customDecks) {
    if (deckIds.has(deck.id)) {
      report.skipped += 1;
      continue;
    }
    try {
      await userService.createDeck(deck);
      report.decksUploaded += 1;
    } catch (err) {
      console.warn('[migrate] No se pudo subir el mazo', deck.name, err);
    }
  }

  for (const spread of local.customSpreads) {
    if (spreadIds.has(spread.id)) {
      report.skipped += 1;
      continue;
    }
    try {
      await userService.createSpread(spread);
      report.spreadsUploaded += 1;
    } catch (err) {
      console.warn('[migrate] No se pudo subir la tirada', spread.name, err);
    }
  }

  for (const reading of local.history) {
    if (readingIds.has(reading.id)) {
      report.skipped += 1;
      continue;
    }
    try {
      await userService.createReading(reading);
      report.readingsUploaded += 1;
    } catch (err) {
      console.warn('[migrate] No se pudo subir la lectura', reading.id, err);
    }
  }

  return report;
}

/** true si hay algo en el localStorage que todavía no está en la cuenta. */
export function hasPendingLocalData(): boolean {
  const local = readLocalData();
  return local.customDecks.length > 0 || local.customSpreads.length > 0 || local.history.length > 0;
}
