import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { app } from '../app';
import { enforceLimit } from '../middleware/planLimits';
import { upsertUserDeck, upsertUserSpread, upsertUserRitual } from '../services/userService';
import { PLAN_LIMITS } from '../services/plans';

/* ==========================================================================
   Tres agujeros que se cerraron juntos.

   1. Las rutas de escritura del contenido editorial (/api/cards,
      /api/spreads, /api/combinations) no pedían sesión: cualquiera podía
      borrar una carta con un curl.
   2. `enforceLimit` era un middleware async sin `asyncHandler`: el 402 del
      tope era una promesa rechazada que nadie escuchaba, y Node terminaba el
      proceso. Un usuario gratuito en su tope tumbaba el servidor.
   3. Los PUT de mazos, tiradas y rituales crean si el id no existe, y no
      pasaban por el tope: con ids nuevos, el plan gratuito no tenía límite.

   Como los demás tests de integración, usa la base real de desarrollo con
   usuarios propios que se borran al terminar.
   ========================================================================== */

const prisma = new PrismaClient();
const SELLO = Date.now();

let server: Server;
let base: string;
let usuario: { id: string };

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de pruebas.');
  }
  base = `http://127.0.0.1:${address.port}`;

  /* Usuario gratuito: no tiene fila en `subscriptions`. */
  usuario = await prisma.user.create({
    data: { id: `user_limites_${SELLO}`, email: `limites_${SELLO}@test.local` },
  });
});

afterAll(async () => {
  /* El borrado del usuario arrastra en cascada sus mazos, tiradas y rituales. */
  await prisma.user.delete({ where: { id: usuario.id } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

/* -------------------------------------------------------------------------- */

describe('1. el contenido editorial no se escribe sin ser admin', () => {
  const recursos = ['cards', 'spreads', 'combinations'] as const;

  for (const recurso of recursos) {
    it(`POST /api/${recurso} sin sesión responde 401`, async () => {
      const res = await fetch(`${base}/api/${recurso}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `intruso_${SELLO}` }),
      });
      expect(res.status).toBe(401);
    });

    it(`PUT /api/${recurso}/:id sin sesión responde 401`, async () => {
      const res = await fetch(`${base}/api/${recurso}/cualquiera`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'pisado' }),
      });
      expect(res.status).toBe(401);
    });

    it(`DELETE /api/${recurso}/:id sin sesión responde 401`, async () => {
      const res = await fetch(`${base}/api/${recurso}/cualquiera`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it(`GET /api/${recurso} sigue siendo público`, async () => {
      const res = await fetch(`${base}/api/${recurso}`);
      expect(res.status).toBe(200);
    });
  }

  it('un DELETE sin sesión no borra la carta', async () => {
    const carta = await prisma.card.findFirst({ orderBy: { number: 'asc' } });
    if (!carta) return; // base sin seed: no hay nada que comprobar
    await fetch(`${base}/api/cards/${carta.id}`, { method: 'DELETE' });
    expect(await prisma.card.findUnique({ where: { id: carta.id } })).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

/** Corre un middleware y devuelve con qué se llamó a `next`. */
function correr(mw: ReturnType<typeof enforceLimit>, userId: string): Promise<unknown> {
  return new Promise((resolve) => {
    const req = { dbUserId: userId } as unknown as Request;
    const next = ((err?: unknown) => resolve(err)) as NextFunction;
    mw(req, {} as Response, next);
  });
}

describe('2. enforceLimit pasa el 402 al errorHandler en vez de tumbar el proceso', () => {
  it('con espacio libre, deja pasar', async () => {
    await expect(correr(enforceLimit('rituals'), usuario.id)).resolves.toBeUndefined();
  });

  it('en el tope, llama a next con el ApiError 402 (no lanza)', async () => {
    const limite = PLAN_LIMITS.free.decks;
    for (let i = 0; i < limite; i++) {
      await prisma.userDeck.create({
        data: {
          id: `deck_mw_${SELLO}_${i}`,
          userId: usuario.id,
          name: `Mazo ${i}`,
          allowReversed: true,
          cards: '[]',
        },
      });
    }
    const err = await correr(enforceLimit('decks'), usuario.id);
    expect(err).toMatchObject({ statusCode: 402, code: 'PLAN_LIMIT_REACHED' });
  });

  it('el servidor sigue vivo después del rechazo', async () => {
    /* Antes del arreglo, el rechazo del test anterior terminaba el proceso. */
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */

describe('3. los PUT que crean respetan el tope del plan', () => {
  it('un mazo nuevo por PUT, con el tope alcanzado, da 402', async () => {
    /* El tope de mazos ya se llenó en el bloque anterior. */
    await expect(
      upsertUserDeck(usuario.id, `deck_put_${SELLO}`, { name: 'Colado', cards: [] }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'PLAN_LIMIT_REACHED' });
    expect(await prisma.userDeck.findUnique({ where: { id: `deck_put_${SELLO}` } })).toBeNull();
  });

  it('editar un mazo que ya tiene sigue permitido aunque esté en el tope', async () => {
    const { deck, created } = await upsertUserDeck(usuario.id, `deck_mw_${SELLO}_0`, {
      name: 'Renombrado',
    });
    expect(created).toBe(false);
    expect(deck.name).toBe('Renombrado');
  });

  it('tiradas: crea por PUT hasta el tope y rechaza la siguiente', async () => {
    const limite = PLAN_LIMITS.free.spreads;
    for (let i = 0; i < limite; i++) {
      const { created } = await upsertUserSpread(usuario.id, `spread_put_${SELLO}_${i}`, {
        name: `Tirada ${i}`,
        positions: [],
      });
      expect(created).toBe(true);
    }
    await expect(
      upsertUserSpread(usuario.id, `spread_put_${SELLO}_extra`, { name: 'Extra', positions: [] }),
    ).rejects.toMatchObject({ statusCode: 402 });
  });

  it('rituales: crea por PUT hasta el tope y rechaza el siguiente', async () => {
    const limite = PLAN_LIMITS.free.rituals;
    for (let i = 0; i < limite; i++) {
      const { created } = await upsertUserRitual(usuario.id, `rit_put_${SELLO}_${i}`, {
        title: `Ritual ${i}`,
        body: '...',
      });
      expect(created).toBe(true);
    }
    await expect(
      upsertUserRitual(usuario.id, `rit_put_${SELLO}_extra`, { title: 'Extra', body: '...' }),
    ).rejects.toMatchObject({ statusCode: 402 });
  });
});
