import { describe, expect, it, vi } from 'vitest';

/* Los price ids tienen que existir ANTES de que se cargue `plans.ts`, porque
   `tierFromPriceId` los lee del entorno para decidir qué plan es. Sin esto, el
   archivo importaría el módulo con los tres vacíos y todo precio devolvería
   'free'. */
const PRECIOS = vi.hoisted(() => {
  const p = {
    monthly: 'price_test_mensual',
    annual: 'price_test_anual',
    lifetime: 'price_test_vida',
  };
  process.env.STRIPE_MONTHLY_PRICE_ID = p.monthly;
  process.env.STRIPE_ANNUAL_PRICE_ID = p.annual;
  process.env.STRIPE_LIFETIME_PRICE_ID = p.lifetime;
  return p;
});

import {
  assertWithinLimit,
  effectiveTier,
  limitsFor,
  planFrom,
  tierFromPriceId,
  PLAN_LIMITS,
} from '../services/plans';

/* ==========================================================================
   Lógica de planes. Código puro: no toca la base ni Stripe, así que se
   puede verificar exhaustivamente.

   El caso que más se olvida está al final: `past_due`. Si una tarjeta falla,
   el mes ya está pagado. Bajar al usuario a plan gratuito ahí significa
   cortarle algo por lo que ya pagó.
   ========================================================================== */

describe('límites del plan gratuito', () => {
  const f = limitsFor('free', 'inactive');

  it('topes definidos para cada recurso', () => {
    /* 2 lecturas guardadas POR SEMANA (ver VENTANA_MS), sin tope total. */
    expect(f.readings).toBe(2);
    expect(f.decks).toBe(1);
    expect(f.spreads).toBe(2);
    expect(f.rituals).toBe(3);
  });

  it('con banner de promoción', () => {
    expect(f.showBanner).toBe(true);
  });
});

describe('límites del plan Pro', () => {
  const p = limitsFor('pro', 'active');

  it('ningún recurso tiene tope', () => {
    expect(p.readings).toBe(Number.POSITIVE_INFINITY);
    expect(p.decks).toBe(Number.POSITIVE_INFINITY);
    expect(p.spreads).toBe(Number.POSITIVE_INFINITY);
    expect(p.rituals).toBe(Number.POSITIVE_INFINITY);
  });

  it('sin banner', () => {
    expect(p.showBanner).toBe(false);
  });
});

describe('qué estado de Stripe cuenta como Pro', () => {
  it('active y trialing', () => {
    expect(planFrom('pro', 'active')).toBe('pro');
    expect(planFrom('pro', 'trialing')).toBe('pro');
  });

  it('past_due y unpaid conservan el acceso', () => {
    /* La tarjeta falló pero el período ya está pagado. */
    expect(planFrom('pro', 'past_due')).toBe('pro');
    expect(planFrom('pro', 'unpaid')).toBe('pro');
  });

  it('canceled, incomplete e inactive vuelven a free', () => {
    expect(planFrom('pro', 'canceled')).toBe('free');
    expect(planFrom('pro', 'incomplete')).toBe('free');
    expect(planFrom('pro', 'inactive')).toBe('free');
  });

  it('un plan que no es pro nunca da Pro', () => {
    /* including basura escrita a mano en la base */
    expect(planFrom('free', 'active')).toBe('free');
    expect(planFrom(null, 'active')).toBe('free');
    expect(planFrom('champion', 'active')).toBe('free');
  });
});

describe('el límite frena en el número correcto', () => {
  const intento = (recurso: 'readings' | 'decks' | 'spreads' | 'rituals', n: number) => {
    try {
      assertWithinLimit('free', 'inactive', recurso, n);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? 'error';
    }
  };

  it('permite llegar justo al tope y frena en el siguiente', () => {
    const casos = [
      ['readings', PLAN_LIMITS.free.readings],
      ['decks', PLAN_LIMITS.free.decks],
      ['spreads', PLAN_LIMITS.free.spreads],
      ['rituals', PLAN_LIMITS.free.rituals],
    ] as const;

    for (const [recurso, tope] of casos) {
      expect(intento(recurso, tope - 1)).toBeNull();
      expect(intento(recurso, tope)).toBe('PLAN_LIMIT_REACHED');
    }
  });

  it('el Pro nunca frena, ni con muchos elementos', () => {
    expect(intento('readings', 999_999)).toBe('PLAN_LIMIT_REACHED');
    try {
      assertWithinLimit('pro', 'active', 'readings', 999_999);
      expect(true).toBe(true);
    } catch {
      expect(false).toBe(true);
    }
  });

  it('el mensaje dice qué pasó y qué hacer', () => {
    try {
      assertWithinLimit('free', 'inactive', 'decks', 2);
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain('2 mazos');
      expect(m.toLowerCase()).toContain('pro');
    }
  });
});

