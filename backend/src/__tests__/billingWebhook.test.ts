import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import Stripe from 'stripe';

/* Stripe configurado ANTES de cargar `config/env` (lo lee una sola vez). */
const CONFIG = vi.hoisted(() => {
  const c = {
    monthly: 'price_test_mensual_wh',
    annual: 'price_test_anual_wh',
    lifetime: 'price_test_vida_wh',
    webhookSecret: 'whsec_test_webhook_reintentos',
  };
  process.env.STRIPE_MONTHLY_PRICE_ID = c.monthly;
  process.env.STRIPE_ANNUAL_PRICE_ID = c.annual;
  process.env.STRIPE_LIFETIME_PRICE_ID = c.lifetime;
  process.env.STRIPE_SECRET_KEY = 'sk_test_falsa_solo_para_tests';
  process.env.STRIPE_WEBHOOK_SECRET = c.webhookSecret;
  return c;
});

import { app } from '../app';
import { prisma } from '../database/prisma';
import { getSubscription, syncSubscription } from '../services/billingService';

/* ==========================================================================
   El webhook de Stripe no pierde eventos, y una suscripción vieja no pisa la
   vigente.

   1. Si el procesamiento falla (la API de Stripe no contesta, la base está
      ocupada), la respuesta es 500 para que Stripe REINTENTE. Antes era 200
      siempre, y el evento se perdía: en el de por vida, el usuario pagaba y
      no recibía nada.
   2. Un evento atrasado de OTRA suscripción, ya cancelada, no puede
      sobrescribir la que el usuario está pagando ahora.

   La API de Stripe se simula caída: cualquier `fetch` que no vaya al servidor
   de pruebas falla. Las peticiones al propio servidor sí pasan.
   ========================================================================== */

const SELLO = Date.now();
let server: Server;
let base: string;
let usuario: { id: string };
const fetchReal = globalThis.fetch;

function firmar(payload: string): string {
  return new Stripe('sk_test_solo_para_firmar').webhooks.generateTestHeaderString({
    payload,
    secret: CONFIG.webhookSecret,
  });
}

async function enviarEvento(evento: object, firma?: string): Promise<number> {
  const cuerpo = JSON.stringify(evento);
  const res = await fetchReal(`${base}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': firma ?? firmar(cuerpo) },
    body: cuerpo,
  });
  return res.status;
}

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de pruebas.');
  }
  base = `http://127.0.0.1:${address.port}`;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(base)) return fetchReal(input, init);
    throw new TypeError('fetch failed: API de Stripe caída (simulada)');
  }) as typeof fetch;

  usuario = await prisma.user.create({
    data: { id: `user_wh_${SELLO}`, email: `wh_${SELLO}@test.local` },
  });
});

afterAll(async () => {
  globalThis.fetch = fetchReal;
  await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
  await prisma.user.deleteMany({ where: { id: usuario.id } });
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('4. el webhook pide reintento cuando el procesamiento falla', () => {
  it('compra de por vida con la API de Stripe caída: 500, no 200', async () => {
    const status = await enviarEvento({
      id: `evt_vida_${SELLO}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_vida_${SELLO}`, object: 'checkout.session', mode: 'payment' } },
    });
    expect(status).toBe(500);
  });

  it('un evento que no nos interesa se reconoce con 200', async () => {
    const status = await enviarEvento({
      id: `evt_otro_${SELLO}`,
      object: 'event',
      type: 'product.created',
      data: { object: { id: 'prod_x', object: 'product' } },
    });
    expect(status).toBe(200);
  });

  it('un reembolso parcial no hace nada y responde 200', async () => {
    /* Sólo el reembolso total consulta a Stripe; uno parcial no toca nada. */
    const status = await enviarEvento({
      id: `evt_ref_${SELLO}`,
      object: 'event',
      type: 'charge.refunded',
      data: { object: { id: 'ch_x', object: 'charge', refunded: false, payment_intent: 'pi_x' } },
    });
    expect(status).toBe(200);
  });

  it('una firma falsa sigue dando 400', async () => {
    const status = await enviarEvento(
      { id: 'evt_falso', object: 'event', type: 'product.created', data: { object: {} } },
      't=1,v1=firma_inventada',
    );
    expect(status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */

function suscripcion(id: string, status: string, priceId: string) {
  return {
    id,
    customer: `cus_wh_${SELLO}`,
    status,
    cancel_at_period_end: false,
    metadata: { clerkUserId: usuario.id },
    items: {
      data: [{ id: `si_${id}`, current_period_end: 1893456000, price: { id: priceId, object: 'price' } }],
    },
  } as never;
}

describe('6. una suscripción vieja no pisa la vigente', () => {
  it('el anual activo queda guardado', async () => {
    await syncSubscription(suscripcion(`sub_anual_${SELLO}`, 'active', CONFIG.annual));
    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('pro');
    expect(sub.tier).toBe('annual');
  });

  it('un evento atrasado del mensual cancelado se ignora', async () => {
    await syncSubscription(suscripcion(`sub_mensual_${SELLO}`, 'canceled', CONFIG.monthly));

    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('pro');
    expect(sub.tier).toBe('annual');
    const fila = await prisma.subscription.findUnique({ where: { userId: usuario.id } });
    expect(fila?.stripeSubscriptionId).toBe(`sub_anual_${SELLO}`);
  });

  it('la cancelación de la MISMA suscripción vigente sí se aplica', async () => {
    await syncSubscription(suscripcion(`sub_anual_${SELLO}`, 'canceled', CONFIG.annual));
    expect((await getSubscription(usuario.id)).plan).toBe('free');
  });

  it('una suscripción nueva y viva reemplaza a la cancelada', async () => {
    await syncSubscription(suscripcion(`sub_nueva_${SELLO}`, 'active', CONFIG.monthly));
    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('pro');
    expect(sub.tier).toBe('monthly');
  });
});
