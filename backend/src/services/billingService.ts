import Stripe from 'stripe';
import { env, isStripeConfigured, configuredTiers } from '../config/env';
import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import {
  planFrom,
  effectiveTier,
  limitsFor,
  tierFromPriceId,
  PLAN_LIMITS,
  PLAN_TIERS,
  type Plan,
  type PlanTier,
} from './plans';

/* ==========================================================================
   Suscripciones con Stripe.

   Lo importante de este archivo NO es hablar con Stripe: es qué hacer cuando
   un evento dice que la suscripción cambió. Ahí es donde un backend mal
   hecho cobra de más o deja de cobrar.

   Hay DOS caminos de compra, y no son intercambiables:

   - Mensual y anual: `mode: 'subscription'`. Se renuevan, tienen prueba, y hay
     un objeto `subscription` del que depende todo el ciclo de vida.
   - De por vida: `mode: 'payment'`. Un solo cobro, sin renovación, sin prueba
     y SIN objeto suscripción. El checkout de suscripción de Stripe rechaza
     los precios que no se renuevan, así que ese precio no puede pasar por
     ahí. Lo que concede el Pro es el evento de checkout.

   Idempotencia: los webhooks de Stripe se reintentan, y el mismo evento puede
   llegar dos veces. Por eso TODAS las escrituras usan `upsert`, y el estado
   se deriva del evento, no se acumula. Un evento repetido deja el mismo
   resultado.

   La fuente de verdad es Stripe, no nuestra base. Si algo se desincroniza, el
   siguiente webhook lo corrige. Nunca comparamos contra lo que ya creíamos.
   ========================================================================== */

let client: Stripe | null = null;

/** Cliente perezoso: sólo se crea si hay secret. */
function stripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new ApiError(503, 'BILLING_NOT_CONFIGURED', 'El cobro no está configurado en este entorno.');
  }
  /* No se fija `apiVersion` a mano: cada versión de la librería viene pineada
     a la versión de la API que realmente soporta. Poner un string viejo
     acá hace que TypeScript rechace la llamada, y copiar el número del error
     es frágil. Si algún día hay que fijarlo, se copia de
     `node_modules/stripe/cjs/apiVersion.d.ts`. */
  /* El cliente HTTP es el de `fetch` y no el de `node:https` que usa la
     librería por defecto. No cambia nada en producción —Node tiene fetch— pero
     permite que los tests intercepten la llamada y verifiquen qué decidimos
     sobre la respuesta, sin salir a la red. */
  client ??= new Stripe(env.stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return client;
}

export interface SubscriptionView {
  plan: Plan;
  status: string;
  /** Cuál de los tres Pro, o null si está en gratuito. */
  tier: PlanTier | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: ReturnType<typeof import('./plans').limitsFor>;
}

export async function getSubscription(userId: string): Promise<SubscriptionView> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) {
    /* Sin fila todavía: es un usuario que nunca intentó pagar. No se crea
       acá a propósito — una fila "free" por cada visitante infla la tabla sin
       aportarle nada. */
    return {
      plan: 'free',
      status: 'inactive',
      tier: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: limitsFor('free', 'inactive'),
    };
  }
  /* El tier manda sobre `plan`: los tres Pro dan lo mismo, así que `plan` es
     derivado y no puede quedar desincronizado del tier. El `planFrom` queda
     como red para una fila vieja o editada a mano que diga plan=pro sin tier,
     que tampoco debería quedarse sin acceso. */
  const tier = effectiveTier(sub.tier, sub.status);
  const plan: Plan = tier ? 'pro' : sub.tier === null ? planFrom(sub.plan, sub.status) : 'free';
  return {
    plan,
    status: sub.status,
    tier,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    limits: limitsFor(plan, sub.status),
  };
}

