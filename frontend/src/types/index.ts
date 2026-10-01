/* ==========================================================================
   Tipos de la aplicación.

   Lo que es del DOMINIO —cartas, tiradas, lecturas, interpretación— vive en el
   paquete compartido `@arcana/tarot-core` y se re-exporta desde acá, para que
   los archivos que ya lo importaban de este archivo sigan funcionando sin
   cambiar una línea.

   Lo que queda acá es lo que sólo existe en el navegador: qué pantalla se está
   mostrando, el plan del usuario y la sesión.
   ========================================================================== */

/* -------------------------------------------------------------------------- */

import type { MoonPhaseId } from '@arcana/tarot-core';

/* ==========================================================================
   Plan y cobro.
   ========================================================================== */

export type Plan = 'free' | 'pro';

/**
 * Cuál de los tres Pro.
 *
 * Los tres dan lo mismo. La distinción es para poder decir la verdad: "se
 * renueva el 3 de marzo" contra "no se renueva nunca".
 */
export type PlanTier = 'monthly' | 'annual' | 'lifetime';

/** Nombres de los recursos con tope, para mostrar "3 de 10 lecturas". */
export type LimitedResource = 'readings' | 'decks' | 'spreads' | 'rituals';

/** Cuánto puede usar y qué puede hacer, según el plan. */
export interface PlanLimits {
  readings: number;
  decks: number;
  spreads: number;
  rituals: number;
  pdfExport: boolean;
  showBanner: boolean;
  cloudSync: boolean;
}

/** Cuántos lleva usados ahora. */
export type PlanUsage = Record<LimitedResource, number>;

/* ==========================================================================
   Navegación.
   ========================================================================== */

/** Pantallas del flujo principal. */
export type Screen =
  | 'system'
  | 'decks'
  | 'spread'
  | 'input'
  | 'result'
  | 'builder'
  | 'history'
  | 'rituals'
  | 'plan'
  | 'admin';

/* ==========================================================================
   Cuenta.
   ========================================================================== */

/** Usuario autenticado. */
export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

/**
 * Ritual anotado por el usuario, con la fuente que él declara.
 *
 * `sourceVerified` es lo importante: la app guarda la atribución tal cual la
 * escribe el usuario pero NO la comprueba. Mientras sea `false` la interfaz la
 * muestra como "fuente sin verificar", en vez de darla por buena u ocultarla.
 */
export interface Ritual {
  id: string;
  title: string;
  /** Los pasos del ritual. */
  body: string;
  /** Fase lunar a la que aplica, o 'any' si no depende de la fase. */
  phase: MoonPhaseId | 'any';
  /** Obra, autor o tradición que el usuario declara como fuente. */
  source?: string;
  /** Capítulo, página o sección, si la fuente lo tiene. */
  sourceDetail?: string;
  sourceVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/* ==========================================================================
   Del dominio compartido.

   Se re-exportan para que `import type { Spread } from '../types'` siga
   funcionando. La alternativa era cambiar el import en cada archivo que usa
   estos tipos, que son casi todos: son re-exportados porque el cambio de
   imports no aporta nada y agrega ruido en el diff.
   ========================================================================== */

export type {
  ArcanaCard,
  ArcanaType,
  Axis,
  CardCombination,
  CustomCard,
  CustomDeck,
  DrawnCard,
  Element,
  Energy,
  Interpretation,
  LayoutPreset,
  Pattern,
  PositionReading,
  QuestionCategory,
  Reading,
  Spread,
  SpreadPosition,
  Suit,
  SystemId,
  YesNoAnswer,
} from '@arcana/tarot-core';

export type { MoonPhase, MoonPhaseId } from '@arcana/tarot-core';
