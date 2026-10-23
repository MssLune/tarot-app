import { afterEach, describe, expect, it } from 'vitest';
import {
  calendarMonth,
  deltaT,
  edadLunar,
  fasesPrincipalesEntre,
  iluminacionEn,
  lunaDelDia,
  moonPhase,
  proximaFasePrincipal,
} from '../src/lunar';

/* ==========================================================================
   La Luna de un día, la próxima fase y la iluminación real.

   Lo que fija este archivo:
   - El nombre de una fase principal se le da SÓLO al día local en que cae su
     instante. El mismo instante es otro día según la zona horaria, y los dos
     usuarios tienen razón.
   - Un mes puede tener cinco fases principales.
   - La iluminación es la real (elongación), no una interpolación.
   ========================================================================== */

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const zonaOriginal = process.env.TZ;

afterEach(() => {
  process.env.TZ = zonaOriginal;
});

/** Luna Llena de octubre de 2026, publicada: 26/10 04:12 UTC. */
const LLENA_OCT_2026 = new Date('2026-10-26T04:12:00Z');

describe('ΔT', () => {
  it('es del orden de un minuto en esta década', () => {
    /* Medido en 2026: ~69 s. El polinomio extrapola y da algo más. */
    expect(deltaT(2026)).toBeGreaterThan(60);
    expect(deltaT(2026)).toBeLessThan(80);
  });

  it('crece de 1900 a hoy', () => {
    expect(deltaT(1900)).toBeLessThan(deltaT(1950));
    expect(deltaT(1950)).toBeLessThan(deltaT(2000));
  });
});

