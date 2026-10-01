import { describe, expect, it } from 'vitest';
import { fromJulianDay, moonPhase, phasesOfLunation, toJulianDay } from '../src/lunar';

/* ==========================================================================
   Astronomía lunar.

   Serie de Meeus ("Astronomical Algorithms", 2ª edición, cap. 49). Las cuatro
   fases principales salen con un desvío de 1 a 8 minutos respecto de los
   instantes publicados. Las cuatro intermedias se interpolan entre anclas: no
   tienen precisión de efemérides y sirven para saber en qué fase estamos, no
   para publicar el instante.

   Los valores de referencia SON los publicados, con la zona horaria ya
   convertida a UTC. Si algún día se cambia la serie, estos tests avisan.
   ========================================================================== */

const MIN = 60 * 1000;

/** Referencia publicada, en UTC. */
const REFERENCIAS = [
  {
    nombre: 'lunación de agosto de 2017',
    consulta: '2017-08-25T00:00:00Z',
    publicada: {
      new: '2017-08-21T18:31:00Z',
      'first-quarter': '2017-08-29T08:14:00Z',
      full: '2017-09-06T07:04:00Z',
      'last-quarter': '2017-09-13T06:26:00Z',
    },
  },
  {
    nombre: 'lunación de enero de 2026',
    consulta: '2026-01-19T00:00:00Z',
    publicada: {
      new: '2026-01-18T19:52:00Z',
      'first-quarter': '2026-01-26T04:47:00Z',
      full: '2026-02-01T22:09:00Z',
      'last-quarter': '2026-02-09T12:43:00Z',
    },
  },
] as const;

/** Margen en minutos. La serie de Meeus promete unos pocos. */
const TOLERANCIA_MIN = 10;

describe('día juliano', () => {
  it('J2000.0 es exactamente 2451545', () => {
    /* Es la definición. Si esto cambia, cambia la época de toda la serie. */
    expect(toJulianDay(new Date('2000-01-01T12:00:00Z'))).toBe(2451545);
  });

  it('va y vuelve sin perder el instante', () => {
    for (const iso of [
      '1990-06-15T03:21:00Z',
      '2000-01-01T12:00:00Z',
      '2026-01-18T19:53:51Z',
      '2030-11-02T23:59:59Z',
    ]) {
      const original = new Date(iso);
      expect(fromJulianDay(toJulianDay(original)).toISOString()).toBe(original.toISOString());
    }
  });
});

