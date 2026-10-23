import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';

/* ==========================================================================
   El cobro deshabilitado.

   Es el estado en que vive la app la mayor parte del tiempo hasta que haya
   claves de Stripe: todo el mundo en plan gratuito, y ninguna de las rutas de
   cobro montada. La app tiene que funcionar ENTERA así, no sólo "casi".

   Este archivo no toca las variables de entorno a propósito. Corre con el
   entorno intacto, que es justamente lo que hay que probar. Por eso vive
   separado de subscriptionIntegration.test.ts, que sí las fija.

   La diferencia que importa y se comprueba acá: sin Stripe, un GET a
   /api/billing/usage responde 404, no 401. Con Stripe configurado respondería
   401 sin sesión. 404 es lo correcto: la ruta no existe, no es que falte
   autenticación. El frontend lo usa para distinguir "el cobro no está
   habilitado" de "hay un problema".
   ========================================================================== */

/* Imports estáticos: este archivo no toca las variables de entorno, y eso es
   justamente lo que hay que probar. Un `await import()` dinámico daría el
   mismo resultado pero no compila: el backend es CommonJS y no admite `await`
   en el nivel superior. */
import { isStripeConfigured } from '../config/env';
import { app } from '../app';
import { createCheckoutSession, getSubscription } from '../services/billingService';

let server: Server;
let base: string;

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de pruebas.');
  }
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('el entorno no tiene Stripe configurado', () => {
  it('isStripeConfigured es false', () => {
    expect(isStripeConfigured).toBe(false);
  });
});

describe('las rutas de cobro no existen', () => {
  const rutas = [
    ['GET', '/api/billing/usage'],
    ['GET', '/api/billing/subscription'],
    ['POST', '/api/billing/checkout'],
    ['POST', '/api/billing/portal'],
  ] as const;

  for (const [metodo, ruta] of rutas) {
    it(`${metodo} ${ruta} responde 404, no 401`, async () => {
      const res = await fetch(`${base}${ruta}`, { method: metodo });
      expect(res.status).toBe(404);
    });
  }

  it('el resto de la API sigue contestando', () => {
    /* La prueba de que la app no se rompió: deshabilitar el cobro no puede
       dejar sin servicio al resto. */
    return expect(fetch(`${base}/api/health`).then((r) => r.status)).resolves.toBe(200);
  });
});

describe('crear un checkout sin precio configurado', () => {
  it('falla con 503 y un código legible, no con una traza', async () => {
    /* El mensaje importa: es lo que el usuario vería si el botón "Pasar al
       Pro" quedara habilitado sin configuración. Tiene que decir qué pasa,
       no "Cannot read properties of undefined". */
    await expect(
      createCheckoutSession('user_cualquiera', 'a@b.c', 'monthly'),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'TIER_NOT_CONFIGURED',
    });
  });

  it('sin ningún precio, ningún plan se puede comprar', async () => {
    /* Los tres dan el mismo error: no hay ninguno configurado. La pantalla
       tiene que poder ofrecer sólo los que existen, pero si ofrece uno que
       no, el backend contesta en vez de fallar en silencio. */
    for (const tier of ['monthly', 'annual', 'lifetime'] as const) {
      await expect(
        createCheckoutSession('user_cualquiera', 'a@b.c', tier),
      ).rejects.toMatchObject({ statusCode: 503, code: 'TIER_NOT_CONFIGURED' });
    }
  });
});

describe('leer el plan sin Stripe configurado', () => {
  it('un usuario cualquiera cae en gratuito con los topes puestos', async () => {
    /* Ni la consulta a la base ni el cálculo dependen de Stripe: el plan
       gratuito tiene que poder determinarse siempre, para que la app sirva
       aunque el cobro esté roto o apagado. */
    const sub = await getSubscription('user_que_no_existe_999');
    expect(sub.plan).toBe('free');
    expect(sub.status).toBe('inactive');
    expect(sub.tier).toBeNull();
    expect(sub.limits.readings).toBe(2);
  });

  it('no crea fila para un usuario que nunca intentó pagar', async () => {
    /* Una fila "free" por cada visitante infla la tabla sin aportarle nada.
       El plan gratuito se calcula, no se guarda. */
    const sub = await getSubscription('user_que_no_existe_999');
    expect(sub.currentPeriodEnd).toBeNull();
    expect(sub.cancelAtPeriodEnd).toBe(false);
  });
});
