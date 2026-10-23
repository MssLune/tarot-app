import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../app';
import { prisma } from '../database/prisma';
import { assertCanCreate, usoDelPlan } from '../services/limits';
import { createUserReading, deleteUserReading } from '../services/userService';
import { SEMANA_MS } from '../services/plans';

/* ==========================================================================
   Plan gratuito: 2 lecturas guardadas por semana.

   - Cuenta las veces que se GUARDÓ en los últimos 7 días (usage_events), no
     las lecturas que existen: borrar una no devuelve el uso.
   - El mensaje del 402 dice cuándo se puede volver a guardar.
   - /api/user/usage existe aunque Stripe no esté configurado: los topes se
     aplican siempre, y la app tiene que poder mostrarlos.
   ========================================================================== */

const SELLO = Date.now();
let usuario: { id: string };
let server: Server;
let base: string;

const lectura = (n: number) => ({
  title: `Lectura ${n}`,
  system: 'rider-waite',
  spread: { id: 'tres', positions: [] },
  cards: [],
});

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('sin puerto');
  base = `http://127.0.0.1:${address.port}`;
  usuario = await prisma.user.create({
    data: { id: `user_semana_${SELLO}`, email: `semana_${SELLO}@test.local` },
  });
});

afterAll(async () => {
  /* La cascada borra lecturas y usos. */
  await prisma.user.deleteMany({ where: { id: usuario.id } });
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('2 lecturas guardadas por semana', () => {
  it('las dos primeras se guardan', async () => {
    await assertCanCreate(usuario.id, 'readings');
    await createUserReading(usuario.id, lectura(1) as never);
    await assertCanCreate(usuario.id, 'readings');
    await createUserReading(usuario.id, lectura(2) as never);

    const uso = await usoDelPlan(usuario.id);
    expect(uso.usage.readings).toBe(2);
    expect(uso.limits.readings).toBe(2);
    expect(uso.periodo.readings).toBe('semana');
  });

  it('la tercera da 402 y dice cuándo se puede volver a guardar', async () => {
    await expect(assertCanCreate(usuario.id, 'readings')).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_LIMIT_REACHED',
      message: expect.stringMatching(/esta semana.*Puedes guardar otra el/),
    });
    const uso = await usoDelPlan(usuario.id);
    expect(uso.proximo.readings).not.toBeNull();
    /* Se libera 7 días después del primer uso de la ventana. */
    const espera = new Date(uso.proximo.readings!).getTime() - Date.now();
    expect(espera).toBeGreaterThan(SEMANA_MS - 60_000);
    expect(espera).toBeLessThanOrEqual(SEMANA_MS);
  });

  it('borrar una lectura NO devuelve el uso', async () => {
    const una = await prisma.userReading.findFirst({ where: { userId: usuario.id } });
    await deleteUserReading(usuario.id, una!.id);
    await expect(assertCanCreate(usuario.id, 'readings')).rejects.toMatchObject({
      statusCode: 402,
    });
  });

  it('pasados 7 días, el uso sale de la ventana y se puede guardar de nuevo', async () => {
    const hace8dias = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const primero = await prisma.usageEvent.findFirst({
      where: { userId: usuario.id },
      orderBy: { createdAt: 'asc' },
    });
    await prisma.usageEvent.update({ where: { id: primero!.id }, data: { createdAt: hace8dias } });

    await expect(assertCanCreate(usuario.id, 'readings')).resolves.toBeUndefined();
    const uso = await usoDelPlan(usuario.id);
    expect(uso.usage.readings).toBe(1);
    expect(uso.proximo.readings).toBeNull();
  });
});

describe('/api/user/usage', () => {
  it('existe aunque Stripe no esté configurado (sin sesión responde 401, no 404)', async () => {
    const res = await fetch(`${base}/api/user/usage`);
    expect(res.status).toBe(401);
  });
});
