import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

/* `config/env` lee las variables UNA vez, al importarse. El servicio compara
   el precio de cada item contra `STRIPE_PRO_PRICE_ID` para decidir si la
   suscripción es Pro, así que el test tiene que fijar esa variable ANTES de
   que se cargue el módulo. `vi.hoisted` corre antes que cualquier import;
   escribir `process.env` en el cuerpo del archivo ya sería tarde. */
const PRECIO_PRO = vi.hoisted(() => {
  const valor = 'price_test_mensual_123';
  process.env.STRIPE_MONTHLY_PRICE_ID = valor;
  /* También la secret: sin ella el cliente de Stripe no se puede construir y
     el servicio lanzaría al intentar usarlo. */
  process.env.STRIPE_SECRET_KEY = 'sk_test_falsa_solo_para_tests';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_falsa_solo_para_tests';
  return valor;
});

/* Import estático a propósito: el `vi.hoisted` de arriba ya se ejecutó, así que
   `config/env` lee las variables ya escritas. Un `await import()` dinámico
   sería equivalente pero no se puede usar acá: el backend compila a CommonJS
   y no admite `await` en el nivel superior. */
import { syncSubscription, markCanceled, getSubscription } from '../services/billingService';

/* ==========================================================================
   Integración de suscripciones contra la base real de desarrollo.

   Lo que se prueba acá es la parte que NO es lógica pura: que el webhook
   escriba los valores correctos en la tabla `subscriptions`, que la
   deduplicación funcione, y que un usuario no vea la suscripción de otro.

   La limpieza es agresiva a propósito: los ids llevan sufijo de prueba y se
   borran al terminar, así el test se puede correr las veces que haga falta
   sin ensuciar los datos.
   ========================================================================== */

const prisma = new PrismaClient();
const SUFIJO = '_test_sub';
// El id del precio ya lo define vi.hoisted, antes de cargar el módulo.

let usuarioA: { id: string; email: string };
let usuarioB: { id: string; email: string };

/**
 * Réplica de la forma que devuelve la API de Stripe.
 *
 * El `metadata.clerkUserId` va porque es lo que Stripe guarda cuando creamos
 * el checkout con `subscription_data.metadata`. Es el segundo camino para
 * resolver de quién es la suscripción: el primero es el `customer`, que
 *ya está guardado en nuestra base. Con los dos, un webhook de
 * `customer.subscription.updated` — que llega sin que hayamos pasado nada por
 * medio — se puede atribuir igual.
 */
function suscripciónStripe(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `sub_stripe${SUFIJO}`,
    customer: `cus_stripe${SUFIJO}`,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { clerkUserId: usuarioA.id },
    items: {
      data: [
        {
          id: `si${SUFIJO}`,
          current_period_end: 1767225600, // 2026-01-01T00:00:00Z
          price: { id: PRECIO_PRO, object: 'price' },
        },
      ],
    },
    ...over,
  } as never;
}

beforeAll(async () => {
  /* Usuarios propios de este archivo. Reutilizar los primeros de la base hacía
     que los tres archivos de integración se pisen entre ellos —el `afterAll` de
     uno borraba la suscripción que el otro estaba usando— y el fallo se veía
     como un error de clave primaria en un servicio que estaba bien. */
  const sello = Date.now();
  usuarioA = await prisma.user.create({
    data: { id: `user_tA${sello}`, email: `ta${sello}@test.local`, role: 'user' },
  });
  usuarioB = await prisma.user.create({
    data: { id: `user_tB${sello}`, email: `tb${sello}@test.local`, role: 'user' },
  });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { userId: { in: [usuarioA.id, usuarioB.id] } } });
  /* Sólo los usuarios de este archivo, y por id: ver la nota de
     lifetime.test.ts sobre por qué borrar por un predicado amplio rompe a los
     demás archivos de integración. */
  await prisma.user.deleteMany({ where: { id: { in: [usuarioA.id, usuarioB.id] } } });
  await prisma.$disconnect();
});

