import { prisma } from '../database/prisma';
import * as billingService from './billingService';
import { assertWithinLimit, type LimitedResource } from './plans';

/* ==========================================================================
   Comprobación de topes del plan, en un solo lugar.

   La usan DOS caminos que crean cosas:

   - El middleware `enforceLimit`, que va delante de los POST.
   - Los upsert de `userService` (PUT /decks/:id, /spreads/:id,
     /rituals/:id), que también crean cuando el id no existe.

   Antes sólo la usaba el middleware, y como el PUT crea sin pasar por él, un
   usuario gratuito podía tener mazos, tiradas y rituales ilimitados mandando
   ids nuevos por PUT. Con la regla acá, el tope no depende de por qué ruta
   entre el pedido.
   ========================================================================== */

/** Cuántos elementos tiene el usuario de un tipo. */
export async function countResource(userId: string, resource: LimitedResource): Promise<number> {
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
 * Lanza un ApiError 402 si el usuario ya no puede crear otro elemento de ese
 * tipo. Se llama SÓLO al crear: editar lo que ya tiene siempre está permitido.
 */
export async function assertCanCreate(userId: string, resource: LimitedResource): Promise<void> {
  const [sub, current] = await Promise.all([
    billingService.getSubscription(userId),
    countResource(userId, resource),
  ]);
  assertWithinLimit(sub.plan, sub.status, resource, current);
}
