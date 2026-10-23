import { describe, expect, it } from 'vitest';
import { seasonsOf } from '../src/solar';
import { festivalsOf, nearestFestival } from '../src/festivals';

/* ==========================================================================
   Estaciones y festividades.

   Este archivo existe sobre todo por dos razones.

   La primera es que el calendario se CALCULA y no se escribe a mano. Ese es
   el punto entero de la pantalla: la respuesta a "¿hay que actualizarlo cada
   año?" es que no. Un test que compares contra años publicos futuros es lo que
   hace que esa respuesta siga siendo cierta dentro de diez años, cuando
   nadie se acuerde de por qué funciona.

   La segunda es másugsencia: la hora de un equinoccio depende de una serie de
   Newcomb que puede tener el signo cambiado, y el síntoma sería una fecha un
   día corrida —o un año entero, que es lo que pasó durante el desarrollo—.
   Un test que espera "el equinoccio de 2027 es el 20 de marzo" lo detecta al
   instante.

   REFERENCIAS: los valores oficiales del USNO (Observatorio Astronómico Naval
   de los Estados Unidos), que calcula con su propia efemérides. La diferencia
   medida contra ellos es de 9 minutos en el peor caso de 20 eventos sobre 5
   años, que es lo que la precisión del cap. 25 de Meeus promete.
   ========================================================================== */

const MIN = 60 * 1000;

/** Convierte una fecha juliana-época-UTC a `Date`, como la usa el servicio. */
function oficial(anio: number, mes: number, dia: number, hhmm: string): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))));
}

describe('estaciones del año', () => {
  /* Contra el USNO. Es el test que importa: si la serie se rompe, aquí se
     entera el mismo día. */
  const REFERENCIAS = [
    { anio: 2026, id: 'march-equinox', ref: oficial(2026, 3, 20, '14:46') },
    { anio: 2026, id: 'june-solstice', ref: oficial(2026, 6, 21, '08:24') },
    { anio: 2026, id: 'september-equinox', ref: oficial(2026, 9, 23, '00:05') },
    { anio: 2026, id: 'december-solstice', ref: oficial(2026, 12, 21, '20:50') },
    { anio: 2027, id: 'march-equinox', ref: oficial(2027, 3, 20, '20:25') },
    { anio: 2027, id: 'june-solstice', ref: oficial(2027, 6, 21, '14:11') },
    { anio: 2028, id: 'march-equinox', ref: oficial(2028, 3, 20, '02:17') },
    { anio: 2030, id: 'december-solstice', ref: oficial(2030, 12, 21, '20:09') },
  ];

  it('da las cuatro estaciones dentro de 15 minutos del valor oficial', () => {
    for (const { anio, id, ref } of REFERENCIAS) {
      const est = seasonsOf(anio).find((s) => s.id === id)!;
      const dif = Math.abs(est.date.getTime() - ref.getTime()) / MIN;
      expect(dif, `${id} de ${anio}`).toBeLessThan(15);
    }
  });

  it('cae en el día correcto, no en el vecino', () => {
    /* Un desvío de un día entero pasaría el test de 15 minutos si el umbral
       fuera una hora, y no lo es: el peor caso medido es 9 min. Este test
       ataja el otro error posible, que sería devolver la estación del año
       vecino. */
    for (const { anio, id, ref } of REFERENCIAS) {
      const est = seasonsOf(anio).find((s) => s.id === id)!;
      expect(est.date.getUTCDate(), `${id} de ${anio}`).toBe(ref.getUTCDate());
    }
  });

  it('mantiene el orden del año', () => {
    for (const anio of [2026, 2031, 2044]) {
      const fechas = seasonsOf(anio).map((s) => s.date.getTime());
      expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
    }
  });

  it('marca los solsticios como tales y los equinoccios como no', () => {
    for (const s of seasonsOf(2026)) {
      expect(s.solstice).toBe(s.id.includes('solstice'));
    }
  });

  it('el solsticio de invierno se corre de un año al otro', () => {
    /* 2026 cae el 21 y 2027 el 22. Con fechas fijas en el código, el test
       seguiría pasando y la app le mentiría al usuario dos años de cada
       cuatro. */
    expect(seasonsOf(2026)[3].date.getUTCDate()).toBe(21);
    expect(seasonsOf(2027)[3].date.getUTCDate()).toBe(22);
  });
});

