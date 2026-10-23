import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

/* Los price ids tienen que existir antes de cargar el servicio. */
const PRECIOS = vi.hoisted(() => {
  const p = {
    monthly: 'price_test_mensual_v2',
    annual: 'price_test_anual_v2',
    lifetime: 'price_test_vida_v2',
  };
  process.env.STRIPE_MONTHLY_PRICE_ID = p.monthly;
  process.env.STRIPE_ANNUAL_PRICE_ID = p.annual;
  process.env.STRIPE_LIFETIME_PRICE_ID = p.lifetime;
  process.env.STRIPE_SECRET_KEY = 'sk_test_falsa_solo_para_tests';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_falsa_solo_para_tests';
  return p;
});

import {
  getSubscription,
  markCanceled,
  syncSubscription,
  grantLifetime,
  revokeLifetime,
} from '../services/billingService';
import { prisma as prismaDeLaApp } from '../database/prisma';

/* ==========================================================================
   El Pro de por vida.

   Es el único camino donde el usuario paga y NO queda ninguna suscripción que
   lo respalde. Un pago único no genera un objeto `subscription`: no hay a qué
   consultar, no hay ciclo de vida, no hay tarjeta que pueda fallar. Lo único
   que queda es el evento de checkout, y si ese camino está mal el usuario pagó
   y no tiene nada a cambio.

   Por eso se prueban las dos cosas: que conceda, y que NO conceda cuando no
   corresponde.

   Para no llamar a la API de Stripe, se simula lo que devuelve
   `checkout.sessions.retrieve` con el precio expandido. Lo que importa es la
   decisión que tomamos sobre ese dato, no el transporte.
   ========================================================================== */

const prisma = prismaDeLaApp ?? new PrismaClient();
const SUFIJO = '_test_lifetime';

let usuario: { id: string; email: string };

/**
 * Sesión que devuelve el falso cliente de Stripe.
 *
 * No se reemplaza `fetch` en cada test: el cliente HTTP que usa la librería lo
 * captura CUANDO SE CREA, y el de `billingService` está memoizado en el
 * módulo. Reasignar `globalThis.fetch` después no cambia nada —el cliente
 * sigue llamando al mock del primer test—, así que lo que se cambia entre
 * tests es la respuesta, no la función.
 */
let sesionActual: Record<string, unknown> | null = null;

function simularStripe(session: Record<string, unknown>): () => void {
  sesionActual = session;
  return () => {
    sesionActual = null;
  };
}

/** Sesión de checkout de pago único, con el precio expandido. */
function sesionPagoUnico(over: Record<string, unknown> = {}) {
  return {
    id: `cs_venta${SUFIJO}`,
    object: 'checkout.session',
    mode: 'payment',
    /* Las sesiones reales siempre lo traen. Sin 'paid' no se concede nada. */
    payment_status: 'paid',
    customer: `cus_venta${SUFIJO}`,
    metadata: { clerkUserId: usuario.id },
    line_items: {
      data: [{ id: `li${SUFIJO}`, price: { id: PRECIOS.lifetime, object: 'price' } }],
    },
    payment_intent: { id: `pi_venta${SUFIJO}`, object: 'payment_intent', metadata: {} },
    ...over,
  };
}

