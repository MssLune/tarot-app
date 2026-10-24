import { api } from './api';
import type { Plan, PlanLimits, PlanTier, PlanUsage } from '../types';

/* ==========================================================================
   Servicios de plan y cobro.
   ========================================================================== */

export interface SubscriptionInfo {
  plan: Plan;
  status: string;
  /** Cuál de los tres Pro, o null si está en gratuito. */
  tier: PlanTier | null;
  limits: PlanLimits;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: PlanUsage;
  /** Recursos que cuentan por semana y no en total (hoy, las lecturas). */
  periodo?: Partial<Record<'readings', 'semana'>>;
  /** Cuándo se libera el próximo uso, si está en el tope (ISO). */
  proximo?: Partial<Record<'readings', string | null>>;
  /** Si se puede pasar al Pro en este entorno (Stripe configurado). */
  pagoHabilitado?: boolean;
  /** Cuenta de administración: todo sin límite. */
  admin?: boolean;
}

export const billingService = {
  /**
   * Plan, límites y uso actual, en una sola llamada.
   *
   * Va junto a propósito: la pantalla de "MI PLAN" necesita los dos, y con dos
   * endpoints aparecería un instante en que la barra dice "3 de 20" y el plan
   * todavía no se pintó.
   */
  /* `/user/usage` y no `/billing/usage`: la de billing sólo existe con Stripe
     configurado, y los topes del plan gratuito se aplican siempre. */
  getSubscription: (): Promise<SubscriptionInfo> => api.get<SubscriptionInfo>('/user/usage'),

  /**
   * Genera el checkout de Stripe y devuelve la URL a la que redirigir.
   *
   * El plan va explícito: el backend necesita saber si es suscripción o pago
   * único, porque en Stripe son dos APIs distintas.
   */
  createCheckout: (tier: PlanTier): Promise<{ url: string; yaSosPro?: boolean; dePorVida?: boolean }> =>
    api.post<{ url: string; yaSosPro?: boolean; dePorVida?: boolean }>('/billing/checkout', { tier }),

  /** Portal de Stripe: cambiar tarjeta, ver facturas, cancelar. */
  createPortal: (): Promise<{ url: string }> =>
    api.post<{ url: string }>('/billing/portal', {}),
};
