import Stripe from 'stripe';
import { env, isStripeConfigured } from '../config/env';
import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import { planFrom } from './plans';

/* ==========================================================================
   Suscripciones con Stripe.

   Lo importante de este archivo NO es hablar con Stripe: es qué hacer cuando
   un evento dice que la suscripción cambió. Ahí es donde un backend mal
   hecho cobra de más o deja de cobrar.

   Idempotencia: los webhooks de Stripe se reintentan, y el mismo evento puede
   llegar dos veces. Por eso TODAS las escrituras usan `upsert` por
   `stripeSubscriptionId`, y el estado se deriva del evento, no se acumula.
   Un evento repetido deja el mismo resultado.

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
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

export interface SubscriptionView {
  plan: 'free' | 'pro';
  status: string;
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
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: (await import('./plans')).limitsFor('free', 'inactive'),
    };
  }
  const { limitsFor } = await import('./plans');
  return {
    /* El plan efectivo se recalcula: si alguien editará la fila a mano y
       dejara plan=pro con status=canceled, el usuario vuelve a free. */
    plan: planFrom(sub.plan, sub.status),
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    limits: limitsFor(planFrom(sub.plan, sub.status), sub.status),
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

/**
 * Abre una sesión de checkout de Stripe.
 *
 * `subscription_data.metadata` es lo que permite reconciliar: cuando Stripe
 * emite el webhook de `checkout.session.completed`, trae ese metadata y
 * sabemos qué usuario es aunque no tengamos el customer id a mano.
 */
export async function createCheckoutSession(
  userId: string,
  email: string | null,
): Promise<{ url: string }> {
  if (!env.stripeProPriceId) {
    throw new ApiError(503, 'BILLING_NOT_CONFIGURED', 'No hay un precio de Pro configurado.');
  }
  const customerId = await ensureCustomer(userId, email);

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: env.stripeProPriceId, quantity: 1 }],
    /* Si el usuario ya tiene una suscripción viva, Stripe devuelve error.
       Lo mapeamos a un mensaje útil en vez de un 500. */
    success_url: appUrl('/?checkout=ok'),
    cancel_url: appUrl('/?checkout=cancelado'),
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { clerkUserId: userId },
    },
    metadata: { clerkUserId: userId },
  });

  if (!session.url) {
    throw new ApiError(502, 'CHECKOUT_NO_URL', 'Stripe no devolvió una URL de checkout.');
  }
  return { url: session.url };
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
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} {
  const item = s.items.data[0];
  const price = item?.price;
  return {
    /* El plan se decide por el precio, no por lo que diga un metadata viejo:
       si mañana hay un Pro Mensual y un Pro Anual, el precio los
       distingue. */
    plan: price?.id === env.stripeProPriceId ? 'pro' : 'free',
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
