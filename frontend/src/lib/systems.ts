import type { SystemId } from '../types';

/* ==========================================================================
   Etiquetas y símbolos de los sistemas de lectura, para usar en toda la UI.
   ========================================================================== */

export const SYSTEM_LABELS: Record<SystemId, string> = {
  'rider-waite': 'Tarot Rider-Waite',
  oracle: 'Oráculo',
  'custom-deck': 'Mazo propio',
};

/** Etiqueta corta para tarjetas y listados compactos. */
export const SYSTEM_SHORT: Record<SystemId, string> = {
  'rider-waite': 'Rider-Waite',
  oracle: 'Oráculo',
  'custom-deck': 'Mazo propio',
};

export const SYSTEM_GLYPHS: Record<SystemId, string> = {
  'rider-waite': '☉',
  oracle: '❋',
  'custom-deck': '✧',
};