describe('festividades', () => {
  it('son diez y están ordenadas', () => {
    const lista = festivalsOf(2026);
    expect(lista).toHaveLength(10);
    const fechas = lista.map((f) => f.date.getTime());
    expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
  });

  it('son las cuatro Hogueras y las cuatro estaciones', () => {
    const hogueras = festivalsOf(2026).filter((f) => f.granHoguera);
    expect(hogueras.map((h) => h.name)).toEqual([
      'Imbolc',
      'Beltane',
      'Lughnasadh',
      'Samhain',
    ]);
    expect(festivalsOf(2026).filter((f) => !f.fixed)).toHaveLength(4);
  });

  it('las fechas fijas no cambian con los años', () => {
    /* La mitad de la pantalla es esto: el 1 de febrero va a seguir siendo el
       1 de febrero dentro de veinte años, sin tocar una línea. */
    const a = festivalsOf(2026).filter((f) => f.fixed).map((f) => `${f.id}-${f.date.getDate()}`);
    const b = festivalsOf(2046).filter((f) => f.fixed).map((f) => `${f.id}-${f.date.getDate()}`);
    expect(b).toEqual(a);
  });

  it('cada festividad tiene resumen y detalle', () => {
    for (const f of festivalsOf(2026)) {
      expect(f.resumen.length, f.id).toBeGreaterThan(10);
      expect(f.detalle.length, f.id).toBeGreaterThan(150);
      /* El detalle tiene que ser sustantivo, no un placeholder: es lo que se
         lee al desplegar. SIN la `i` a propósito: con ella el patrón matchea
         "sobre todo", que aparece en varios textos, y el test falla siempre
         sin decir nada del código. */
      expect(f.detalle, f.id).not.toMatch(/TODO|lorem|xxx/);
    }
  });

  it('no repite ids entre años', () => {
    const ids = festivalsOf(2026).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('festividad más próxima', () => {
  const dia = (s: string) => new Date(`${s}T15:00:00`);

  it('devuelve la que es HOY, no la siguiente', () => {
    /* El caso que motivó la función: el 1 de febrero, Imbolc es la festividad
       de hoy. Buscando sólo hacia adelante, la app habría arrancado
       mostrando Beltane y ocultando lo que estaba pasando. */
    expect(nearestFestival(dia('2026-02-01'))?.festival.name).toBe('Imbolc');
    expect(nearestFestival(dia('2026-10-31'))?.festival.name).toBe('Samhain');
  });

  it('marca la distancia en días, y puede ser negativa', () => {
    expect(nearestFestival(dia('2026-02-01'))?.days).toBe(0);
    /* El 2 de mayo la más cercana es Beltane, que fue AYER. El signo importa:
       la app lo usa para decir "es hoy" y para contar los días que faltan, y
       un `Math.abs`Obligaría a mostrar "en 1 día" para algo que ya pasó. */
    expect(nearestFestival(dia('2026-05-02'))?.festival.name).toBe('Beltane');
    expect(nearestFestival(dia('2026-05-02'))?.days).toBe(-1);
  });

  it('si hoy no hay ninguna, da la más cercana de las dos sides', () => {
    /* El 15 de marzo, a mitad de camino entre Imbolc y el equinoccio. */
    const r = nearestFestival(dia('2026-03-15'));
    expect(r?.festival.name).toBe('Equinoccio de primavera');
    expect(r?.days).toBe(5);
  });
});