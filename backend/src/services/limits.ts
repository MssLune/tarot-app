import { isStripeConfigured } from '../config/env';
import { prisma } from '../database/prisma';
import * as billingService from './billingService';
import { assertWithinLimit, VENTANA_MS, type LimitedResource } from './plans';

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

   Las LECTURAS tienen tope por semana (ver `VENTANA_MS` en plans.ts): se
   cuentan las veces que se guardó en los últimos 7 días, de la tabla
   `usage_events`, no las lecturas que existen. Si contara las que existen,
   bastaría con borrar una para poder guardar otra.
   ========================================================================== */

/** Desde cuándo cuenta la ventana de un recurso, o null si no tiene. */
function inicioDeVentana(resource: LimitedResource, ahora = new Date()): Date | null {
  const ventana = VENTANA_MS[resource];
  return ventana ? new Date(ahora.getTime() - ventana) : null;
}

/**
 * Cuánto usó el usuario de un recurso: en los recursos con ventana, las
 * veces en el período; en los demás, cuántos tiene.
 */
export async function countResource(userId: string, resource: LimitedResource): Promise<number> {
  const desde = inicioDeVentana(resource);
  if (desde) {
    return prisma.usageEvent.count({ where: { userId, resource, createdAt: { gte: desde } } });
  }
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
 * Cuándo se libera el próximo uso de un recurso con ventana, si el usuario
 * está en el tope o por encima: el momento en que sale de la ventana el uso
 * que hace tope. `null` si el recurso no tiene ventana o si quedan usos.
 */
export async function proximoUsoLibre(
  userId: string,
  resource: LimitedResource,
  limite: number,
): Promise<Date | null> {
  const ventana = VENTANA_MS[resource];
  const desde = inicioDeVentana(resource);
  if (!ventana || !desde || !Number.isFinite(limite)) return null;
  const usos = await prisma.usageEvent.findMany({
    where: { userId, resource, createdAt: { gte: desde } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (usos.length < limite) return null;
  /* Con N usos y tope L hay que esperar a que salgan N - L + 1: el que marca
     la fecha es el de la posición N - L (empezando en 0). */
  const clave = usos[usos.length - limite];
  return new Date(clave.createdAt.getTime() + ventana);
}

/** Anota un uso de un recurso con ventana (por ahora, guardar una lectura). */
export function registrarUso(userId: string, resource: LimitedResource) {
  return prisma.usageEvent.create({ data: { userId, resource } });
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
  const proximo =
    current >= sub.limits[resource]
      ? await proximoUsoLibre(userId, resource, sub.limits[resource])
      : null;
  assertWithinLimit(sub.plan, sub.status, resource, current, proximo);
}

/**
 * Plan, límites y uso del usuario, para la barra del plan y "Tu plan".
 *
 * Existe aparte de `/api/billing/usage` porque esa ruta sólo se monta con
 * Stripe configurado, y los topes del plan gratuito se aplican SIEMPRE: sin
 * esto, la app no podía mostrar cuánto llevaba el usuario hasta que chocaba
 * con el tope.
 */
export async function usoDelPlan(userId: string) {
  const sub = await billingService.getSubscription(userId);
  const recursos: LimitedResource[] = ['readings', 'decks', 'spreads', 'rituals'];
  const usos = await Promise.all(recursos.map((r) => countResource(userId, r)));
  const usage = Object.fromEntries(recursos.map((r, i) => [r, usos[i]])) as Record<
    LimitedResource,
    number
  >;
  const proximoLectura = await proximoUsoLibre(userId, 'readings', sub.limits.readings);

  return {
    plan: sub.plan,
    tier: sub.tier,
    status: sub.status,
    limits: sub.limits,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    usage,
    /** Qué recursos cuentan por semana en vez de en total. */
    periodo: { readings: 'semana' as const },
    /** Cuándo se libera el próximo uso, si está en el tope (ISO o null). */
    proximo: { readings: proximoLectura?.toISOString() ?? null },
    /** Si se puede pasar al Pro en este entorno (Stripe configurado). */
    pagoHabilitado: isStripeConfigured,
  };
}
