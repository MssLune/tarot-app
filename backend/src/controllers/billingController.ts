import type { Request, Response } from 'express';
import { prisma } from '../database/prisma';
import * as billingService from '../services/billingService';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';

/* ==========================================================================
   Billing. Todas las rutas exigen sesión; el webhook es la única excepción.
   ========================================================================== */

/** Estado de la suscripción. El frontend lo consulta al entrar a la app. */
export const getMySubscription = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const sub = await billingService.getSubscription(userId);
  sendSuccess(res, sub);
};

/** Genera la URL de checkout y la devuelve; el frontend redirige a ella. */
export const createCheckout = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'No existe el usuario en la base.');

  /* Cortafuegos: si ya es Pro va al portal, no al checkout. Meter a alguien en
     un checkout que ya pagó produce un error de Stripe que el usuario no
     sabe interpretar. */
  const current = await billingService.getSubscription(userId);
  if (current.plan === 'pro') {
    const portal = await billingService.createPortalSession(userId);
    sendSuccess(res, { ...portal, yaSosPro: true });
    return;
  }

  const session = await billingService.createCheckoutSession(userId, user.email);
  sendSuccess(res, session);
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
 * barra dice "3 de 20" y el plan todavía no se Pintó.
 */
export const getUsage = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const [readings, decks, spreads, rituals, sub] = await Promise.all([
    prisma.userReading.count({ where: { userId } }),
    prisma.userDeck.count({ where: { userId } }),
    prisma.userSpread.count({ where: { userId } }),
    prisma.userRitual.count({ where: { userId } }),
    billingService.getSubscription(userId),
  ]);

  sendSuccess(res, {
    plan: sub.plan,
    status: sub.status,
    limits: sub.limits,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    usage: { readings, decks, spreads, rituals },
  });
};
