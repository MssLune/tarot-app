import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { prisma } from '../database/prisma';
import { esCorreoDeAdmin, sincronizarUsuario } from '../services/accounts';

/* ==========================================================================
   ADMIN_EMAILS: el rol de admin se da solo, sin editar la base.

   - Un correo VERIFICADO que está en la lista recibe el rol al sincronizar.
   - Un correo sin verificar no, aunque esté en la lista.
   - Quitar el correo de la lista no le saca el rol a nadie.
   ========================================================================== */

const SELLO = Date.now();
const correoAdmin = `jefa_${SELLO}@test.local`;
const ids = [`user_lista_${SELLO}`, `user_sinverif_${SELLO}`, `user_otro_${SELLO}`];
const original = [...env.adminEmails];

const datos = (id: string, correo: string, verificado: boolean) => ({
  id,
  emails: [{ id: `em_${id}`, address: correo, verified: verificado }],
  primaryEmailId: `em_${id}`,
  name: null,
  imageUrl: null,
});

beforeAll(() => {
  env.adminEmails.push(correoAdmin);
});

afterAll(async () => {
  env.adminEmails.splice(0, env.adminEmails.length, ...original);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe('ADMIN_EMAILS', () => {
  it('compara sin importar mayúsculas e ignora vacíos', () => {
    expect(esCorreoDeAdmin(correoAdmin.toUpperCase())).toBe(true);
    expect(esCorreoDeAdmin(null)).toBe(false);
    expect(esCorreoDeAdmin('otra@test.local')).toBe(false);
  });

  it('un correo verificado de la lista entra como admin', async () => {
    const u = await sincronizarUsuario(datos(ids[0], correoAdmin, true));
    expect(u.role).toBe('admin');
  });

  it('un correo sin verificar no recibe el rol aunque esté en la lista', async () => {
    const u = await sincronizarUsuario(datos(ids[1], correoAdmin.replace('jefa', 'falsa'), false));
    expect(u.role).toBe('user');
  });

  it('un usuario que ya existía recibe el rol al sincronizar si se agrega su correo', async () => {
    const otro = `otro_${SELLO}@test.local`;
    const antes = await sincronizarUsuario(datos(ids[2], otro, true));
    expect(antes.role).toBe('user');
    env.adminEmails.push(otro);
    const despues = await sincronizarUsuario(datos(ids[2], otro, true));
    expect(despues.role).toBe('admin');
  });

  it('quitar el correo de la lista no le saca el rol', async () => {
    env.adminEmails.splice(0, env.adminEmails.length);
    const u = await sincronizarUsuario(datos(ids[0], correoAdmin, true));
    expect(u.role).toBe('admin');
  });
});
