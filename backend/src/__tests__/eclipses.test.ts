import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '../database/prisma';
import { eclipsesLunares, eclipseVigente, proximoEclipse, type LunarEclipse } from '../services/eclipses';

/* ==========================================================================
   Eclipses lunares.

   Se prueban las dos partes con lógica: el recorte de la respuesta y el
   comportamiento de la caché. La consulta real al IMCCE no se prueba contra
   la red —sería un test que falla cuando el servidor francés está caído y no
   dice nada del código— sino con un `fetch` falso.

   El recorte importa por una razón concreta: la respuesta cruda pesa 1,5 MB
   por año, con la geometría de visibilidad. Si un campo se guardara entero, o
   si `duration.total` dejara de distinguir el total del parcial, la luna de
   sangre dejaría de detectarse sin que nada fallara visiblemente.
   ========================================================================== */

/** Un eclipse como lo devuelve el IMCCE, con todo el ruido incluido. */
function respuestaImcce(eclipses: unknown[]) {
  return {
    response: {
      calendar: 'gregorian',
      /* Esto es lo que pesa: la geometría de dónde se ve el eclipse. */
      visibilityLines: { features: [{ geometry: { coordinates: [[[1, 2, 3]]] } }] },
      lunareclipse: eclipses,
    },
  };
}

const TOTAL = {
  calendarDate: '2026-03-03',
  type: 'TotalEclipse',
  magnitude: 1.151,
  duration: { total: '00:58:23', partial: '03:27:14', penumbral: '05:38:40' },
  events: { greatest: { date: '2026-03-03T11:33:43' }, P1: { date: 'x' }, U2: { date: 'y' } },
  visibilityPaths: { features: [] },
};

const PARCIAL = {
  calendarDate: '2026-08-28',
  type: 'PartialEclipse',
  magnitude: 0.93027,
  duration: { partial: '03:18:12', penumbral: '05:37:48' },
  events: { greatest: { date: '2026-08-28T04:12:55' } },
};

const PENUMBRAL = {
  calendarDate: '2027-02-20',
  type: 'PenumbralEclipse',
  magnitude: 0.9265,
  duration: { penumbral: '04:01:01' },
  events: { greatest: { date: '2027-02-20T23:12:56' } },
};

/* Años que usan los tests. Cada uno se limpia al final, así que no ensucian la
   base de desarrollo ni chocan con otros archivos de test. */
const ANIOS = [2091, 2092, 2093];

async function limpiar() {
  await prisma.astronomyCache.deleteMany({ where: { key: { in: ANIOS.map((a) => `eclipses-lunares:${a}`) } } });
}

let llamadasFetch = 0;

beforeEach(async () => {
  await limpiar();
  llamadasFetch = 0;

  vi.stubGlobal('fetch', async (url: string) => {
    llamadasFetch += 1;
    const anio = Number(String(url).split('/').pop());
    const porAnio: Record<number, unknown[]> = {
      2091: [TOTAL, PARCIAL],
      2092: [PENUMBRAL],
      2093: [],
    };
    return {
      ok: true,
      json: async () => respuestaImcce(porAnio[anio] ?? []),
    } as Response;
  });
});

afterAll(async () => {
  await limpiar();
  vi.unstubAllGlobals();
});

describe('recorte de la respuesta del IMCCE', () => {
  it('traduce los tres tipos de eclipse', async () => {
    const lista = await eclipsesLunares(2091);
    expect(lista.map((e) => e.kind)).toEqual(['total', 'parcial']);

    const otros = await eclipsesLunares(2092);
    expect(otros.map((e) => e.kind)).toEqual(['penumbral']);
  });

  it('deja `totalidad` sólo en el eclipse total', async () => {
    const lista = await eclipsesLunares(2091);
    const [total, parcial] = lista;

    /* Es LA distinción de la luna de sangre. Un total sin duración de
       totalidad, o un parcial con ella, rompe la detección en silencio. */
    expect(total.totalidad).toBe('00:58:23');
    expect(parcial.totalidad).toBeNull();
  });

  it('conserva los campos que la app usa', async () => {
    const [total] = await eclipsesLunares(2091);
    expect(total).toEqual({
      fecha: '2026-03-03',
      kind: 'total',
      magnitud: 1.151,
      totalidad: '00:58:23',
      parcial: '03:27:14',
      penumbral: '05:38:40',
      mayor: '2026-03-03T11:33:43',
    });
  });

  it('descarta la geometría de visibilidad, que pesa 1,5 MB', async () => {
    const lista = await eclipsesLunares(2091);
    const fila = await prisma.astronomyCache.findUnique({
      where: { key: 'eclipses-lunares:2091' },
    });

    expect(JSON.stringify(lista)).not.toContain('visibilityLines');
    expect(JSON.stringify(lista)).not.toContain('coordinates');
    expect(fila!.payload.length).toBeLessThan(600);
  });

  it('devuelve lista vacía si la respuesta no tiene la forma esperada', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ nada: true }) }) as Response);
    expect(await eclipsesLunares(2091)).toEqual([]);
  });
});