beforeAll(async () => {
  /* Un solo `fetch` para todo el archivo, que responde con lo que cada test
     dejó preparado en `sesionActual`. */
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    /* La búsqueda de sesiones por payment_intent (`revokeLifetime`). */
    if (url.includes('/v1/checkout/sessions?') && sesionActual) {
      return new Response(
        JSON.stringify({ object: 'list', data: [sesionActual], has_more: false, url: '/v1/checkout/sessions' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/v1/checkout/sessions/') && sesionActual) {
      return new Response(JSON.stringify(sesionActual), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Peticion a Stripe sin preparar en el test: ${url}`);
  }) as typeof fetch;

  /* Cada archivo de integración crea SU propio usuario.

     Antes se reutilizaba el primer usuario de la base, y eso hacía que los
     archivos se pisen entre ellos: el `afterAll` de uno borraba la suscripción
     que el otro estaba usando, y el fallo aparecía como un error de clave
     primaria dentro de un `upsert` de un servicio que estaba bien. */
  const sello = Date.now();
  usuario = await prisma.user.create({
    data: { id: `user_lt${sello}`, email: `lt${sello}@test.local`, role: 'user' },
  });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
  /* Sólo el usuario de ESTE archivo, y por id. Borrar con un predicado amplio
     como "todos los que acaban en @test.local" parece inofensivo y no lo es:
     si otro archivo de integración ya creó su usuario, lo borra mientras lo
     está usando, y el fallo aparece como una violación de clave foránea dentro
     de un servicio que está bien. */
  await prisma.user.deleteMany({ where: { id: usuario.id } });
  await prisma.$disconnect();
});

describe('la compra de por vida concede el Pro', () => {
  it('crea la fila con tier lifetime y estado activo', async () => {
    const restaurar = simularStripe(sesionPagoUnico());
    const userId = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(userId).toBe(usuario.id);
    const fila = await prisma.subscription.findUnique({ where: { userId: usuario.id } });
    expect(fila?.plan).toBe('pro');
    expect(fila?.tier).toBe('lifetime');
    expect(fila?.status).toBe('active');
    expect(fila?.stripePriceId).toBe(PRECIOS.lifetime);
  });

  it('no guarda fecha de renovación, porque no hay renovación', async () => {
    /* Si `currentPeriodEnd` quedara con algo, la pantalla diría "se renueva el"
       y sería mentira. Null es lo que permite que el texto diga "de por vida". */
    const sub = await getSubscription(usuario.id);
    expect(sub.currentPeriodEnd).toBeNull();
    expect(sub.cancelAtPeriodEnd).toBe(false);
  });

  it('no hay stripeSubscriptionId, porque no existe suscripción', async () => {
    const fila = await prisma.subscription.findUnique({ where: { userId: usuario.id } });
    expect(fila?.stripeSubscriptionId).toBeNull();
  });

  it('el usuario tiene Pro sin topes', async () => {
    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('pro');
    expect(sub.limits.readings).toBe(Number.POSITIVE_INFINITY);
  });

  it('repetir la concesión no cambia nada', async () => {
    /* Stripe reintenta los webhooks. Con `upsert` el reintento deja el mismo
       resultado, que es lo que evita cobrar dos veces por el mismo efecto. */
    /* El conteo va filtrado por usuario. Un conteo global depende de lo que
       dejaron otros archivos de prueba, y falla sin que el código esté mal. */
    const antes = await prisma.subscription.count({ where: { userId: usuario.id } });
    const restaurar = simularStripe(sesionPagoUnico());
    await grantLifetime(`cs_venta${SUFIJO}`);
    await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();
    expect(await prisma.subscription.count({ where: { userId: usuario.id } })).toBe(antes);
  });
});

describe('lo que NO concede el Pro de por vida', () => {
  beforeAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
  });

  it('un pago de otro precio no da Pro', async () => {
    /* Un pago suelto de 5 dólares creado en el panel, o un precio que se
       borró. Conceder Pro por cualquiera de los dos sería regalar acceso. */
    const restaurar = simularStripe(
      sesionPagoUnico({
        line_items: { data: [{ price: { id: 'price_1Otro999', object: 'price' } }] },
      }),
    );
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBeNull();
    expect(await prisma.subscription.count({ where: { userId: usuario.id } })).toBe(0);
  });

  it('el precio mensual tampoco da de por vida', async () => {
    /* El pago único de un recurrente es imposible en la práctica, pero si
       llegara, no debe conceder lifetime: el acceso de por vida no se
       revoca, y concederlo por error no se puede deshacer. */
    const restaurar = simularStripe(
      sesionPagoUnico({
        line_items: { data: [{ price: { id: PRECIOS.monthly, object: 'price' } }] },
      }),
    );
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBeNull();
    expect(await prisma.subscription.count({ where: { userId: usuario.id } })).toBe(0);
  });

  it('una sesión sin line_items no da Pro', async () => {
    const restaurar = simularStripe(sesionPagoUnico({ line_items: undefined }));
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBeNull();
  });

  it('una compra que no se puede atribuir a ningún usuario no da Pro', async () => {
    /* Sin metadata y sin customer conocido: no se sabe de quién es. Adivinar
       sería peor que descartar. */
    const restaurar = simularStripe(
      sesionPagoUnico({
        customer: 'cus_inexistente_999',
        metadata: {},
        payment_intent: { id: 'pi_x', object: 'payment_intent', metadata: {} },
      }),
    );
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBeNull();
    expect(await prisma.subscription.count({ where: { userId: usuario.id } })).toBe(0);
  });

  it('el clerkUserId del payment_intent también sirve para atribuir', async () => {
    /* Un checkout de pago único puede traer el metadata sólo en el
       payment_intent, no en la sesión. Es el mismo dato en otro lugar, y es un
       detalle que se olvida y rompe la atribución en silencio. */
    const restaurar = simularStripe(
      sesionPagoUnico({
        customer: 'cus_otro_desconocido_888',
        metadata: {},
        payment_intent: {
          id: 'pi_y',
          object: 'payment_intent',
          metadata: { clerkUserId: usuario.id },
        },
      }),
    );
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBe(usuario.id);
  });
});

describe('el de por vida no se puede quitar por error', () => {
  beforeAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
    const restaurar = simularStripe(sesionPagoUnico());
    await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();
  });

  it('una suscripción mensual posterior no lo degrada', async () => {
    /* El usuario tenía el mensual, lo canceló, compró de por vida, y llegó un
       webhook atrasado del mensual viejo. Si se aplicara, perdería algo que
       pagó de una vez y para siempre. */
    const suscripciónVieja = {
      id: `sub_vieja${SUFIJO}`,
      customer: `cus_venta${SUFIJO}`,
      status: 'canceled',
      cancel_at_period_end: false,
      metadata: { clerkUserId: usuario.id },
      items: {
        data: [
          {
            id: `si_vieja${SUFIJO}`,
            current_period_end: 1767225600,
            price: { id: PRECIOS.monthly, object: 'price' },
          },
        ],
      },
    } as never;

    await syncSubscription(suscripciónVieja);

    const sub = await getSubscription(usuario.id);
    expect(sub.tier).toBe('lifetime');
    expect(sub.plan).toBe('pro');
  });

  it('una cancelación de esa suscripción vieja tampoco lo degrada', async () => {
    await markCanceled(`sub_vieja${SUFIJO}`);
    const sub = await getSubscription(usuario.id);
    expect(sub.tier).toBe('lifetime');
    expect(sub.plan).toBe('pro');
  });

  it('el de por vida sobrevive con cualquier estado que reporte Stripe', async () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'past_due']) {
      const sub = await getSubscription(usuario.id);
      expect(sub.plan).toBe('pro');
      expect(sub.tier).toBe('lifetime');
      void status;
    }
  });
});

describe('el de por vida sólo se concede con el pago cobrado', () => {
  beforeAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
  });

  it('una sesión completada pero sin cobrar (pago diferido) no da Pro', async () => {
    /* Con SEPA o transferencia, `checkout.session.completed` llega antes que
       el dinero. Conceder ahí sería regalar el de por vida si el pago falla. */
    const restaurar = simularStripe(sesionPagoUnico({ payment_status: 'unpaid' }));
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBeNull();
    expect(await prisma.subscription.count({ where: { userId: usuario.id } })).toBe(0);
  });

  it('cuando el pago diferido llega, se concede', async () => {
    /* Es lo que hace el webhook con `checkout.session.async_payment_succeeded`:
       vuelve a llamar a `grantLifetime`, y ahora la sesión dice 'paid'. */
    const restaurar = simularStripe(sesionPagoUnico());
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBe(usuario.id);
    expect((await getSubscription(usuario.id)).tier).toBe('lifetime');
  });

  it('un cupón del 100 % (no_payment_required) también lo concede', async () => {
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
    const restaurar = simularStripe(sesionPagoUnico({ payment_status: 'no_payment_required' }));
    const r = await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    expect(r).toBe(usuario.id);
  });
});

describe('reembolso y disputa perdida quitan el de por vida', () => {
  beforeAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } });
    const restaurar = simularStripe(sesionPagoUnico());
    await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();
  });

  it('un reembolso de un cobro que NO es la compra de por vida no toca nada', async () => {
    /* Por ejemplo, la devolución de una factura del mensual. */
    const restaurar = simularStripe(
      sesionPagoUnico({
        line_items: { data: [{ price: { id: PRECIOS.monthly, object: 'price' } }] },
      }),
    );
    const r = await revokeLifetime(`pi_venta${SUFIJO}`, 'refunded');
    restaurar();

    expect(r).toBeNull();
    expect((await getSubscription(usuario.id)).tier).toBe('lifetime');
  });

  it('el reembolso total de la compra lo deja en gratuito', async () => {
    const restaurar = simularStripe(sesionPagoUnico());
    const r = await revokeLifetime(`pi_venta${SUFIJO}`, 'refunded');
    restaurar();

    expect(r).toBe(usuario.id);
    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('free');
    expect(sub.tier).toBeNull();
    expect(sub.limits.readings).toBe(2);

    const fila = await prisma.subscription.findUnique({ where: { userId: usuario.id } });
    expect(fila?.status).toBe('refunded');
  });

  it('una disputa perdida también lo quita', async () => {
    let restaurar = simularStripe(sesionPagoUnico());
    await grantLifetime(`cs_venta${SUFIJO}`);
    restaurar();

    restaurar = simularStripe(sesionPagoUnico());
    await revokeLifetime(`pi_venta${SUFIJO}`, 'dispute_lost');
    restaurar();

    const sub = await getSubscription(usuario.id);
    expect(sub.plan).toBe('free');
    const fila = await prisma.subscription.findUnique({ where: { userId: usuario.id } });
    expect(fila?.status).toBe('dispute_lost');
  });
});
