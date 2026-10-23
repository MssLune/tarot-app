import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma';
import {
  createUserRitual,
  deleteFestivalNote,
  listFestivalNotes,
  saveFestivalNote,
  upsertUserRitual,
} from '../services/userService';

/* ==========================================================================
   Rituales de la pantalla Luna y notas de festividades.

   - Un ritual se puede atar a un día, a una festividad o a una fase, y
     guarda notas, materiales y si se hizo.
   - Vaciar un campo opcional lo BORRA (null), no deja el valor viejo.
   - Las notas de festividad son una por festividad y año, y de cada usuario.
   ========================================================================== */

const SELLO = Date.now();
let ana: { id: string };
let beto: { id: string };

beforeAll(async () => {
  ana = await prisma.user.create({ data: { id: `user_rit_a_${SELLO}`, email: `rit_a_${SELLO}@test.local` } });
  beto = await prisma.user.create({ data: { id: `user_rit_b_${SELLO}`, email: `rit_b_${SELLO}@test.local` } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [ana.id, beto.id] } } });
});

describe('ritual con día, festividad, notas y materiales', () => {
  it('se guarda con todos los campos', async () => {
    const r = await createUserRitual(ana.id, {
      id: `rit_full_${SELLO}`,
      title: 'Hoguera de Samhain',
      body: 'Encender la vela y leer tres cartas.',
      phase: 'any',
      date: '2026-10-31',
      festivalId: 'samhain',
      notes: 'Hacerlo después de cenar.',
      materials: 'Vela negra, mazo',
    });
    expect(r).toMatchObject({ date: '2026-10-31', festivalId: 'samhain', materials: 'Vela negra, mazo', completedAt: null });
  });

  it('marcar como hecho guarda el instante; desmarcar lo vuelve a null', async () => {
    const hecho = '2026-10-31T22:00:00.000Z';
    const { ritual } = await upsertUserRitual(ana.id, `rit_full_${SELLO}`, { completedAt: hecho });
    expect(ritual.completedAt?.toISOString()).toBe(hecho);

    const { ritual: pendiente } = await upsertUserRitual(ana.id, `rit_full_${SELLO}`, { completedAt: null });
    expect(pendiente.completedAt).toBeNull();
  });

  it('vaciar las notas las borra (null o texto vacío)', async () => {
    const { ritual } = await upsertUserRitual(ana.id, `rit_full_${SELLO}`, { notes: null, materials: '  ' });
    expect(ritual.notes).toBeNull();
    expect(ritual.materials).toBeNull();
    /* Lo que no vino queda como estaba. */
    expect(ritual.festivalId).toBe('samhain');
  });

  it('un día que no existe da 400', async () => {
    for (const date of ['2026-02-30', '31/10/2026', '1800-01-01']) {
      await expect(
        createUserRitual(ana.id, { title: 'X', body: 'Y', date }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'RITUAL_INVALID' });
    }
  });

  it('una festividad con caracteres raros da 400', async () => {
    await expect(
      createUserRitual(ana.id, { title: 'X', body: 'Y', festivalId: '../samhain' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('completedAt que no es fecha da 400', async () => {
    await expect(
      upsertUserRitual(ana.id, `rit_full_${SELLO}`, { completedAt: 'ayer' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('un texto demasiado largo da 400', async () => {
    await expect(
      createUserRitual(ana.id, { title: 'X', body: 'Y', notes: 'a'.repeat(8001) }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('notas de festividades', () => {
  it('se guardan por festividad y año, y se reemplazan', async () => {
    await saveFestivalNote(ana.id, 'samhain', 2026, 'Primera');
    await saveFestivalNote(ana.id, 'samhain', 2026, 'Segunda');
    await saveFestivalNote(ana.id, 'samhain', 2027, 'Otro año');

    const de2026 = await listFestivalNotes(ana.id, 2026);
    expect(de2026).toHaveLength(1);
    expect(de2026[0].body).toBe('Segunda');
    expect(await listFestivalNotes(ana.id)).toHaveLength(2);
  });

  it('son de cada usuario', async () => {
    expect(await listFestivalNotes(beto.id, 2026)).toEqual([]);
  });

  it('una nota vacía la borra', async () => {
    expect(await saveFestivalNote(ana.id, 'samhain', 2027, '   ')).toBeNull();
    expect(await listFestivalNotes(ana.id, 2027)).toEqual([]);
  });

  it('borrar una que no existe no falla', async () => {
    await expect(deleteFestivalNote(ana.id, 'beltane', 2026)).resolves.toBeUndefined();
  });

  it('año o festividad inválidos dan 400', async () => {
    await expect(saveFestivalNote(ana.id, 'samhain', 3000, 'x')).rejects.toMatchObject({ statusCode: 400 });
    await expect(saveFestivalNote(ana.id, 'SAMHAIN!', 2026, 'x')).rejects.toMatchObject({ statusCode: 400 });
    await expect(saveFestivalNote(ana.id, 'samhain', 2026, 42)).rejects.toMatchObject({ statusCode: 400 });
  });
});
