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
  /** Lecturas que se pueden guardar POR SEMANA (ver `VENTANA_MS`). */
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

/** Un día y una semana, en milisegundos. */
const DIA_MS = 24 * 60 * 60 * 1000;
export const SEMANA_MS = 7 * DIA_MS;

/**
 * Recursos cuyo tope es por período y no total.
 *
 * El período es una VENTANA MÓVIL ("los últimos 7 días") y no la semana del
 * calendario: no depende de la zona horaria de nadie, y el usuario no pierde
 * un uso por guardar el domingo a la noche. Cuenta las veces que se guardó
 * (tabla `usage_events`), no lo que existe: borrar una lectura no devuelve el
 * uso.
 */
export const VENTANA_MS: Partial<Record<LimitedResource, number>> = {
  readings: SEMANA_MS,
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    /* 2 lecturas GUARDADAS por semana (ventana móvil de 7 días), sin tope
       total. Leer no tiene límite: lo que se limita es guardar en el
       historial. Un tope total (antes era 10) aparecía cuando el usuario ya se
       había olvidado de la app; uno semanal se ve desde la primera semana. */
    readings: 2,
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
 * Límites que corresponden a un plan.
 *
 * `status` va aparte de `plan` a propósito. Una suscripción con la tarjeta
 * caída sigue siendo "pro" hasta que termina el período de gracia: el
 * usuario ya pagó ese mes, y cortarle el acceso hoy sería romper la promesa de lo
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

/** Fecha en formato corto, para los mensajes: "martes 28 de octubre". */
const FECHA = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Lanza si el usuario ya alcanzó el tope de un recurso.
 *
 * `current` es cuánto usó: para los recursos con ventana (las lecturas),
 * cuántas guardó en los últimos 7 días; para los demás, cuántos tiene. La
 * comprobación es `>=`, así que con el tope alcanzado no puede crear otro,
 * pero sí editar los que tiene.
 *
 * `proximo` es cuándo se libera el siguiente uso, si el recurso tiene
 * ventana: el mensaje lo dice para que el usuario sepa cuándo puede volver.
 */
export function assertWithinLimit(
  plan: Plan,
  status: string,
  resource: LimitedResource,
  current: number,
  proximo?: Date | null,
): void {
  const limit = limitsFor(plan, status)[resource];
  if (current < limit) return;
  const cuando = proximo ? ` Podés guardar otra el ${FECHA.format(proximo)},` : '';
  throw new ApiError(
    402,
    'PLAN_LIMIT_REACHED',
    resource === 'readings'
      ? `Ya guardaste ${current} lecturas esta semana, el máximo del plan gratuito.${cuando || ''}${
          cuando ? ' o pasá' : ' Pasá'
        } al Pro para guardar sin límite.`
      : `Llegaste al límite de ${current} ${RESOURCE_LABEL[resource]} del plan gratuito. Pasá al Pro para crear sin tope.`,
  );
}