describe('Pro con la tarjeta caída conserva lo pagado', () => {
  it('sigue sin topes', () => {
    const plan = planFrom('pro', 'past_due');
    expect(limitsFor(plan, 'past_due').readings).toBe(Number.POSITIVE_INFINITY);
  });

  it('no le aparece el banner de promoción', () => {
    /* Mostrarle "pasá al Pro" a alguien que ya es Pro por una caída de la
       tarjeta sería absurdo. */
    expect(limitsFor('pro', 'past_due').showBanner).toBe(false);
  });
});

/* ==========================================================================
   Los tres planes.

   Lo que importa acá es una sola regla: el PRECIO decide. Nunca un flag
   escrito a mano. Con un `prod_` en vez de un `price_`, o con un precio que
   no es ninguno de los tres, el usuario tiene que caer en gratuito —regalar
   Pro por error es peor que cobrar de menos, porque no se puede deshacer.
   ========================================================================== */

describe('qué plan es, según el precio', () => {
  it('reconoce los tres', () => {
    expect(tierFromPriceId(PRECIOS.monthly)).toBe('monthly');
    expect(tierFromPriceId(PRECIOS.annual)).toBe('annual');
    expect(tierFromPriceId(PRECIOS.lifetime)).toBe('lifetime');
  });

  it('un precio desconocido da null, no pro', () => {
    expect(tierFromPriceId('price_1AlgoDistinto999')).toBeNull();
  });

  it('un product id en vez de un price id da null', () => {
    /* El error de configuración más caro de esta sección, porque no da
       ningún síntoma: la comparación simplemente nunca coincide. */
    expect(tierFromPriceId('prod_VMPaYeAlgo')).toBeNull();
  });

  it('precio vacío o ausente da null', () => {
    expect(tierFromPriceId('')).toBeNull();
    expect(tierFromPriceId(null)).toBeNull();
    expect(tierFromPriceId(undefined)).toBeNull();
  });
});

describe('el de por vida no se degrada nunca', () => {
  it('sigue siendo lifetime aunque el estado sea cancelado', () => {
    /* Un webhook atrasado de una suscripción vieja no puede sacarle el Pro de
       por vida a alguien que ya pagó una sola vez y para siempre. */
    expect(effectiveTier('lifetime', 'canceled')).toBe('lifetime');
    expect(effectiveTier('lifetime', 'unpaid')).toBe('lifetime');
    expect(effectiveTier('lifetime', 'incomplete')).toBe('lifetime');
  });

  it('el mensual y el anual sí dependen del estado', () => {
    expect(effectiveTier('monthly', 'active')).toBe('monthly');
    expect(effectiveTier('monthly', 'trialing')).toBe('monthly');
    expect(effectiveTier('monthly', 'past_due')).toBe('monthly');
    expect(effectiveTier('monthly', 'canceled')).toBeNull();
  });

  it('un tier guardado que no existe da null', () => {
    /* Si mañana hay un plan nuevo y se olvida el case, esto degrada a
       gratuito en vez de inventarse acceso. */
    expect(effectiveTier('champion', 'active')).toBeNull();
    expect(effectiveTier('', 'active')).toBeNull();
  });

  it('sin tier no hay plan, aunque el plan guardado diga pro', () => {
    /* Esto lo resuelve `getSubscription` con el `planFrom` de respaldo, no
       `effectiveTier`: son responsabilidades distintas. */
    expect(effectiveTier(null, 'active')).toBeNull();
  });
});
