import { ApiError } from '../utils/ApiError';

/* ==========================================================================
   Planes y límites.

   La regla de diseño: el lectura es el producto. Todo lo que hace que una
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

export interface PlanLimits {
  /** Lecturas guardadas en el historial. */
  readings: number;
  /** Mazos propios. */
  decks: number;
  /** Tiradas personalizadas. */
  spreads: number;
  /** Rituales anotados. */
  rituals: number;
  /** Exportar la lectura a PDF. */
  pdfExport: boolean;
  /** Muestra el banner que promociona el Pro. */
  showBanner: boolean;
  /** Rakel de sincronización entre navegadores. */
  cloudSync: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    readings: 20,
    decks: 2,
    spreads: 3,
    rituals: 5,
    pdfExport: false,
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
    pdfExport: true,
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