describe('fasesPrincipalesEntre', () => {
  it('la Luna Llena de octubre de 2026, al minuto', () => {
    const [llena] = fasesPrincipalesEntre(
      new Date('2026-10-25T00:00:00Z'),
      new Date('2026-10-27T00:00:00Z'),
    );
    expect(llena.id).toBe('full');
    expect(Math.abs(llena.date.getTime() - LLENA_OCT_2026.getTime()) / MIN).toBeLessThan(2);
  });

  it('agosto de 2023 tiene cinco fases principales, con dos llenas', () => {
    process.env.TZ = 'UTC';
    const fases = fasesPrincipalesEntre(
      new Date('2023-08-01T00:00:00Z'),
      new Date('2023-09-01T00:00:00Z'),
    );
    expect(fases.map((f) => f.id)).toEqual(['full', 'last-quarter', 'new', 'first-quarter', 'full']);

    const marcadas = calendarMonth(2023, 7).filter((c) => c.enMes && c.fase);
    expect(marcadas.map((c) => c.date.getDate())).toEqual([1, 8, 16, 24, 31]);
  });

  it('están ordenadas y separadas entre 6 y 9 días', () => {
    const fases = fasesPrincipalesEntre(new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'));
    expect(fases.length).toBeGreaterThanOrEqual(48);
    for (let i = 1; i < fases.length; i += 1) {
      const dias = (fases[i].date.getTime() - fases[i - 1].date.getTime()) / DIA;
      expect(dias).toBeGreaterThan(6);
      expect(dias).toBeLessThan(9);
    }
  });
});

describe('proximaFasePrincipal', () => {
  it('es posterior al instante pedido y es la más cercana', () => {
    const desde = new Date('2026-10-23T12:00:00Z');
    const prox = proximaFasePrincipal(desde);
    expect(prox.id).toBe('full');
    expect(prox.date.getTime()).toBeGreaterThan(desde.getTime());
  });

  it('justo en el instante de una fase, devuelve la siguiente', () => {
    const [llena] = fasesPrincipalesEntre(new Date('2026-10-25T00:00:00Z'), new Date('2026-10-27T00:00:00Z'));
    expect(proximaFasePrincipal(llena.date).id).toBe('last-quarter');
  });
});

describe('el nombre del día depende de la zona horaria', () => {
  it('en Roma la Luna Llena es el 26; en Los Ángeles, el 25', () => {
    process.env.TZ = 'Europe/Rome';
    expect(lunaDelDia(new Date(2026, 9, 26, 12)).name).toBe('Luna Llena');
    expect(lunaDelDia(new Date(2026, 9, 25, 12)).name).not.toBe('Luna Llena');

    /* En Nueva York serían las 00:12 del 26: en octubre todavía rige el
       horario de verano (UTC−4). Los Ángeles (UTC−7) sí cae el 25. */
    process.env.TZ = 'America/Los_Angeles';
    expect(lunaDelDia(new Date(2026, 9, 25, 12)).name).toBe('Luna Llena');
    expect(lunaDelDia(new Date(2026, 9, 26, 12)).name).not.toBe('Luna Llena');
  });

  it('el día después de la Llena ya es Menguante, no "Llena" por varios días', () => {
    process.env.TZ = 'UTC';
    expect(lunaDelDia(new Date(2026, 9, 26, 12)).id).toBe('full');
    expect(lunaDelDia(new Date(2026, 9, 27, 12)).id).toBe('waning-gibbous');
    expect(lunaDelDia(new Date(2026, 9, 24, 12)).id).toBe('waxing-gibbous');
  });

  it('el día de la fase trae el instante exacto para mostrar la hora', () => {
    process.env.TZ = 'UTC';
    const dia = lunaDelDia(new Date(2026, 9, 26, 12));
    expect(dia.principal).toBeDefined();
    expect(Math.abs(dia.principal!.date.getTime() - LLENA_OCT_2026.getTime()) / MIN).toBeLessThan(2);
  });

  it('el último tramo se llama Luna Balsámica', () => {
    process.env.TZ = 'UTC';
    /* 8/10/2026: entre el Cuarto Menguante (3) y la Nueva (10). */
    expect(lunaDelDia(new Date(2026, 9, 8, 12)).name).toBe('Luna Balsámica');
  });

  it('los ocho tramos aparecen en orden a lo largo de un mes', () => {
    process.env.TZ = 'UTC';
    const ids = calendarMonth(2026, 9)
      .filter((c) => c.enMes)
      .map((c) => c.id)
      .filter((id, i, arr) => id !== arr[i - 1]);
    expect(ids).toEqual([
      'waning-gibbous',
      'last-quarter',
      'waning-crescent',
      'new',
      'waxing-crescent',
      'first-quarter',
      'waxing-gibbous',
      'full',
      'waning-gibbous',
    ]);
  });
});

describe('la iluminación real', () => {
  it('en los instantes de las fases da 0, 0,5 y 1 (±0,5 %)', () => {
    const fases = fasesPrincipalesEntre(new Date('2026-01-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'));
    const nominal = { new: 0, 'first-quarter': 0.5, full: 1, 'last-quarter': 0.5 } as const;
    for (const f of fases) {
      expect(Math.abs(iluminacionEn(f.date).illumination - nominal[f.id])).toBeLessThan(0.005);
    }
  });

  it('a mitad de camino entre la Nueva y el Cuarto sigue el coseno, no una recta', () => {
    /* A 45° de elongación la fracción es (1 − cos 45°)/2 = 0,146. La
       interpolación en línea recta daba 0,25. */
    const [nueva, cuarto] = fasesPrincipalesEntre(
      new Date('2026-01-18T00:00:00Z'),
      new Date('2026-01-27T00:00:00Z'),
    );
    const medio = new Date((nueva.date.getTime() + cuarto.date.getTime()) / 2);
    const k = iluminacionEn(medio).illumination;
    expect(k).toBeGreaterThan(0.12);
    expect(k).toBeLessThan(0.18);
  });

  it('moonPhase usa la iluminación real y la edad desde la Nueva real', () => {
    const p = moonPhase(new Date('2026-01-20T00:00:00Z'));
    const nueva = new Date('2026-01-18T19:52:00Z');
    expect(p.age).toBeCloseTo((new Date('2026-01-20T00:00:00Z').getTime() - nueva.getTime()) / DIA, 2);
    expect(p.illumination).toBeCloseTo(iluminacionEn(new Date('2026-01-20T00:00:00Z')).illumination, 6);
  });

  it('después de la Balsámica, la siguiente es la Nueva que viene, no la que pasó', () => {
    const tarde = new Date('2026-01-17T12:00:00Z');
    const p = moonPhase(tarde);
    expect(p.id).toBe('waning-crescent');
    expect(p.next.id).toBe('new');
    expect(p.next.date.getTime()).toBeGreaterThan(tarde.getTime());
  });
});

describe('edadLunar', () => {
  it('va de 0 a la duración del lunación, y vuelve a 0 en la Nueva', () => {
    const nueva = new Date('2026-01-18T19:52:00Z');
    expect(edadLunar(new Date(nueva.getTime() + 2 * MIN))).toBeLessThan(0.01);
    expect(edadLunar(new Date(nueva.getTime() - 2 * MIN))).toBeGreaterThan(29);
    for (let d = 0; d < 90; d += 1) {
      const e = edadLunar(new Date(Date.UTC(2026, 0, 1) + d * DIA));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThan(29.9);
    }
  });
});
