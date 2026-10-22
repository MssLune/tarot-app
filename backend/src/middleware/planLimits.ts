import type { RequestHandler } from 'express';
import * as billingService from '../services/billingService';
import { assertCanCreate } from '../services/limits';
import type { LimitedResource } from '../services/plans';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

/* ==========================================================================
   Límites del plan.

   Se aplican en el BACKEND y no en el frontend a propósito. Si el tope se
   chequea en la interfaz, cualquiera que abra las devtools puede saltárselo:
   el pedido sigue saliendo igual y el límite no existe. El backend es el
   único lugar donde el límite es real.

   El frontend sí los muestra, pero sólo como información: de esa forma el
   contador de "3 de 10" y el rechazo real nunca pueden discrepar.

   LOS DOS MIDDLEWARES VAN ENVUELTOS EN `asyncHandler`. Express 4 no captura
   los rechazos de un middleware async: el `throw` del 402 se convertía en una
   promesa rechazada que nadie escuchaba, Node terminaba el proceso, y un
   usuario gratuito que llegaba a su tope tumbaba el servidor para todos.
   Envueltos, el error llega al `errorHandler` y sale como un 402 normal.
   ========================================================================== */

/**
 * Middleware que rechaza la creación si el usuario ya alcanzó el tope.
 *
 * Sólo se usa en crear (POST). Los upsert por PUT hacen la misma comprobación
 * por dentro, en `userService`, sólo cuando el id no existía.
 */
export function enforceLimit(resource: LimitedResource): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const userId = (req as any).dbUserId as string;
    if (!userId) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Iniciá sesión para usar esta función.');
    }
    await assertCanCreate(userId, resource);
    next();
  });
}

/**
 * Middleware que exige plan Pro.
 *
 * Sirve para lo que no se puede contar. Hoy no lo usa ninguna ruta (el PDF es
 * gratis), pero queda listo y seguro para cuando haga falta.
 */
export function requirePro(): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const userId = (req as any).dbUserId as string;
    if (!userId) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Iniciá sesión para usar esta función.');
    }
    const sub = await billingService.getSubscription(userId);
    if (sub.plan !== 'pro') {
      throw new ApiError(402, 'PLAN_REQUIRED', 'Esta función es del plan Pro.');
    }
    next();
  });
}