/** Crea (o reutiliza) el cliente de Stripe para este usuario. */
async function ensureCustomer(userId: string, email: string | null): Promise<string> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe().customers.create({
    email: email ?? undefined,
    /* Guardamos el id de Clerk en los metadatos. Es lo que permite
       encontrar al usuario desde un webhook sin depender de nuestro id. */
    metadata: { clerkUserId: userId },
  });

  await prisma.subscription.upsert({
    where: { userId },
    create: { id: `sub_${userId}`, userId, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** URL de retorno al frontend. */
function appUrl(path: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}${path}`;
}

/** El precio de Stripe que corresponde a un tier, o un error legible. */
function priceFor(tier: PlanTier): string {
  const price = configuredTiers[tier];
  if (!price) {
    throw new ApiError(
      503,
      'TIER_NOT_CONFIGURED',
      `El plan ${tier} todavía no está configurado en este entorno.`,
    );
  }
  /* Falla ruidosamente en desarrollo si se puso un `prod_` en vez de un
     `price_`. Este es el error que no da ningún síntoma: sin él, el usuario
     paga y queda en gratuito sin que nada avise. */
  if (!price.startsWith('price_')) {
    console.error(
      `[billing] ${tier} tiene "${price.slice(0, 8)}..." donde debería ir un price id ` +
        '(empieza con "price_"). Es el product id. El Pro no se va a activar.',
    );
  }
  return price;
}

/**
 * Abre una sesión de checkout de Stripe.
 *
 * El `metadata` es lo que permite reconciliar: cuando Stripe emite el webhook
 * de `checkout.session.completed`, lo trae y sabemos de quién es aunque no
 * tengamos el customer id a mano. Va en los DOS lugares que corresponden al
 * modo: `subscription_data` para el recurrente, `payment_intent_data` para el
 * de una vez. Ponerlo en el equivocado no da error, sólo que el webhook no
 * puede atribuir la compra y el Pro no se concede.
 */
export async function createCheckoutSession(
  userId: string,
  email: string | null,
  tier: PlanTier,
): Promise<{ url: string }> {
  const price = priceFor(tier);
  const customerId = await ensureCustomer(userId, email);
  const esPagoUnico = tier === 'lifetime';

  const common = {
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: appUrl('/?checkout=ok'),
    cancel_url: appUrl('/?checkout=cancelado'),
    allow_promotion_codes: true,
    metadata: { clerkUserId: userId },
  };

  const session = await stripe().checkout.sessions.create(
    esPagoUnico
      ? {
          ...common,
          mode: 'payment' as const,
          /* El pago de por vida NO tiene suscripción: es un solo cobro. El
             webhook de checkout es lo único que lo concede. */
          payment_intent_data: { metadata: { clerkUserId: userId } },
        }
      : {
          ...common,
          mode: 'subscription' as const,
          subscription_data: {
            metadata: { clerkUserId: userId },
            /* La prueba va en la suscripción, no en la sesión. Sin esto, el
               primer cobro ocurre el día que te suscribís y no hay forma de
               dar los 7 días. */
            ...(env.stripeTrialDays >= 1 ? { trial_period_days: env.stripeTrialDays } : {}),
          },
        },
  );

  if (!session.url) {
    throw new ApiError(502, 'CHECKOUT_NO_URL', 'Stripe no devolvió una URL de checkout.');
  }
  return { url: session.url };
}

/**
 * Concede el Pro de por vida a partir de una sesión de checkout pagada.
 *
 * Es el camino del pago único, y es el ÚNICO lugar donde se concede: no hay
 * suscripción que consultar después, así que si este camino falla, el usuario
 * pagó y no tiene nada a cambio.
 *
 * El precio se lee de la sesión, no de lo que teníamos en la cabeza: es
 * la misma regla que en el recurrente, y es la que impide que un pago de
 * cualquier otro importe active el Pro.
 */
export async function grantLifetime(sessionId: string): Promise<string | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, {
    expand: ['line_items.data.price'],
  });

  /* `checkout.session.completed` NO significa "cobrado". Con medios de pago
     diferidos (SEPA, transferencia, etc.) la sesión se completa con
     `payment_status: 'unpaid'` y el dinero llega días después, o nunca. Se
     concede sólo con el pago confirmado; si queda pendiente, el evento
     `checkout.session.async_payment_succeeded` vuelve a llamar acá cuando
     llega el cobro. `no_payment_required` es un cupón del 100 %: no hay nada
     que esperar. */
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    console.warn(
      `[billing] La sesión ${sessionId} todavía no está cobrada (payment_status ` +
        `"${session.payment_status}"). El Pro de por vida se concede cuando llegue el pago.`,
    );
    return null;
  }

  const priceId = session.line_items?.data[0]?.price?.id ?? null;
  if (tierFromPriceId(priceId) !== 'lifetime') {
    /* No es el precio de por vida: no se concede nada. Puede ser un pago
       suelto creado a mano en el panel, o un precio que ya no exista. */
    console.error(
      `[billing] La sesión ${sessionId} no es una compra de por vida (precio ${priceId}). No se concede Pro.`,
    );
    return null;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  /* Los dos metadatos se FUSIONAN en vez de elegir uno. Elegir con `??` está
     mal porque `metadata` de la sesión suele venir como `{}` y no como `null`:
     un objeto vacío no es *nullish*, así que el `??` se quedaba siempre con el
     de la sesión y nunca llegaba a mirar el del payment_intent. El resultado
     era una compra de por vida que no se podía atribuir a nadie, es decir, un
     usuario que pagó y no recibió nada. */
  const delIntent = (session.payment_intent as { metadata?: Stripe.Metadata } | null | undefined)
    ?.metadata;
  const userId = await resolveUserId(customerId ?? undefined, {
    ...delIntent,
    ...session.metadata,
  });
  if (!userId) {
    console.error(
      `[billing] No pude atribuir la compra de por vida ${sessionId} a ningún usuario.`,
      { customerId, metadata: session.metadata },
    );
    return null;
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      id: `sub_${userId}`,
      userId,
      stripeCustomerId: customerId,
      plan: 'pro',
      /* Un pago único no tiene estados de suscripción. 'active' es lo
         correcto y no se va a mover nunca: no hay renovación que falle ni
         tarjeta que updating. */
      status: 'active',
      tier: 'lifetime',
      stripePriceId: priceId,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    update: {
      stripeCustomerId: customerId,
      plan: 'pro',
      status: 'active',
      tier: 'lifetime',
      stripePriceId: priceId,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });
  return userId;
}

/**
 * Quita el Pro de por vida cuando el pago que lo concedió se devolvió entero
 * o se perdió una disputa (contracargo).
 *
 * Se parte del `payment_intent` del cobro y se busca la sesión de checkout que
 * lo creó: sólo si ESA sesión fue la compra de por vida se quita algo. Un
 * reembolso de una factura del mensual no tiene sesión de pago único detrás, y
 * de esos se encarga el ciclo de vida de la suscripción.
 *
 * El `tier` pasa a null y el `plan` a free, que es lo que hace que
 * `getSubscription` lo trate como gratuito. La fila no se borra: queda el
 * `status` con el motivo, para poder investigar.
 */
export async function revokeLifetime(
  paymentIntentId: string,
  motivo: 'refunded' | 'dispute_lost',
): Promise<string | null> {
  const lista = await stripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const resumen = lista.data[0];
  if (!resumen) return null;

  const session = await stripe().checkout.sessions.retrieve(resumen.id, {
    expand: ['line_items.data.price'],
  });
  const priceId = session.line_items?.data[0]?.price?.id ?? null;
  if (session.mode !== 'payment' || tierFromPriceId(priceId) !== 'lifetime') return null;

  const customerId =
    typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  const userId = await resolveUserId(customerId ?? undefined, session.metadata);
  if (!userId) {
    console.error(
      `[billing] Llegó ${motivo} del pago ${paymentIntentId}, pero no pude atribuirlo a nadie.`,
    );
    return null;
  }

  const fila = await prisma.subscription.findUnique({ where: { userId }, select: { tier: true } });
  if (fila?.tier !== 'lifetime') return userId;

  await prisma.subscription.update({
    where: { userId },
    data: { tier: null, plan: 'free', status: motivo, cancelAtPeriodEnd: false },
  });
  console.warn(`[billing] Se quitó el Pro de por vida a ${userId}: ${motivo} (${paymentIntentId}).`);
  return userId;
}

/* ==========================================================================
   Catálogo de planes.

   Los precios NO están escritos en el frontend. La pantalla tiene que mostrar
   lo mismo que Stripe va a cobrar, y si el número está hardcodeado en dos
   lugares tarde o temprano divergen: se cambia el precio en el panel, la app
   sigue mostrando el viejo, y el usuario se encuentra con una diferencia al
   pagar. Por eso se leen de la API de Stripe y se cachean.

   La caché es porque es una lectura que cambia una vez cada varios meses y se
   consulta en cada visita a la pantalla. Un día de caché alcanza: un cambio de
   precio tarda un día en verse, y para eso no hace falta pedirle a Stripe en
   cada carga.
   ========================================================================== */

export interface PlanOffer {
  tier: PlanTier;
  /** El importe en la unidad mínima de la moneda (centavos). null si no se pudo
   *  leer de Stripe: la app sigue mostrando el plan, sin precio. */
  amount: number | null;
  currency: string | null;
  /** Con qué frecuencia se renueva, si se renueva. */
  interval: 'month' | 'year' | null;
  /** Días de prueba, si el plan los tiene. */
  trialDays: number | null;
  /** Si el precio se pudo leer de Stripe. */
  disponible: boolean;
}

let catalogoCache: { ofertas: PlanOffer[]; expires: number } | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function getPlanCatalog(): Promise<PlanOffer[]> {
  if (catalogoCache && catalogoCache.expires > Date.now()) {
    return catalogoCache.ofertas;
  }

  const ofertas = await Promise.all(
    PLAN_TIERS.map(async (tier): Promise<PlanOffer> => {
      const priceId = configuredTiers[tier];
      if (!priceId) {
        return { tier, amount: null, currency: null, interval: null, trialDays: null, disponible: false };
      }
      try {
        const price = await stripe().prices.retrieve(priceId);
        const recurrente = price.recurring ?? null;
        return {
          tier,
          amount: price.unit_amount,
          currency: price.currency,
          interval: recurrente?.interval === 'year' ? 'year' : recurrente ? 'month' : null,
          /* La prueba va en el recurrente. El pago único no la admite, y por
             eso `interval === null` es también la señal de que no la tiene. */
          trialDays: recurrente ? env.stripeTrialDays : null,
          disponible: true,
        };
      } catch (err) {
        /* Un precio mal configurado no puede voltear la pantalla de planes: se
           muestra igual, sin el número, y el error queda logueado. */
        console.error(`[billing] No pude leer el precio del plan ${tier} (${priceId}):`, err);
        return { tier, amount: null, currency: null, interval: null, trialDays: null, disponible: false };
      }
    }),
  );

  catalogoCache = { ofertas, expires: Date.now() + CACHE_MS };
  return ofertas;
}

/** Vacía la caché del catálogo. Para los tests. */
export function clearPlanCatalogCache(): void {
  catalogoCache = null;
}

/**
 * Portal de cliente: donde el usuario cambia de tarjeta, ve facturas o
 * cancela. Lo maneja Stripe entero, así que no construimos nada de eso.
 */
export async function createPortalSession(userId: string): Promise<{ url: string }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) {
    throw new ApiError(
      400,
      'NO_CUSTOMER',
      'Todavía no tenés una cuenta de cobro. Suscribite al Pro primero.',
    );
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: appUrl('/?portal=ok'),
  });
  return { url: session.url };
}

/** Traduce el objeto de suscripción de Stripe a nuestros campos. */
function fromStripeSubscription(s: Stripe.Subscription): {
  plan: string;
  status: string;
  tier: PlanTier | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} {
  const item = s.items.data[0];
  const price = item?.price;
  return {
    /* El plan y el tier se deciden por el PRECIO, no por un flag escrito a
       mano. Es la misma regla para los tres: un id que no sea ninguno de
       nuestros da 'free', así que un precio mal configurado degrada a
       gratuito en vez de regalar Pro. */
    tier: tierFromPriceId(price?.id),
    plan: tierFromPriceId(price?.id) ? 'pro' : 'free',
    status: s.status,
    stripeSubscriptionId: s.id,
    stripePriceId: price?.id ?? null,
    /* `current_period_end` vive en el ITEM, no en la suscripción. Antes vivía
       en la suscripción y se movió; leerlo del lugar viejo devuelve undefined
       en silencio y la fecha de renovación nunca se guarda, con lo que el
       usuario no ve cuándo se le corta el Pro.

       Con más de un item se toma el FIN más tardío: es el que determina hasta
       cuándo sigue teniendo acceso. */
    currentPeriodEnd: (() => {
      const ends = s.items.data
        .map((i) => i.current_period_end)
        .filter((v): v is number => typeof v === 'number');
      if (ends.length === 0) return null;
      return new Date(Math.max(...ends) * 1000);
    })(),
    cancelAtPeriodEnd: s.cancel_at_period_end,
  };
}

/**
 * Resuelve el usuario de un evento de Stripe.
 *
 * Primero busca por el customer (que es lo que siempre viene), y si no lo
 * encuentra usa el metadata del propio evento. El segundo camino importa:
 * el webhook de `checkout.session.completed` llega con un customer que puede
 * no estar guardado todavía en nuestra base.
 */
async function resolveUserId(
  stripeCustomerId: string | undefined,
  metadata: Stripe.Metadata | null | undefined,
): Promise<string | null> {
  if (stripeCustomerId) {
    const byCustomer = await prisma.subscription.findUnique({
      where: { stripeCustomerId },
      select: { userId: true },
    });
    if (byCustomer) return byCustomer.userId;
  }
  const clerkId = metadata?.clerkUserId;
  if (clerkId) return clerkId;
  return null;
}

/**
 * Sincroniza una suscripción de Stripe hacia nuestra base.
 *
 * Devuelve el id del usuario afectado, o `null` si el evento no se pudo
 * atribuir a nadie. Eso se loguea: un evento huérfano significa que hay
 * usuarios pagando sin que les funcione el Pro, y hay que enterarse.
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackMetadata?: Stripe.Metadata | null,
): Promise<string | null> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const userId = await resolveUserId(
    customerId,
    subscription.metadata ?? fallbackMetadata,
  );
  if (!userId) {
    console.error(
      `[billing] No pude atribuir la suscripción ${subscription.id} a ningún usuario.`,
      { customerId, metadata: subscription.metadata },
    );
    return null;
  }

  const data = fromStripeSubscription(subscription);

  /* El de por vida no se degrada NUNCA.
   *
   * Un usuario que compró de por vida puede haber tenido antes una
   * suscripción mensual, cancelada hace tiempo. Si un webhook de esa
   * suscripción vieja llegara con retraso y aplicáramos su estado, le
   * quitaríamos el Pro que pagó de una sola vez y para siempre. Chequear
   * antes de escribir evita que un evento atrasado sea el que decide. */
  const actual = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, status: true, stripeSubscriptionId: true },
  });
  if (actual?.tier === 'lifetime') {
    console.warn(
      `[billing] La suscripción ${subscription.id} intentó cambiar el plan de un usuario ` +
        'que ya tiene Pro de por vida. Se ignora: no hay nada por encima de por vida.',
    );
    return userId;
  }

  /* Un evento de OTRA suscripción, ya muerta, no pisa la que está vigente.
   *
   * Pasa con un webhook atrasado: el usuario canceló el mensual, después se
   * suscribió al anual, y llega tarde un `updated` del mensual con estado
   * `canceled`. Sin esta comprobación, ese evento viejo sobrescribía la fila y
   * el usuario perdía el Pro que está pagando. Una suscripción nueva y viva sí
   * reemplaza a la guardada: es el caso normal de volver a suscribirse. */
  const esViva = (status: string) => limitsFor('pro', status) === PLAN_LIMITS.pro;
  if (
    actual?.stripeSubscriptionId &&
    actual.stripeSubscriptionId !== subscription.id &&
    esViva(actual.status) &&
    !esViva(subscription.status)
  ) {
    console.warn(
      `[billing] Se ignora la suscripción ${subscription.id} (${subscription.status}): ` +
        `el usuario ${userId} tiene vigente ${actual.stripeSubscriptionId}.`,
    );
    return userId;
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      id: `sub_${userId}`,
      userId,
      stripeCustomerId: customerId,
      ...data,
    },
    update: {
      stripeCustomerId: customerId,
      ...data,
    },
  });
  return userId;
}

/**
 * Marca la suscripción como cancelada.
 *
 * `status` pasa a "canceled" pero NO se borra la fila ni el plan: quedarse con
 * el histórico es lo que permite mostrar "fuiste Pro hasta el 3 de marzo" en
 * vez de borrar el pasado del usuario.
 */
export async function markCanceled(
  stripeSubscriptionId: string,
): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { userId: true },
  });
  if (!sub) {
    console.error(`[billing] Cancelación de una suscripción desconocida: ${stripeSubscriptionId}`);
    return null;
  }
  /* Igual que en `syncSubscription`: cancelar una suscripción vieja no le saca
     el Pro de por vida a alguien que ya lo pagó. */
  const actual = await prisma.subscription.findUnique({
    where: { userId: sub.userId },
    select: { tier: true },
  });
  if (actual?.tier === 'lifetime') {
    console.warn(
      `[billing] Llegó la cancelación de ${stripeSubscriptionId}, pero el usuario tiene ` +
        'Pro de por vida. Se ignora.',
    );
    return sub.userId;
  }

  await prisma.subscription.update({
    where: { userId: sub.userId },
    data: { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: null },
  });
  return sub.userId;
}

/** Verifica la firma de un webhook crudo. */
export function verifyWebhook(
  payload: Buffer,
  signature: string | undefined,
): Stripe.Event {
  if (!env.stripeWebhookSecret) {
    throw new ApiError(503, 'BILLING_NOT_CONFIGURED', 'No hay secreto de webhook configurado.');
  }
  if (!signature) {
    throw new ApiError(400, 'WEBHOOK_NO_SIGNATURE', 'Falta la firma del webhook.');
  }
  try {
    return stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch {
    /* Firma inválida: alguien está tratando de escribir en nuestra base a
       mano. No se distingue el error a propósito, para no ayudar a
       adivinar el formato. */
    throw new ApiError(400, 'WEBHOOK_BAD_SIGNATURE', 'La firma del webhook no es válida.');
  }
}

/**
 * Recupera una suscripción completa desde la API de Stripe.
 *
 * Hace falta porque los objetos que llegan en los webhooks vienen recortados:
 * no incluyen `items` con el precio, y el precio es de donde sale el plan. Sin
 * esto, el evento de `checkout.session.completed` guardaría plan "free" para
 * un usuario que acaba de pagar, y el Pro no se activaría hasta que llegara
 * otro evento.
 */
export async function retrieveSubscription(id: string): Promise<Stripe.Subscription> {
  return stripe().subscriptions.retrieve(id);
}

export { isStripeConfigured };
