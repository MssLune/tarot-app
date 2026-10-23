import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { billingService, type SubscriptionInfo } from '../services/billingService';
import { useReadingStore } from '../store/useReadingStore';
import type { LimitedResource, Plan, PlanTier } from '../types';

/* ==========================================================================
   Plan del usuario.

   El backend es la fuente de verdad del límite. Este hook sólo muestra lo que
   el backend dice: si el contador dice "3 de 20" y al crear la cuarta el
   backend responde 402, el contador estaba mal. Nunca se calcula el límite
   acá para decidir si se puede o no, porque esa decisión la toma el servidor.
   ========================================================================== */

/** Rótulos de cada recurso, para las barras de uso. */
export const RESOURCE_LABEL: Record<LimitedResource, string> = {
  readings: 'Lecturas guardadas esta semana',
  decks: 'Mazos',
  spreads: 'Tiradas',
  rituals: 'Rituales',
};

export const RESOURCE_UNIT: Record<LimitedResource, string> = {
  readings: 'lecturas',
  decks: 'mazos',
  spreads: 'tiradas',
  rituals: 'rituales',
};

export function usePlan() {
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [noConfigurado, setNoConfigurado] = useState(false);
  const notice = useReadingStore((s) => s.planNotice);
  const dismissNotice = useReadingStore((s) => s.dismissPlanNotice);
  /* Cambian cuando el usuario guarda o borra algo: el contador se refresca
     solo, sin que cada pantalla tenga que acordarse de pedirlo. */
  const huella = useReadingStore(
    (s) =>
      `${s.history.length}|${s.customDecks.length}|${s.customSpreads.length}|${s.rituals.length}|${
        s.planNotice?.message ?? ''
      }`,
  );

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setInfo(null);
      return;
    }
    try {
      setLoading(true);
      const datos = await billingService.getSubscription();
      setInfo(datos);
      /* Sin Stripe configurado no hay Pro que contratar todavía, pero los
         topes del plan gratuito se aplican igual: el uso se muestra siempre. */
      setNoConfigurado(datos.pagoHabilitado === false);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (isAuthLoaded) void refresh();
  }, [isAuthLoaded, refresh, huella]);

  const plan: Plan = info?.plan ?? 'free';
  const tier: PlanTier | null = info?.tier ?? null;
  const limits = info?.limits;
  const usage = info?.usage;

  /** Progreso de un recurso, de 0 a 1. `null` si no hay tope. */
  const progress = useCallback(
    (resource: LimitedResource): number | null => {
      if (!limits || !usage) return null;
      const max = limits[resource];
      if (!Number.isFinite(max)) return null;
      return Math.min(1, usage[resource] / max);
    },
    [limits, usage],
  );

  /** true si el usuario ya llegó al tope. */
  const atLimit = useCallback(
    (resource: LimitedResource): boolean => {
      if (!limits || !usage) return false;
      return usage[resource] >= limits[resource];
    },
    [limits, usage],
  );

  /**
   * Va al checkout de Stripe para un plan concreto.
   *
   * `yaSosPro` viene del backend cuando el usuario ya es Pro: en ese caso no
   * hay checkout que abrir y lo que corresponde es el portal, no una compra
   * que Stripe va a rechazar.
   */
  const subscribe = useCallback(
    async (tier: PlanTier): Promise<'ok' | 'ya-pro' | 'de-por-vida' | 'error'> => {
      try {
        const { url, yaSosPro, dePorVida } = await billingService.createCheckout(tier);
        if (dePorVida) {
          await refresh();
          return 'de-por-vida';
        }
        if (yaSosPro) {
          await refresh();
          return 'ya-pro';
        }
        window.location.href = url;
        return 'ok';
      } catch {
        return 'error';
      }
    },
    [refresh],
  );

  /** Abre el portal de Stripe para gestionar la suscripción. */
  const manage = useCallback(async (): Promise<boolean> => {
    try {
      const { url } = await billingService.createPortal();
      window.location.href = url;
      return true;
    } catch {
      return false;
    }
  }, []);

  /* El de por vida no tiene nada que gestionar: no hay suscripción, ni
     facturas, ni tarjeta. Mandar al portal a alguien que compró para siempre
     sería mostrarle una pantalla vacía. */
  const isLifetime = tier === 'lifetime';

  return {
    plan,
    tier,
    isPro: plan === 'pro',
    isLifetime,
    limits,
    usage,
    status: info?.status ?? 'inactive',
    currentPeriodEnd: info?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: info?.cancelAtPeriodEnd ?? false,
    /** Stripe no está configurado en este entorno. */
    noConfigurado,
    /** Hay datos de plan (usuario con sesión y la API respondió). */
    cargado: info !== null,
    /** Cuándo puede volver a guardar una lectura, si está en el tope. */
    proximaLectura: info?.proximo?.readings ? new Date(info.proximo.readings) : null,
    loading,
    progress,
    atLimit,
    subscribe,
    manage,
    refresh,
    /** Aviso de límite alcanzado, para mostrar el cartel. */
    notice,
    dismissNotice,
  };
}
