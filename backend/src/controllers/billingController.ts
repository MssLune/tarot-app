import type { Request, Response } from 'express';
import { prisma } from '../database/prisma';
import * as billingService from '../services/billingService';
import { ApiError } from '../utils/ApiError';
import { PLAN_TIERS, type PlanTier } from '../services/plans';
import { sendSuccess } from '../utils/response';
import { usoDelPlan } from '../services/limits';

/* ==========================================================================
   Billing. Todas las rutas exigen sesión; el webhook es la única excepción.
   ========================================================================== */

/** Estado de la suscripción. El frontend lo consulta al entrar a la app. */
export const getMySubscription = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const sub = await billingService.getSubscription(userId);
  sendSuccess(res, sub);
};

/**
 * Genera la URL de checkout y la devuelve; el frontend redirige a ella.
 *
 * El cuerpo dice QUÉ plan comprar. Si no viene, se asume el mensual: es el
 * único valor por el que vale la pena adivinar, y el frontend siempre lo
 * manda explícito.
 */
export const createCheckout = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'No existe el usuario en la base.');

  const pedido = (req.body ?? {}) as { tier?: string };
  const tier = pedido.tier ?? 'monthly';
  /* Sin este chequeo, un `tier` cualquiera de la URL terminaría como clave de
     objeto en `configuredTiers` y devolvería `undefined` en vez de un error. */
  if (!PLAN_TIERS.includes(tier as PlanTier)) {
    throw ApiError.badRequest('TIER_INVALIDO', `Plan desconocido: ${tier}.`);
  }
  const planElegido = tier as PlanTier;

  /* Cortafuegos: si ya es Pro va al portal, no al checkout. Meter a alguien en
     un checkout que ya pagó produce un error de Stripe que el usuario no
     sabe interpretar. */
  const current = await billingService.getSubscription(userId);
  if (current.plan === 'pro') {
    /* El de por vida no tiene nada que gestionar: no hay ni suscripción ni
       facturas. Mandarlo al portal sería mostrarle una pantalla vacía con la
       opción de cancelar algo que ya no existe. */
    if (current.tier === 'lifetime') {
      sendSuccess(res, { yaSosPro: true, dePorVida: true });
      return;
    }
    const portal = await billingService.createPortalSession(userId);
    sendSuccess(res, { ...portal, yaSosPro: true });
    return;
  }

  const session = await billingService.createCheckoutSession(userId, user.email, planElegido);
  sendSuccess(res, { ...session, tier: planElegido });
};

/**
 * Los tres planes con sus precios reales, leídos de Stripe.
 *
 * La pantalla de "MI PLAN" no tiene los precios escritos: si los tuviera, un
 * cambio de precio en el panel dejaría la app mostrando el número viejo.
 */
export const getPlans = async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await billingService.getPlanCatalog());
};

/** Portal de cliente: cambiar tarjeta, ver facturas, cancelar. */
export const createPortal = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const session = await billingService.createPortalSession(userId);
  sendSuccess(res, session);
};

/**
 * Cuántos recursos usa el usuario y cuánto le permite su plan.
 *
 * Va en una sola respuesta a propósito: la pantalla de "MI PLAN" necesita los
 * dos, y si fueran endpoints separados aparecería un instante en el que la
 * barra dice "3 de 20" y el plan todavía no se pintó.
 */
export const getUsage = async (req: Request, res: Response): Promise<void> => {
  /* Misma respuesta que `/api/user/usage` (que existe aunque no haya Stripe):
     una sola fuente para el conteo, así las dos rutas no pueden discrepar. */
  const userId = (req as any).dbUserId as string;
  sendSuccess(res, await usoDelPlan(userId));
};
