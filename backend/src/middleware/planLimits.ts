import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma';
import * as billingService from '../services/billingService';
import { assertWithinLimit, type LimitedResource } from '../services/plans';
import { ApiError } from '../utils/ApiError';

/* ==========================================================================
   Límites del plan.

   Se aplican en el BACKEND y no en el frontend a propósito. Si el tope se
   chequea en la interfaz, cualquiera que abra las devtools puede saltárselo:
   el pedido sigue saliendo igual y el límite no existe. El backend es el
   único lugar donde el límite es real.

   El frontend sí los muestra, pero sólo como información: de esa forma el
   contador de "3 de 20" y el rechazo real nunca pueden discrepar.
   ========================================================================== */

/**
 * Middleware que rechaza la creación si el usuario ya alcanzó el tope.
 *
 * Sólo se usa en crear (POST), no en actualizar (PUT): un usuario free que
 * llegó a 20 lecturas tiene que poder editar las que ya tiene, no queda
 * trabado con un error al corregir una.
 */
export function enforceLimit(resource: LimitedResource) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as any).dbUserId as string;
    if (!userId) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Iniciá sesión para usar esta función.');
    }
    const [sub, current] = await Promise.all([
      billingService.getSubscription(userId),
      countResource(userId, resource),
    ]);
    assertWithinLimit(sub.plan, sub.status, resource, current);
    next();
  };
}

/** Cuántos elementos tiene el usuario de un tipo. */
async function countResource(userId: string, resource: LimitedResource): Promise<number> {
  switch (resource) {
    case 'readings':
      return prisma.userReading.count({ where: { userId } });
    case 'decks':
      return prisma.userDeck.count({ where: { userId } });
    case 'spreads':
      return prisma.userSpread.count({ where: { userId } });
    case 'rituals':
      return prisma.userRitual.count({ where: { userId } });
  }
}

/**
 * Middleware que exige plan Pro.
 *
 * Sirve para lo que no se puede contar: exportar a PDF, por ejemplo, no es
 * "crear un objeto más" sino una operación cara.
 */
export function requirePro() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as any).dbUserId as string;
    if (!userId) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Iniciá sesión para usar esta función.');
    }
    const sub = await billingService.getSubscription(userId);
    if (sub.plan !== 'pro') {
      throw new ApiError(
        402,
        'PLAN_REQUIRED',
        'Esta función es del plan Pro.',
      );
    }
    next();
  };
}
