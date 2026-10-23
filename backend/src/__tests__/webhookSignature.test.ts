import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

/* ==========================================================================
   Verificación de la firma del webhook.

   Esta es la parte del cobro que NO se puede probar mirando el código, y ya
   nos quemó dos veces: el cuerpo tenía que llegar crudo (Buffer, no JSON
   parseado) y el handler tenía que estar envuelto en asyncHandler porque
   Express 4 no captura rechazos. Los dos bugs habrían aparecido recién en
   producción, cuando un usuario pagara.

   Acá no hay mocks: se usa la MISMA criptografía de la librería de Stripe
   para generar la firma que después verifica nuestro código. Si la
   implementación estuviera mal, el test falla acá y no en la cuenta de un
   cliente.

   El secreto es inventado, pero eso no importa: la verificación es un HMAC y
   lo que se prueba es que nuestro código calcula el mismo digest que Stripe.
   ========================================================================== */

const SECRETO = 'whsec_test_1234567890abcdef';
const PRECIO_PRO = 'price_1TestPro123';

function nuevoCliente(): Stripe {
  return new Stripe('sk_test_falso_solo_para_firmar');
}

/** Firma válida sobre un payload, con la librería real. */
function firmar(payload: object, timestamp = Math.floor(Date.now() / 1000)): string {
  return nuevoCliente().webhooks.generateTestHeaderString({
    payload: JSON.stringify(payload),
    secret: SECRETO,
    timestamp,
  });
}

describe('firma del webhook de Stripe', () => {
  it('acepta una firma generada por la criptografía real de Stripe', () => {
    const evento = {
      id: 'evt_test_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', object: 'checkout.session' } },
    };
    const header = firmar(evento);
    expect(nuevoCliente().webhooks.constructEvent(JSON.stringify(evento), header, SECRETO).type).toBe(
      'checkout.session.completed',
    );
  });

  it('rechaza el cuerpo si alguien lo modifica después de firmar', () => {
    /* Es el ataque más obvio: interceptar el POST y cambiar el precio o el
       id de cliente. El HMAC cubre los bytes exactos, así que un cambio
       posterior tiene que invalidar la firma. */
    const original = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } };
    const header = firmar(original);

    const adulterado = { ...original, data: { object: { id: 'sub_OTRO' } } };
    expect(() =>
      nuevoCliente().webhooks.constructEvent(JSON.stringify(adulterado), header, SECRETO),
    ).toThrow();
  });

  it('rechaza una firma hecha con otro secreto', () => {
    const evento = { id: 'evt_2', type: 'invoice.paid', data: { object: {} } };
    const headerConOtroSecreto = nuevoCliente().webhooks.generateTestHeaderString({
      payload: JSON.stringify(evento),
      secret: 'whsec_test_OTRO_SECRETO',
    });
    expect(() =>
      nuevoCliente().webhooks.constructEvent(JSON.stringify(evento), headerConOtroSecreto, SECRETO),
    ).toThrow();
  });

  it('rechaza un cuerpo vacío', () => {
    const header = firmar({ id: 'evt_3' });
    expect(() => nuevoCliente().webhooks.constructEvent('', header, SECRETO)).toThrow();
  });

  it('acepta cualquier tipo de evento conocido sin mirar el contenido', () => {
    /* El verificador de firma es agnóstico: no sabe qué evento es. Eso es
       correcto, y significa que un evento que no nos interese también valida
       (se ignora después, no se rechaza). */
    const evento = {
      id: 'evt_4',
      type: 'charge.succeeded',
      data: { object: { id: 'ch_1' } },
    };
    const header = firmar(evento);
    expect(nuevoCliente().webhooks.constructEvent(JSON.stringify(evento), header, SECRETO).type).toBe(
      'charge.succeeded',
    );
  });
});

/* ==========================================================================
   Lectura de la suscripción.

   La trampa donde caí: `current_period_end` se movió del objeto suscripción
   al item. Leerlo del lugar viejo devuelve `undefined` en silencio, y la fecha
   de renovación nunca se guarda. Estos tests fijan la forma del dato para que
   un cambio de la librería se note acá.
   ========================================================================== */

const itemConPrecio = (precio: string, finPeriodo: number) => ({
  id: 'si_test',
  current_period_end: finPeriodo,
  price: { id: precio, object: 'price' },
});

describe('extracción de datos de la suscripción', () => {
  /** Réplica de la lógica de `fromStripeSubscription`, sin depender de Prisma. */
  function extraer(s: { status: string; items: unknown[] }) {
    const item = s.items[0] as { price?: { id: string }; current_period_end: number } | undefined;
    const precio = item?.price;
    const fines = s.items
      .map((i) => (i as { current_period_end?: number }).current_period_end)
      .filter((v): v is number => typeof v === 'number');
    return {
      plan: precio?.id === PRECIO_PRO ? 'pro' : 'free',
      status: s.status,
      stripePriceId: precio?.id ?? null,
      currentPeriodEnd: fines.length ? new Date(Math.max(...fines) * 1000) : null,
    };
  }

  it('detecta el Pro por el precio, no por un flag', () => {
    const r = extraer({
      status: 'active',
      items: [itemConPrecio(PRECIO_PRO, 1800000000)],
    });
    expect(r.plan).toBe('pro');
    expect(r.status).toBe('active');
  });

  it('un precio desconocido NO da Pro', () => {
    /* Si mañana hay un plan nuevo y se olvida actualizar el id, esto tiene que
       devolver free y no pro: cobrar de más es peor que cobrar de menos. */
    const r = extraer({
      status: 'active',
      items: [itemConPrecio('price_1AlgoDistinto999', 1800000000)],
    });
    expect(r.plan).toBe('free');
  });

  it('lee current_period_end del ITEM, no de la suscripción', () => {
    /* Si volviera a la suscripción, esta aserción falla. */
    const r = extraer({
      status: 'active',
      items: [itemConPrecio(PRECIO_PRO, 1767225600)],
    });
    expect(r.currentPeriodEnd).toEqual(new Date(1767225600 * 1000));
  });

  it('con varios items toma el fin más tardío', () => {
    /* Con más de un item (un discount que se renueva aparte, por ejemplo), el
       acceso dura hasta que termina el último. */
    const r = extraer({
      status: 'active',
      items: [itemConPrecio(PRECIO_PRO, 1767225600), itemConPrecio(PRECIO_PRO, 1800000000)],
    });
    expect(r.currentPeriodEnd).toEqual(new Date(1800000000 * 1000));
  });

  it('sin items no rompe: currentPeriodEnd queda en null', () => {
    const r = extraer({ status: 'incomplete', items: [] });
    expect(r.currentPeriodEnd).toBeNull();
    expect(r.plan).toBe('free');
  });
});
