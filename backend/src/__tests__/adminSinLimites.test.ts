import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma';
import { assertCanCreate, usoDelPlan } from '../services/limits';
import { createUserReading } from '../services/userService';

/* ==========================================================================
   Los administradores no tienen topes.

   Un admin en plan gratuito (sin pagar) puede guardar más de 2 lecturas por
   semana y crear mazos, tiradas y rituales sin límite. Un usuario normal en
   la misma situación sigue con los topes del gratuito.
   ========================================================================== */

const SELLO = Date.now();
let admin: { id: string };
let normal: { id: string };

const lectura = (n: number) => ({
  title: `Lectura ${n}`,
  system: 'rider-waite',
  spread: { id: 'tres', positions: [] },
  cards: [],
});

beforeAll(async () => {
  admin = await prisma.user.create({
    data: { id: `user_admin_${SELLO}`, email: `admin_${SELLO}@test.local`, role: 'admin' },
  });
  normal = await prisma.user.create({
    data: { id: `user_normal_${SELLO}`, email: `normal_${SELLO}@test.local` },
  });
});

afterAll(async () => {
  /* Si el `beforeAll` falló (por ejemplo, la base no respondió), no hay nada
     que borrar: sin este filtro el error real queda tapado por un TypeError. */
  const ids = [admin?.id, normal?.id].filter((id): id is string => !!id);
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe('admin sin límites', () => {
  it('guarda más de 2 lecturas en la semana', async () => {
    for (let n = 1; n <= 4; n += 1) {
      await assertCanCreate(admin.id, 'readings');
      await createUserReading(admin.id, lectura(n) as never);
    }
    const uso = await usoDelPlan(admin.id);
    expect(uso.usage.readings).toBe(4);
    expect(uso.admin).toBe(true);
    expect(Number.isFinite(uso.limits.readings)).toBe(false);
    expect(uso.proximo.readings).toBeNull();
  });

  it('crea mazos, tiradas y rituales sin tope', async () => {
    await expect(assertCanCreate(admin.id, 'decks')).resolves.toBeUndefined();
    await expect(assertCanCreate(admin.id, 'spreads')).resolves.toBeUndefined();
    await expect(assertCanCreate(admin.id, 'rituals')).resolves.toBeUndefined();
  });

  it('un usuario normal sigue con el tope de 2 por semana', async () => {
    await createUserReading(normal.id, lectura(1) as never);
    await createUserReading(normal.id, lectura(2) as never);
    await expect(assertCanCreate(normal.id, 'readings')).rejects.toMatchObject({ statusCode: 402 });
    const uso = await usoDelPlan(normal.id);
    expect(uso.admin).toBe(false);
    expect(uso.limits.readings).toBe(2);
  });
});
