import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { Webhook } from 'svix';

/* Secretos de prueba ANTES de cargar `config/env` (lo lee una sola vez). */
const SECRETO_CLERK = vi.hoisted(() => {
  const s = 'whsec_' + Buffer.from('secreto-de-prueba-clerk-1234567890').toString('base64');
  process.env.CLERK_WEBHOOK_SECRET = s;
  process.env.STRIPE_SECRET_KEY = 'sk_test_falsa_solo_para_tests';
  return s;
});

/* Clerk simulado: borrar una cuenta de verdad en un test sería un desastre. */
const clerk = vi.hoisted(() => ({ deleteUser: vi.fn(async (_id: string) => ({})) }));
vi.mock('@clerk/express', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clerk/express')>();
  return {
    ...original,
    clerkClient: { users: { deleteUser: clerk.deleteUser, getUser: vi.fn() } },
  };
});

import { app } from '../app';
import { prisma } from '../database/prisma';
import { borrarCuenta, sincronizarUsuario, type DatosDeClerk } from '../services/accounts';

/* ==========================================================================
   Cuentas de usuario y Clerk.

   7. El webhook de Clerk verifica la firma sobre el cuerpo CRUDO. Antes lo
      hacía sobre `JSON.stringify(req.body)`, y un JSON con otro formato (con
      espacios, con "é" sin escapar) no pasaba la verificación.
   8. Una cuenta nueva sólo reutiliza una fila existente con un email
      VERIFICADO, y nunca hereda el rol de admin.
   9. Borrar una cuenta cancela antes su suscripción en Stripe, y desde el
      panel también la borra en Clerk.

   La API de Stripe se simula con `fetch`; las peticiones al servidor de
   pruebas pasan sin tocar.
   ========================================================================== */

const SELLO = Date.now();
let server: Server;
let base: string;
const fetchReal = globalThis.fetch;

