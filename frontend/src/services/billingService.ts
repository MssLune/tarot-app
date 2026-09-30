import { api } from './api';
import type { Plan, PlanLimits, PlanUsage } from '../types';

/* ==========================================================================
   Servicios de plan y cobro.
   ========================================================================== */

export interface SubscriptionInfo {
  plan: Plan;
  status: string;
  limits: PlanLimits;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: PlanUsage;
}

export const billingService = {
  /**
   * Plan, límites y uso actual, en una sola llamada.
   *
   * Va junto a propósito: la pantalla de "MI PLAN" necesita los dos, y con dos
   * endpoints aparecería un instante en que la barra dice "3 de 20" y el plan
   * todavía no se pintó.
   */
  getSubscription: (): Promise<SubscriptionInfo> => api.get<SubscriptionInfo>('/billing/usage'),

  /** Genera el checkout de Stripe y devuelve la URL a la que redirigir. */
  createCheckout: (): Promise<{ url: string; yaSosPro?: boolean }> =>
    api.post<{ url: string; yaSosPro?: boolean }>('/billing/checkout', {}),

  /** Portal de Stripe: cambiar tarjeta, ver facturas, cancelar. */
  createPortal: (): Promise<{ url: string }> =>
    api.post<{ url: string }>('/billing/portal', {}),
};