describe('caché', () => {
  it('pregunta una vez y de ahí en adelante sirve de la base', async () => {
    await eclipsesLunares(2091);
    expect(llamadasFetch).toBe(1);

    await eclipsesLunares(2091);
    await eclipsesLunares(2091);
    expect(llamadasFetch).toBe(1);
  });

  it('cachea también el año sin eclipses', async () => {
    /* El caso que hace obligatorio el marcador: hay años sin ningún eclipse
       lunar. Sin guardar la lista vacía, cada request volvería a preguntar a
       la API, para siempre, y un año así no se puede distinguir de uno que
       todavía no se consultó. */
    expect(await eclipsesLunares(2093)).toEqual([]);
    await eclipsesLunares(2093);
    expect(llamadasFetch).toBe(1);

    const fila = await prisma.astronomyCache.findUnique({ where: { key: 'eclipses-lunares:2093' } });
    expect(fila).not.toBeNull();
  });

  it('borra una fila con JSON corrupto y vuelve a preguntar', async () => {
    await eclipsesLunares(2091);
    await prisma.astronomyCache.update({
      where: { key: 'eclipses-lunares:2091' },
      data: { payload: '{no es json' },
    });

    const lista = await eclipsesLunares(2091);
    /* Quedarse con la fila rota dejaría a la app sin eclipses hasta que
       alguien la borrara a mano. */
    expect(lista[0].kind).toBe('total');
    expect(llamadasFetch).toBe(2);
  });
});

describe('el servicio nunca tira', () => {
  it('devuelve vacío si la API falla', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }) as Response);
    expect(await eclipsesLunares(2091)).toEqual([]);
  });

  it('devuelve vacío si la API se cae', async () => {
    vi.stubGlobal(
      'fetch',
      async () => {
        throw new Error('ECONNREFUSED');
      },
    );
    expect(await eclipsesLunares(2091)).toEqual([]);
  });

  it('no cuelga si la petición no termina nunca', async () => {
    /* Con un timeout corto y reloj real. Los timers falsos no sirven acá:
       antes del `fetch` hay una consulta a la base, que es I/O real, y al
       avanzar el reloj el temporizador todavía ni está creado. */
    vi.stubGlobal(
      'fetch',
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          opts.signal.addEventListener('abort', () => rej(new Error('abortado')));
        }) as Promise<Response>,
    );

    expect(await eclipsesLunares(2091, 120)).toEqual([]);
  });

  it('le pasa un AbortSignal al fetch', async () => {
    /* El contrato con el que el timeout puede abortar. Si algún día se saca
       la señal, este test avisa. */
    let señal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      async (_url: string, opts: { signal: AbortSignal }) => {
        señal = opts.signal;
        return { ok: true, json: async () => respuestaImcce([]) } as Response;
      },
    );

    await eclipsesLunares(2091, 500);
    expect(señal).toBeInstanceOf(AbortSignal);
    expect(señal!.aborted).toBe(false);
  });
});

describe('eclipse vigente y próximo', () => {
  const dia = (s: string) => new Date(`${s}T12:00:00Z`);

  it('encuentra el eclipse de hoy y dice que es hoy', async () => {
    const r = await eclipseVigente(dia('2026-03-03'));
    expect(r?.esHoy).toBe(true);
    expect(r?.eclipse.kind).toBe('total');
  });

  it('no dice que es hoy el eclipse que ya pasó', async () => {
    /* Un eclipse total dura unas horas. Ayer ya no es, y confundir "pasó" con
       "es hoy" dejaría la etiqueta puesta días. */
    expect(await eclipseVigente(dia('2026-03-04'))).toBeNull();
  });

  it('da el próximo eclipse aunque no haya ninguno hoy', async () => {
    const r = await eclipseVigente(dia('2026-03-04'));
    expect(r).toBeNull();

    const p = await proximoEclipse(dia('2026-03-04'));
    expect(p?.fecha).toBe('2026-08-28');
  });

  it('cruza el cambio de año para un eclipse del 31 de diciembre', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const anio = Number(String(url).split('/').pop());
      const porAnio: Record<number, unknown[]> = {
        2091: [{ ...TOTAL, calendarDate: '2091-12-31' }],
        2092: [{ ...PARCIAL, calendarDate: '2092-01-10' }],
      };
      return { ok: true, json: async () => respuestaImcce(porAnio[anio] ?? []) } as Response;
    });

    /* Buscando en 2091 el eclipse es el 31/12; en 2092 es el 10/01. Si sólo
       mirara el año pedido, desde el 1º de enero no lo encontraría nunca. */
    const p = await proximoEclipse(dia('2092-01-01'));
    expect(p?.fecha).toBe('2092-01-10');
  });
});

/* Que el tipo que se exporta sea el que realmente produce el servicio: si el
   recorte cambia la forma y nadie actualiza el tipo, esto deja de compilar. */
describe('tipos', () => {
  it('LunarEclipse coincide con lo que devuelve el servicio', async () => {
    const lista: LunarEclipse[] = await eclipsesLunares(2091);
    expect(lista).toHaveLength(2);
  });
});