/** Lo que contesta la API de Stripe simulada al cancelar. */
let respuestaStripe: { status: number; body: unknown } = { status: 200, body: {} };
const cancelaciones: string[] = [];
const creados: string[] = [];

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
    const m = url.match(/\/v1\/subscriptions\/([^/?]+)/);
    if (m && (init?.method ?? 'GET').toUpperCase() === 'DELETE') {
      cancelaciones.push(m[1]);
      return new Response(JSON.stringify(respuestaStripe.body), {
        status: respuestaStripe.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Petición sin preparar en el test: ${url}`);
  }) as typeof fetch;
});

beforeEach(() => {
  cancelaciones.length = 0;
  clerk.deleteUser.mockClear();
  clerk.deleteUser.mockImplementation(async () => ({}));
  respuestaStripe = { status: 200, body: { id: 'sub', object: 'subscription', status: 'canceled' } };
});

afterAll(async () => {
  globalThis.fetch = fetchReal;
  await prisma.user.deleteMany({ where: { id: { in: creados } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `_${SELLO}@test.local` } } });
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

/** Usuario de Clerk con un email, verificado o no. */
function datos(id: string, email: string, verificado: boolean): DatosDeClerk {
  creados.push(id);
  return {
    id,
    emails: [{ id: `idn_${id}`, address: email, verified: verificado }],
    primaryEmailId: `idn_${id}`,
    name: 'Prueba',
    imageUrl: null,
  };
}

/* -------------------------------------------------------------------------- */

describe('7. el webhook de Clerk verifica la firma sobre el cuerpo crudo', () => {
  const firmar = (cuerpo: string) => {
    const id = `msg_${SELLO}_${Math.random().toString(36).slice(2)}`;
    const ahora = new Date();
    return {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(ahora.getTime() / 1000)),
      'svix-signature': new Webhook(SECRETO_CLERK).sign(id, ahora, cuerpo),
    };
  };

  /* JSON con formato que `JSON.stringify` NO reproduce: sangría y una "é"
     sin escapar. Con la verificación vieja, esto fallaba. */
  const evento = (tipo: string, id: string, nombre: string) =>
    JSON.stringify(
      {
        type: tipo,
        data: {
          id,
          first_name: nombre,
          last_name: null,
          image_url: null,
          primary_email_address_id: `idn_${id}`,
          email_addresses: [
            { id: `idn_${id}`, email_address: `${id}_${SELLO}@test.local`, verification: { status: 'verified' } },
          ],
        },
      },
      null,
      2,
    );

  const id = `user_wh_clerk_${SELLO}`;

  it('acepta un user.created con formato propio y crea la fila', async () => {
    creados.push(id);
    const cuerpo = evento('user.created', id, 'José');
    const res = await fetchReal(`${base}/api/webhooks/clerk`, {
      method: 'POST',
      headers: firmar(cuerpo),
      body: cuerpo,
    });
    expect(res.status).toBe(200);
    const fila = await prisma.user.findUnique({ where: { id } });
    expect(fila?.name).toBe('José');
    expect(fila?.email).toBe(`${id}_${SELLO}@test.local`);
  });

  it('user.updated actualiza el nombre', async () => {
    const cuerpo = evento('user.updated', id, 'José María');
    const res = await fetchReal(`${base}/api/webhooks/clerk`, {
      method: 'POST',
      headers: firmar(cuerpo),
      body: cuerpo,
    });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id } }))?.name).toBe('José María');
  });

  it('un cuerpo modificado después de firmar da 400', async () => {
    const cuerpo = evento('user.updated', id, 'Original');
    const res = await fetchReal(`${base}/api/webhooks/clerk`, {
      method: 'POST',
      headers: firmar(cuerpo),
      body: cuerpo.replace('Original', 'Cambiado'),
    });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id } }))?.name).toBe('José María');
  });

  it('user.deleted borra la fila sin llamar a Clerk (la cuenta ya no existe allá)', async () => {
    const cuerpo = JSON.stringify({ type: 'user.deleted', data: { id, deleted: true } });
    const res = await fetchReal(`${base}/api/webhooks/clerk`, {
      method: 'POST',
      headers: firmar(cuerpo),
      body: cuerpo,
    });
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(clerk.deleteUser).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */

describe('8. una cuenta nueva no hereda la fila de otra por un email sin verificar', () => {
  const email = `admin_${SELLO}@test.local`;
  const idAdmin = `user_admin_${SELLO}`;

  beforeAll(async () => {
    creados.push(idAdmin);
    await prisma.user.create({ data: { id: idAdmin, email, role: 'admin' } });
  });

  it('con el email SIN verificar, se crea una fila aparte y el admin no se toca', async () => {
    const intruso = await sincronizarUsuario(datos(`user_intruso_${SELLO}`, email, false));

    expect(intruso.id).toBe(`user_intruso_${SELLO}`);
    expect(intruso.role).toBe('user');
    expect(intruso.email).not.toBe(email);
    expect((await prisma.user.findUnique({ where: { id: idAdmin } }))?.role).toBe('admin');
  });

  it('con el email verificado se reutiliza la fila, pero sin el rol de admin', async () => {
    const misma = await sincronizarUsuario(datos(`user_nueva_cuenta_${SELLO}`, email, true));

    expect(misma.id).toBe(idAdmin);
    expect(misma.role).toBe('user');
  });

  it('un usuario nuevo con email verificado se crea con ese email', async () => {
    const id = `user_nuevo_${SELLO}`;
    const u = await sincronizarUsuario(datos(id, `nuevo_${SELLO}@test.local`, true));
    expect(u.id).toBe(id);
    expect(u.email).toBe(`nuevo_${SELLO}@test.local`);
  });
});

/* -------------------------------------------------------------------------- */

describe('9. borrar una cuenta cancela el cobro y la borra en Clerk', () => {
  async function usuarioCon(sufijo: string, sub?: { tier: string; status: string }) {
    const id = `user_borrar_${sufijo}_${SELLO}`;
    creados.push(id);
    await prisma.user.create({ data: { id, email: `${sufijo}_${SELLO}@test.local` } });
    if (sub) {
      await prisma.subscription.create({
        data: {
          id: `sub_${id}`,
          userId: id,
          stripeCustomerId: `cus_${id}`,
          stripeSubscriptionId: `sub_stripe_${id}`,
          plan: 'pro',
          ...sub,
        },
      });
    }
    return id;
  }

  it('con una suscripción mensual activa: la cancela, borra en Clerk y borra la fila', async () => {
    const id = await usuarioCon('mensual', { tier: 'monthly', status: 'active' });
    await borrarCuenta(id, { borrarEnClerk: true });

    expect(cancelaciones).toEqual([`sub_stripe_${id}`]);
    expect(clerk.deleteUser).toHaveBeenCalledWith(id);
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it('el de por vida no tiene nada que cancelar', async () => {
    const id = await usuarioCon('vida', { tier: 'lifetime', status: 'active' });
    await borrarCuenta(id, { borrarEnClerk: true });

    expect(cancelaciones).toEqual([]);
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it('si Stripe no puede cancelar, NO se borra la cuenta', async () => {
    /* Mejor un usuario que sigue existiendo que uno borrado al que se le
       sigue cobrando. */
    const id = await usuarioCon('fallo', { tier: 'annual', status: 'active' });
    respuestaStripe = {
      status: 400,
      body: { error: { type: 'invalid_request_error', code: 'otro_error', message: 'falló' } },
    };

    await expect(borrarCuenta(id, { borrarEnClerk: true })).rejects.toBeTruthy();
    expect(await prisma.user.findUnique({ where: { id } })).not.toBeNull();
    expect(clerk.deleteUser).not.toHaveBeenCalled();
  });

  it('una suscripción que Stripe ya no conoce cuenta como cancelada', async () => {
    const id = await usuarioCon('perdida', { tier: 'monthly', status: 'active' });
    respuestaStripe = {
      status: 404,
      body: { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such subscription' } },
    };

    await borrarCuenta(id, { borrarEnClerk: true });
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it('si la cuenta ya no existe en Clerk (404), igual se borra la fila', async () => {
    const id = await usuarioCon('sinclerk');
    clerk.deleteUser.mockImplementation(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });

    await borrarCuenta(id, { borrarEnClerk: true });
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });
});
