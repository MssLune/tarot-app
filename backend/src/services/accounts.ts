import { clerkClient } from '@clerk/express';
import { env } from '../config/env';
import { prisma } from '../database/prisma';
import { cancelSubscriptionForDeletedUser } from './billingService';

/* ==========================================================================
   Cuentas: alta, actualización y baja de usuarios a partir de Clerk.

   Hay DOS caminos que traen datos de Clerk y los dos pasan por aquí:

   - `requireAuth`, la primera vez que un usuario hace un request (pide el
     usuario a la API de Clerk, que lo da en camelCase).
   - El webhook de Clerk (`user.created`, `user.updated`, `user.deleted`),
     que lo trae en snake_case.

   Antes cada camino tenía su propia lógica y no coincidían: el middleware
   reutilizaba la fila de cualquier cuenta que tuviera el mismo email, aunque
   ese email no estuviera VERIFICADO. Como el rol vive en la fila, alguien
   podía terminar con la fila —y el rol de admin— de otra persona.

   La regla ahora es una sola: sólo un email verificado identifica a una
   persona. Un email sin verificar se ignora.
   ========================================================================== */

/** Lo que necesitamos de un usuario de Clerk, venga del camino que venga. */
export interface DatosDeClerk {
  id: string;
  emails: { id: string; address: string; verified: boolean }[];
  primaryEmailId: string | null;
  name: string | null;
  imageUrl: string | null;
}

/** Usuario de la API de Clerk (`clerkClient.users.getUser`). */
export function desdeApiDeClerk(u: {
  id: string;
  emailAddresses: { id: string; emailAddress: string; verification: { status: string } | null }[];
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
}): DatosDeClerk {
  return {
    id: u.id,
    emails: u.emailAddresses.map((e) => ({
      id: e.id,
      address: e.emailAddress,
      verified: e.verification?.status === 'verified',
    })),
    primaryEmailId: u.primaryEmailAddressId,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
    imageUrl: u.imageUrl || null,
  };
}

/** `data` de un evento `user.*` del webhook de Clerk. */
export function desdeWebhookDeClerk(d: {
  id: string;
  email_addresses?: { id: string; email_address: string; verification?: { status?: string } | null }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
}): DatosDeClerk {
  return {
    id: d.id,
    emails: (d.email_addresses ?? []).map((e) => ({
      id: e.id,
      address: e.email_address,
      verified: e.verification?.status === 'verified',
    })),
    primaryEmailId: d.primary_email_address_id ?? null,
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || null,
    imageUrl: d.image_url ?? null,
  };
}

/**
 * El email que usamos para identificar a la persona: el principal si está
 * verificado, si no cualquier otro verificado, y si no hay ninguno, null.
 */
export function emailVerificado(datos: DatosDeClerk): string | null {
  const verificados = datos.emails.filter((e) => e.verified);
  const principal = verificados.find((e) => e.id === datos.primaryEmailId);
  return (principal ?? verificados[0])?.address.toLowerCase() ?? null;
}

/**
 * true si ese correo (ya verificado) está en ADMIN_EMAILS.
 *
 * Así no hace falta editar la base a mano para darse el rol: basta con
 * poner el correo en la variable de entorno. El correo que se compara es
 * el que guardamos, que sólo puede venir de un email verificado (ver
 * `emailVerificado`); el de relleno nunca coincide.
 */
export function esCorreoDeAdmin(email: string | null | undefined): boolean {
  return !!email && env.adminEmails.includes(email.toLowerCase());
}

/** Email de relleno para cuentas sin email verificado. La columna es única. */
const emailDeRelleno = (id: string) => `${id}@sin-correo.local`;

/**
 * Crea o actualiza la fila del usuario a partir de sus datos de Clerk.
 *
 * - Si ya hay fila con ese id, se actualizan nombre, avatar y, si hay uno
 *   verificado y libre, el email.
 * - Si no hay fila con ese id pero sí una con el mismo email VERIFICADO, es la
 *   misma persona con una cuenta de Clerk nueva: se reutiliza la fila (y sus
 *   datos), pero SIN el rol de admin. El acceso de administración no se hereda
 *   por email: se vuelve a dar a mano desde el panel.
 * - Si no, se crea una fila nueva.
 */
export async function sincronizarUsuario(datos: DatosDeClerk) {
  const email = emailVerificado(datos);

  const existente = await prisma.user.findUnique({ where: { id: datos.id } });
  if (existente) {
    const emailLibre =
      email && email !== existente.email
        ? !(await prisma.user.findUnique({ where: { email } }))
        : false;
    const emailFinal = emailLibre && email ? email : existente.email;
    return prisma.user.update({
      where: { id: datos.id },
      data: {
        name: datos.name,
        avatarUrl: datos.imageUrl,
        ...(emailLibre && email ? { email } : {}),
        ...(esCorreoDeAdmin(emailFinal) ? { role: 'admin' } : {}),
      },
    });
  }

  if (email) {
    const porEmail = await prisma.user.findUnique({ where: { email } });
    if (porEmail) {
      if (porEmail.role === 'admin') {
        console.warn(
          `[cuentas] La cuenta de Clerk ${datos.id} reutiliza la fila de ${porEmail.id} ` +
            `(mismo email verificado). El rol de admin NO se hereda: queda como user.`,
        );
      }
      return prisma.user.update({
        where: { id: porEmail.id },
        data: { name: datos.name, avatarUrl: datos.imageUrl, role: esCorreoDeAdmin(email) ? 'admin' : 'user' },
      });
    }
  }

  return prisma.user.create({
    data: {
      id: datos.id,
      email: email ?? emailDeRelleno(datos.id),
      name: datos.name,
      avatarUrl: datos.imageUrl,
      ...(esCorreoDeAdmin(email) ? { role: 'admin' } : {}),
    },
  });
}

/**
 * Borra una cuenta por completo, en este orden:
 *
 * 1. Cancela su suscripción en Stripe. Antes se borraba la fila y la
 *    suscripción seguía cobrando, sin forma de relacionarla con nadie.
 * 2. Si `borrarEnClerk`, borra la cuenta de Clerk. Sin esto, el usuario
 *    seguía pudiendo iniciar sesión y `requireAuth` le volvía a crear la fila
 *    vacía en el siguiente request. No se hace cuando el borrado VIENE de
 *    Clerk (webhook `user.deleted`): ahí la cuenta ya no existe.
 * 3. Borra la fila; la cascada se lleva mazos, tiradas, lecturas, rituales y
 *    la suscripción.
 *
 * Si un paso falla, se corta ANTES de borrar la fila: es preferible un usuario
 * que sigue existiendo a uno borrado al que se le sigue cobrando.
 */
export async function borrarCuenta(
  userId: string,
  opciones: { borrarEnClerk: boolean },
): Promise<void> {
  await cancelSubscriptionForDeletedUser(userId);

  if (opciones.borrarEnClerk) {
    try {
      await clerkClient.users.deleteUser(userId);
    } catch (err) {
      /* Un 404 es que la cuenta ya no está en Clerk: es lo que queríamos. */
      if ((err as { status?: number }).status !== 404) throw err;
    }
  }

  await prisma.user.deleteMany({ where: { id: userId } });
}