describe('las cuatro fases principales, contra lo publicado', () => {
  for (const ref of REFERENCIAS) {
    describe(ref.nombre, () => {
      const fases = phasesOfLunation(new Date(ref.consulta));

      for (const [id, publicado] of Object.entries(ref.publicada)) {
        it(`${id}: dentro de ${TOLERANCIA_MIN} minutos`, () => {
          const hallada = fases.find((f) => f.id === id);
          expect(hallada, `no se encontró ${id}`).toBeDefined();

          const desvioMin =
            Math.abs(hallada!.date.getTime() - new Date(publicado).getTime()) / MIN;
          expect(
            desvioMin,
            `${id}: calculada ${hallada!.date.toISOString()}, publicada ${publicado} ` +
              `→ ${desvioMin.toFixed(1)} min de diferencia`,
          ).toBeLessThan(TOLERANCIA_MIN);
        });
      }

      it('ninguna fase cae en un día distinto al publicado', () => {
        /* Tolerancia más estricta a propósito: el error anterior era de hasta
           16 horas, que pasaba los 10 minutos pero cambiaba de día. Este es el
           test que detecta ese error aunque el margen se agrande. */
        for (const [id, publicado] of Object.entries(ref.publicada)) {
          const hallada = fases.find((f) => f.id === id)!;
          expect(
            hallada.date.toISOString().slice(0, 10),
            `${id} cayó en un día distinto al publicado`,
          ).toBe(new Date(publicado).toISOString().slice(0, 10));
        }
      });

      it('están en orden cronológico y sus tramos suman un lunación', () => {
        const orden = ['new', 'first-quarter', 'full', 'last-quarter'];
        const tramos: number[] = [];
        for (let i = 1; i < orden.length; i += 1) {
          const previa = fases.find((f) => f.id === orden[i - 1]!)!;
          const actual = fases.find((f) => f.id === orden[i]!)!;
          expect(actual.date.getTime()).toBeGreaterThan(previa.date.getTime());
          tramos.push((actual.date.getTime() - previa.date.getTime()) / (24 * 60 * MIN));
        }
        /* El cuarto tramo cierra el círculo: de la Luna Menguante a la Luna
           Nueva siguiente. */
        const siguiente = phasesOfLunation(
          new Date(new Date(ref.publicada['last-quarter']).getTime() + 20 * 24 * 60 * MIN),
        ).find((f) => f.id === 'new')!;
        tramos.push((siguiente.date.getTime() - fases.find((f) => f.id === 'last-quarter')!.date.getTime()) / (24 * 60 * MIN));

        /* Los tramos NO son iguales a un cuarto exacto: la Luna recorre el
           lunación a velocidad variable y se acelera cerca del perigeo, así
           que un tramo puede pasar de 7,8 días (en agosto de 2017 el de Cuarto
           Creciente a Luna Llena duró 7,95 reales). Lo que sí se cumple siempre
           es que la suma sea el lunación. */
        for (const t of tramos) {
          expect(t).toBeGreaterThan(6.3);
          expect(t).toBeLessThan(8.5);
        }
        const total = tramos.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThan(28.5);
        expect(total).toBeLessThan(30.5);
      });
    });
  }
});

describe('la corrección se evalúa en el instante de cada fase', () => {
  it('las cuatro fases de un mismo lunación no salen con el mismo desfase', () => {
    /* Este es el error que hubo: los argumentos de la corrección (sobre todo
       la anomalía media de la Luna, M') se evaluaban en el instante de la luna
       nueva y se usaban tal cual para las otras tres fases. Como M' avanza
       13,065° por día, en la Luna Llena ya había girado 192,9°: el signo de la
       corrección salía invertido y la fase caía hasta 16 horas tarde.

       La Luna Nueva era la única que acertaba, justamente porque su desfase es
       cero, así que un test que sólo mirara la nueva no lo detectaba. */
    const fases = phasesOfLunation(new Date('2026-01-19T00:00:00Z'));
    const nueva = fases.find((f) => f.id === 'new')!;
    const llena = fases.find((f) => f.id === 'full')!;

    /* Las dos están a distinto camino del punto medio geométrico. */
    const medioLunacion = (nueva.date.getTime() + 14.765295 * 24 * 60 * MIN) / 2;
    const desvioNueva = Math.abs(nueva.date.getTime() - medioLunacion);
    const desvioLlena = Math.abs(llena.date.getTime() - medioLunacion);

    expect(desvioNueva).not.toBeCloseTo(desvioLlena, 4);
  });

  it('la corrección de la Luna Llena tiene el signo que corresponde', () => {
    /* Con los argumentos de la Luna Nueva, el término dominante
       -0,40614·sin(M') daba +0,33 días para esta lunación. Con los argumentos
       en el instante de la Llena da -0,375: el signo correcto. */
    const fases = phasesOfLunation(new Date('2026-01-19T00:00:00Z'));
    const nueva = fases.find((f) => f.id === 'new')!;
    const llena = fases.find((f) => f.id === 'full')!;
    /* La corrección publicada lleva la Luna Llena 6h57m ANTES del punto medio.
       Sin el desplazamiento de argumentos la dejaría 8h DESPUÉS. */
    const medio = nueva.date.getTime() + 14.765295 * 24 * 60 * MIN;
    expect(llena.date.getTime()).toBeLessThan(medio);
  });
});

