import { describe, expect, it } from 'vitest';
import { assertWithinLimit, limitsFor, planFrom, PLAN_LIMITS } from '../services/plans';

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
    expect(f.readings).toBe(20);
    expect(f.decks).toBe(2);
    expect(f.spreads).toBe(3);
    expect(f.rituals).toBe(5);
  });

  it('sin PDF y con banner de promoción', () => {
    expect(f.pdfExport).toBe(false);
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

  it('con PDF y sin banner', () => {
    expect(p.pdfExport).toBe(true);
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
