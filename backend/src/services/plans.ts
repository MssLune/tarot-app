import { ApiError } from '../utils/ApiError';
import { configuredTiers } from '../config/env';

/* ==========================================================================
   Planes y límites.

   La regla de diseño: la lectura es el producto. Todo lo que hace que una
   lectura sirva tiene que ser gratis para siempre —las 78 cartas, las fichas,
   la interpretación, la fase lunar— porque poner eso detrás de un muro es
   cobrarle a alguien por la razón por la que vino.

   Lo que se cobra es el ACCESO, no el contenido: cuánto puede acumular y
   qué puede llevar consigo. Un usuario free no puede leer menos cartas que
   uno pago; sólo guarda menos cosas y no se las lleva en otro formato.

   Todos los números viven acá. Si se cambia un límite, se cambia en un solo
   lugar y no hay que buscarlos en las pantallas.
   ========================================================================== */

export type Plan = 'free' | 'pro';

/**
 * Cuál de los tres Pro se compró.
 *
 * Los tres dan el mismo plan. La distinción existe sólo para poder hablar con
 * precisión: "se renueva el 3 de marzo" contra "no se renueva nunca". Un
 * `tier` mal guardado no le da más cosas al usuario, así que el riesgo es
 * cosmético, no de acceso.
 */
export type PlanTier = 'monthly' | 'annual' | 'lifetime';

/** Los tres, en el orden en que se ofrecen. */
export const PLAN_TIERS: PlanTier[] = ['monthly', 'annual', 'lifetime'];

/** Rótulo corto de cada uno, para la interfaz. */
export const TIER_LABEL: Record<PlanTier, string> = {
  monthly: 'Mensual',
  annual: 'Anual',
  lifetime: 'De por vida',
};

/**
 * Qué plan es, según el price id de Stripe.
 *
 * El precio decide, nunca un flag escrito a mano. Es la misma regla para los
 * tres: si el id no está en la lista, es `free`. Así un precio desconocido —o
 * un `prod_` en vez de un `price_`— degrada a gratuito en vez de regalar Pro
 * por error. Cobrar de menos se arregla; regalar acceso no.
 */
export function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  /* La comprobación de vacío va primero a propósito: si un plan no está
     configurado, su id es '' y compararlo contra el precio real nunca
     coincidiría, pero con un `priceId` vacío entraría. */
  if (!priceId) return null;
  for (const tier of PLAN_TIERS) {
    if (configuredTiers[tier] && configuredTiers[tier] === priceId) return tier;
  }
  return null;
}

export interface PlanLimits {
  /** Lecturas guardadas en el historial. */
  readings: number;
  /** Mazos propios. */
  decks: number;
  /** Tiradas personalizadas. */
  spreads: number;
  /** Rituales anotados. */
  rituals: number;
  /** Muestra el banner que promociona el Pro. */
  showBanner: boolean;
  /** Respaldo en la nube de los datos del navegador. */
  cloudSync: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    /* A la mitad de lo que había. El límite tiene que aparecer mientras el
       usuario todavía recuerda que la app le sirvió: alguien que lee una vez
       por semana tarda más de dos meses en llegar a diez, y para entonces
       ya se olvidó de qué era esto. */
    readings: 10,
    decks: 1,
    spreads: 2,
    rituals: 3,
    showBanner: true,
    /* Sin límite de tiempo, pero el respaldo en la nube de los datos del
       navegador es lo que justifica el plan. */
    cloudSync: true,
  },
  pro: {
    readings: Number.POSITIVE_INFINITY,
    decks: Number.POSITIVE_INFINITY,
    spreads: Number.POSITIVE_INFINITY,
    rituals: Number.POSITIVE_INFINITY,
    showBanner: false,
    cloudSync: true,
  },
};

/** Recursos con tope. Los que no aparecen acá no tienen límite. */
export type LimitedResource = 'readings' | 'decks' | 'spreads' | 'rituals';

const RESOURCE_LABEL: Record<LimitedResource, string> = {
  readings: 'lecturas',
  decks: 'mazos',
  spreads: 'tiradas',
  rituals: 'rituales',
};

/**
 * Límites que correspond plan.
 *
 * `status` va aparte de `plan` a propósito. Una suscripción con la tarjeta
 * caída sigue siendo "pro" hasta que termina el período de gracia: el
 * usuario ya pagó ese mes y قطع el acceso hoy sería romper la promesa de lo
 * que pagó. El webhook de Stripe se encarga de hacer la transición.
 */
export function limitsFor(plan: Plan, status: string): PlanLimits {
  /* `incomplete` es un checkout que empezó pero no se terminó de pagar. */
  const pagando = status === 'active' || status === 'trialing';
  const enGracia = status === 'past_due' || status === 'unpaid';
  if (plan === 'pro' && (pagando || enGracia)) return PLAN_LIMITS.pro;
  return PLAN_LIMITS.free;
}

export function planFrom(plan: string | null | undefined, status: string): Plan {
  if (plan !== 'pro') return 'free';
  return limitsFor('pro', status) === PLAN_LIMITS.pro ? 'pro' : 'free';
}

/**
 * El tier que REALMENTE aplica, después de mirar el estado de Stripe.
 *
 * El de por vida es el caso raro: se compró una vez con un pago único y no hay
 * suscripción que se pueda cancelar ni tarjeta que pueda fallar. Por eso
 * `status` no lo toca nunca. Un `canceled` que llegara después —por ejemplo un
 * webhook atrasado de una suscripción que el usuario tuvo antes— no puede
 * dejar sin Pro a alguien que ya pagó de por vida.
 */
export function effectiveTier(
  tier: string | null | undefined,
  status: string,
): PlanTier | null {
  if (tier === 'lifetime') return 'lifetime';
  if (tier !== 'monthly' && tier !== 'annual') return null;
  /* Mensual y anual dependen del estado: una suscripción cancelada deja de
     valer al terminar el período que ya estaba pagado. */
  return limitsFor('pro', status) === PLAN_LIMITS.pro ? tier : null;
}

/**
 * Lanza si el usuario ya alcanzó el tope de un recurso.
 *
 * `current` es cuántos tiene AHORA. La comprobación es `>=` y no `>`, así que
 * con 20 lecturas free no puede crear la 21. y puede editar las que tiene.
 */
export function assertWithinLimit(
  plan: Plan,
  status: string,
  resource: LimitedResource,
  current: number,
): void {
  const limit = limitsFor(plan, status)[resource];
  if (current < limit) return;
  throw new ApiError(
    402,
    'PLAN_LIMIT_REACHED',
    resource === 'readings'
      ? `Guardaste ${current} lecturas, que es el límite del plan gratuito. Pasá al Pro para guardar sin tope.`
      : `Llegaste al límite de ${current} ${RESOURCE_LABEL[resource]} del plan gratuito. Pasá al Pro para crear sin tope.`,
  );
}
