import type { Request, Response, NextFunction } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import { env } from '../config/env';
import { prisma } from '../database/prisma';
import { desdeApiDeClerk, sincronizarUsuario } from '../services/accounts';

/* ==========================================================================
   Autenticación con Clerk.

   Además de validar el token, `requireAuth` se encarga de que exista la fila
   correspondiente en nuestra tabla `users`. Así el usuario se sincroniza en el
   primer request autenticado, sin depender del webhook (que en desarrollo
   local requiere un túnel público) ni de esperar a que Clerk lo dispare.
   ========================================================================== */

/**
 * Devuelve el usuario autenticado, creándolo en la base si es la primera vez.
 *
 * La alta pasa por `sincronizarUsuario`, la misma función que usa el webhook
 * de Clerk: sólo un email VERIFICADO puede hacer que una cuenta nueva
 * reutilice una fila existente, y nunca se hereda el rol de admin.
 */
async function resolveUser(clerkUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id: clerkUserId } });
  if (existing) return existing;

  // Primera vez: pedimos los datos a Clerk para tener email/nombre/avatar.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  return sincronizarUsuario(desdeApiDeClerk(clerkUser));
}

/**
 * Middleware de autenticación.
 * Valida la sesión y deja `req.userId` (id de Clerk) y `req.dbUserId` (fila
 * en nuestra tabla) para que los servicios no tengan que resolverlo otra vez.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!env.clerkSecretKey) {
    // Modo desarrollo sin Clerk: las rutas propias responden 401 explícito en
    // vez de escribir filas con userId nulo (que rompería las foreign keys).
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'La autenticación no está configurada en el servidor.',
      },
    });
    return;
  }

  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Debes iniciar sesión para acceder a este recurso.' },
    });
    return;
  }

  try {
    const user = await resolveUser(userId);
    (req as any).userId = userId;
    (req as any).dbUserId = user.id;
    next();
  } catch (err) {
    console.error('[auth] No se pudo sincronizar el usuario:', err);
    res.status(500).json({
      success: false,
      error: { code: 'USER_SYNC_FAILED', message: 'No se pudo verificar la cuenta de usuario.' },
    });
  }
}

/**
 * Middleware opcional: si hay sesión, agrega `userId`; si no, sigue sin error.
 * Útil para contenido público que sólo personaliza cuando hay sesión.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!env.clerkSecretKey) {
    (req as any).userId = null;
    (req as any).dbUserId = null;
    next();
    return;
  }

  const { userId } = getAuth(req);
  (req as any).userId = userId ?? null;
  (req as any).dbUserId = null;
  next();
}

/**
 * Middleware de administración: sesión válida y rol 'admin' en los session
 * claims de Clerk (se asigna desde el dashboard → Public metadata).
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!env.clerkSecretKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'La autenticación no está configurada en el servidor.',
      },
    });
    return;
  }

  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Debes iniciar sesión para acceder a este recurso.' },
    });
    return;
  }

  try {
    /* El rol vive en nuestra tabla `users`, no en los claims de Clerk: así se
       puede dar de alta un admin desde el panel sin editar el dashboard de
       Clerk, y el webhook mantiene ambos sincronizados. */
    const user = await resolveUser(userId);
    if (user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'No tenés permiso para acceder a este recurso.' },
      });
      return;
    }

    (req as any).userId = userId;
    (req as any).dbUserId = user.id;
    next();
  } catch (err) {
    console.error('[auth] No se pudo verificar el rol de admin:', err);
    res.status(500).json({
      success: false,
      error: { code: 'USER_SYNC_FAILED', message: 'No se pudo verificar la cuenta de usuario.' },
    });
  }
}