describe('el webhook escribe la suscripción en la base', () => {
  it('crea la fila y guarda plan, estado y fecha', async () => {
    const userId = await syncSubscription(suscripciónStripe());
    expect(userId).toBe(usuarioA.id);

    const fila = await prisma.subscription.findUnique({ where: { userId: usuarioA.id } });
    expect(fila?.plan).toBe('pro');
    expect(fila?.tier).toBe('monthly');
    expect(fila?.status).toBe('active');
    expect(fila?.stripeSubscriptionId).toBe(`sub_stripe${SUFIJO}`);
    expect(fila?.stripePriceId).toBe(PRECIO_PRO);
    /* La fecha de renovación es la que viene del ITEM, no de la suscripción. */
    expect(fila?.currentPeriodEnd).toEqual(new Date(1767225600 * 1000));
    expect(fila?.cancelAtPeriodEnd).toBe(false);
  });

  it('repetir el mismo evento no duplica la fila', async () => {
    /* Stripe reintenta los webhooks. Con `upsert` el reintento deja el mismo
       resultado, que es lo que evita que un cobro se procese dos veces. */
    /* El conteo va filtrado por los usuarios de ESTE archivo. Un conteo global
       depende de lo que dejaron otros archivos de prueba y de corridas
       anteriores, y falla sin que el código tenga nada que ver. */
    const losMios = { userId: { in: [usuarioA.id, usuarioB.id] } };
    const antes = await prisma.subscription.count({ where: losMios });
    await syncSubscription(suscripciónStripe());
    await syncSubscription(suscripciónStripe());
    const despues = await prisma.subscription.count({ where: losMios });
    expect(despues).toBe(antes);
  });

  it('actualiza el estado si el evento cambia', async () => {
    await syncSubscription(
      suscripciónStripe({ status: 'past_due', cancel_at_period_end: true }),
    );
    const fila = await prisma.subscription.findUnique({ where: { userId: usuarioA.id } });
    expect(fila?.status).toBe('past_due');
    expect(fila?.cancelAtPeriodEnd).toBe(true);
  });

  it('un evento sin metadata ni customer conocido se ignora sin romper', async () => {
    /* Devolver null y loguear es lo correcto: el evento no se puede atribuir
       y adivinar sería peor que descartarlo. */
    const r = await syncSubscription(
      suscripciónStripe({ customer: 'cus_inexistente_999', metadata: {} }),
    );
    expect(r).toBeNull();
  });
});

describe('los usuarios no se ven entre sí', () => {
  it('el segundo usuario sigue en free', async () => {
    const subB = await getSubscription(usuarioB.id);
    expect(subB.plan).toBe('free');
  });

  it('el primero quedó en pro', async () => {
    const subA = await getSubscription(usuarioA.id);
    expect(subA.plan).toBe('pro');
    expect(subA.tier).toBe('monthly');
    expect(subA.limits.readings).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('cancelación', () => {
  it('marca la suscripción como cancelada y conserva el plan', async () => {
    await syncSubscription(suscripciónStripe());
    const userId = await markCanceled(`sub_stripe${SUFIJO}`);
    expect(userId).toBe(usuarioA.id);

    const fila = await prisma.subscription.findUnique({ where: { userId: usuarioA.id } });
    expect(fila?.status).toBe('canceled');
    /* El plan NO se borra ni se baja a mano: el plan efectivo se recalcula
       desde plan+status. Así se puede mostrar "fuiste Pro hasta el 3 de marzo"
       en vez de borrar el pasado del usuario. */
    expect(fila?.plan).toBe('pro');

    /* Y el plan efectivo sí es free ahora. */
    const sub = await getSubscription(usuarioA.id);
    expect(sub.plan).toBe('free');
    expect(sub.limits.readings).toBe(2);
  });

  it('una suscripción desconocida devuelve null y no rompe', async () => {
    const r = await markCanceled('sub_que_no_existe_999');
    expect(r).toBeNull();
  });
});

/* El escenario "sin Stripe configurado" NO se puede probar acá: este archivo
   fija las variables con vi.hoisted para que el plan se resuelva como Pro. Vive
   en billingUnconfigured.test.ts, que corre con el entorno intacto. */
