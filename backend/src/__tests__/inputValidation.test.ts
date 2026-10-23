import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../app';
import { prisma } from '../database/prisma';
import {
  createUserDeck,
  createUserReading,
  createUserRitual,
  createUserSpread,
  listUserReadings,
  upsertUserDeck,
} from '../services/userService';

/* ==========================================================================
   Puntos menores de la revisión.

   - Las rutas públicas de la luna sólo aceptan años entre 1900 y 2100. Antes
     cualquier año > 1000 disparaba una consulta al IMCCE o al JPL y una fila
     nueva en `AstronomyCache`.
   - Los `create*` de `userService` validan la entrada: un campo que falta o
     con otro tipo da 400 con el nombre del campo, no un 500 de Prisma.
   - El historial de lecturas ya no se corta en 100.
   ========================================================================== */

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
  usuario = await prisma.user.create({
    data: { id: `user_valid_${SELLO}`, email: `valid_${SELLO}@test.local` },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: usuario.id } });
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('las rutas de la luna sólo aceptan años razonables', () => {
  /* Ninguno de estos llega a consultar el IMCCE ni el JPL: se rechazan
     antes. Por eso el test no necesita red. */
  const casos = [
    ['/api/moon/eclipses?anio=999999', 'un año enorme'],
    ['/api/moon/eclipses?anio=1899', 'antes de 1900'],
    ['/api/moon/retrogrados?anio=2101', 'después de 2100'],
    ['/api/moon/retrogrados?anio=abc', 'un texto'],
    ['/api/moon/eclipses?anio=2026.5', 'un año con decimales'],
  ] as const;

  for (const [ruta, que] of casos) {
    it(`${que} → 400 ANIO_FUERA_DE_RANGO`, async () => {
      const res = await fetch(`${base}${ruta}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('ANIO_FUERA_DE_RANGO');
    });
  }
});

describe('los create* validan la entrada', () => {
  it('un mazo sin nombre da 400 y nombra el campo', async () => {
    await expect(createUserDeck(usuario.id, { cards: [] } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'DECK_INVALID',
      message: expect.stringContaining('"name"'),
    });
  });

  it('un mazo con "cards" que no es lista da 400', async () => {
    await expect(
      createUserDeck(usuario.id, { name: 'Mazo', cards: 'no' } as never),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('"cards"') });
  });

  it('un mazo correcto se crea, con allowReversed true por defecto', async () => {
    const deck = await createUserDeck(usuario.id, { name: 'Mazo bueno', cards: [] } as never);
    expect(deck.allowReversed).toBe(true);
  });

  it('una tirada sin posiciones da 400', async () => {
    await expect(createUserSpread(usuario.id, { name: 'Tirada' } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'SPREAD_INVALID',
    });
  });

  it('una lectura normal SIN mazo propio se guarda (deck es opcional)', async () => {
    /* Rider-Waite y Oráculo no mandan `deck`. Exigirlo rechazaba todas las
       lecturas normales con un 400. */
    const r = await createUserReading(usuario.id, {
      system: 'rider-waite',
      spread: { id: 'tres', positions: [] },
      cards: [],
    } as never);
    expect(r.id).toBeTruthy();
    expect(r.deck).toBeUndefined();
  });

  it('una lectura con "deck" que no es objeto da 400', async () => {
    await expect(
      createUserReading(usuario.id, {
        system: 'custom-deck',
        spread: {},
        cards: [],
        deck: 'no',
      } as never),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('"deck"') });
  });

  it('una lectura sin "spread" da 400', async () => {
    await expect(
      createUserReading(usuario.id, { system: 'rider-waite', cards: [] } as never),
    ).rejects.toMatchObject({ statusCode: 400, code: 'READING_INVALID' });
  });

  it('un ritual con el cuerpo que no es texto da 400', async () => {
    await expect(
      createUserRitual(usuario.id, { title: 'Ritual', body: 42 } as never),
    ).rejects.toMatchObject({ statusCode: 400, code: 'RITUAL_INVALID' });
  });

  it('una actualización parcial con el nombre vacío da 400', async () => {
    const deck = await createUserDeck(usuario.id, { name: 'Otro', cards: [] } as never).catch(
      () => null,
    );
    /* El plan gratuito permite un solo mazo: si ya se creó en un test
       anterior, se edita ése. */
    const id =
      deck?.id ?? (await prisma.userDeck.findFirst({ where: { userId: usuario.id } }))!.id;
    await expect(upsertUserDeck(usuario.id, id, { name: '   ' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'DECK_INVALID',
    });
  });
});

describe('el historial de lecturas no se corta en 100', () => {
  it('con 105 lecturas, se listan las 105 (más la del test de arriba)', async () => {
    await prisma.userReading.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        id: `read_valid_${SELLO}_${i}`,
        userId: usuario.id,
        system: 'rider-waite',
        spread: '{}',
        cards: '[]',
      })),
    });
    expect(await listUserReadings(usuario.id)).toHaveLength(106);
  });
});