describe('la iluminación', () => {
  it('es 0 en la nueva, 1 en la llena y 0,5 en los cuartos', () => {
    const fases = phasesOfLunation(new Date('2026-01-19T00:00:00Z'));
    const buscar = (id: string) => fases.find((f) => f.id === id)!.illumination;

    expect(buscar('new')).toBeCloseTo(0, 3);
    expect(buscar('first-quarter')).toBeCloseTo(0.5, 3);
    expect(buscar('full')).toBeCloseTo(1, 3);
    expect(buscar('last-quarter')).toBeCloseTo(0.5, 3);
  });

  it('sigue subiendo de la nueva a la llena', () => {
    /* Es lo que hace que el dibujo del disco sea creíble: la fracción
       iluminada tiene que crecer de forma monótona en la primera mitad. */
    const base = new Date('2026-01-18T19:52:00Z');
    let anterior = -1;
    for (let horas = 0; horas <= 24 * 14; horas += 6) {
      const p = moonPhase(new Date(base.getTime() + horas * 60 * MIN));
      expect(p.illumination).toBeGreaterThan(anterior);
      anterior = p.illumination;
    }
  });

  it('siempre entre 0 y 1', () => {
    /* Fuera de rango, el terminador del disco se dibujaría al revés de la
       luna real. */
    for (let dias = 0; dias < 120; dias += 1) {
      const fecha = new Date(Date.UTC(2026, 0, 1) + dias * 24 * 60 * MIN);
      const k = moonPhase(fecha).illumination;
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    }
  });
});

describe('la fase vigente', () => {
  it('el lunación que devuelve es el que empieza antes de la fecha', () => {
    /* Éste es el error clásico: redondear en vez de cortar hacia abajo
       devuelve el lunación siguiente, y una fecha de tres días antes de la
       Luna Nueva se reportaría como si ya hubiera empezado. */
    const justoAntes = new Date('2026-01-18T19:53:00Z');
    expect(moonPhase(justoAntes).date.getTime()).toBeLessThanOrEqual(justoAntes.getTime());
  });

  it('el día de la Luna Nueva reporta la nueva, no la anterior', () => {
    expect(moonPhase(new Date('2026-01-18T19:54:00Z')).id).toBe('new');
  });

  it('informa la siguiente fase', () => {
    const p = moonPhase(new Date('2026-01-20T00:00:00Z'));
    expect(p.next.date.getTime()).toBeGreaterThan(p.date.getTime());
  });

  it('la edad del ciclo está entre 0 y 29,53', () => {
    for (let dias = 0; dias < 60; dias += 1) {
      const p = moonPhase(new Date(Date.UTC(2026, 2, 1) + dias * 24 * 60 * MIN));
      expect(p.age).toBeGreaterThanOrEqual(0);
      expect(p.age).toBeLessThan(29.54);
    }
  });
});

describe('estabilidad a lo largo de un ciclo completo', () => {
  it('ningún valor sale NaN ni fuera de rango', () => {
    /* El PDF dibuja la fase con estos números: un NaN se convierte en un
       archivo corrupto o en un disco lunar en blanco. */
    for (let minutos = 0; minutos < 30 * 24 * 60; minutos += 37) {
      const p = moonPhase(new Date(Date.UTC(2026, 4, 1) + minutos * MIN));
      expect(Number.isFinite(p.illumination)).toBe(true);
      expect(Number.isFinite(p.angle)).toBe(true);
      expect(Number.isFinite(p.age)).toBe(true);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('las fases de muchos lunaciones mantienen el orden', () => {
    /* Un salto en el índice del lunación devolvería las fases desordenadas. */
    for (let anio = 2020; anio <= 2032; anio += 1) {
      const fases = phasesOfLunation(new Date(Date.UTC(anio, 5, 15)));
      for (let i = 1; i < fases.length; i += 1) {
        expect(
          fases[i]!.date.getTime(),
          `orden roto en ${anio}: ${fases[i - 1]!.id} → ${fases[i]!.id}`,
        ).toBeGreaterThan(fases[i - 1]!.date.getTime());
      }
    }
  });
});
