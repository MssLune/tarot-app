import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '../database/prisma';
import { retrogradosDe, retrogradosQueEmpiezan } from '../services/retrogrados';

/* ==========================================================================
   Retrógrados planetarios.

   Se prueban las TRES cosas que en este archivo han estado rotas y que no se
   ven mirando el código:

   1. El emparejamiento por posición. Se emparejaban las estaciones de dos en
      dos, y con los planetas exteriores eso da períodos de meses que no
      existen. Júpiter salió retrógrado del 11 de marzo al 13 de diciembre:
      277 días. El tipo de cada estación sale del SIGNO del movimiento, y el
      emparejamiento se hace por tipo.

   2. La ventana de consulta. Con la del año exacto, un retrógrado que empieza
      en noviembre del año anterior y termina en marzo se ve a medias, y
      parece que no ocurrió. Júpiter en 2026 empieza el 11 de noviembre de 2025.

   3. Las consultas en paralelo. Al JPL no se le cae encima: cinco planetas
      por vez y contesta error. Venus desaparecía del resultado.

   La red no se toca: el `fetch` se intercepta con una serie sintética que
   imita la forma de la respuesta del JPL. Probar contra la red real daría un
   test que falla cuando un servicio gratuito se cae y no dice nada del código.
   ========================================================================== */

const ANIOS = [2081, 2082];
const LIMPIAR = () =>
  prisma.astronomyCache.deleteMany({ where: { key: { in: ANIOS.map((a) => `retrogrados:${a}`) } } });

/**
 * Serie sintética con estaciones en fechas fijas.
 *
 * La longitud ES la señal: avanza a 1,2°/día, y en cada estación invierte el
 * sentido. Así el movimiento diario cambia de signo exactamente ahí, que es lo
 * que el detector mira. Se construye en una sola pasada porque en dos las dos
 * mitades discrepaban y el resultado no era ni señal ni ruido: era otra cosa.
 *
 * Las fechas van como `AAAA-MM-DD`, que es como las indexa el servicio.
 */
function serieConEstaciones(
  estaciones: [string, 'retro' | 'directa'][],
  desde: string,
  hasta: string,
) {
  const base = new Date(`${desde}T00:00:00Z`).getTime();
  const fin = new Date(`${hasta}T00:00:00Z`).getTime();
  const puntos: { fecha: string; hora: string; lon: number }[] = [];

  let lon = 100;
  /* El modo PEGA hasta la estación siguiente. Antes sólo se invertía el día de
     la estación y al siguiente ya volvía a avanzar, con lo que un retrógrado
     "duraba" un día y salían dos estaciones pegadas donde debía haber una
     sola: el par retrógrada/directa de un día, y luego nada. */
  let modo = 1;
  for (let t = base; t <= fin; t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    puntos.push({ fecha: iso, hora: '00:00', lon });

    const est = estaciones.find(([f]) => f === iso);
    if (est) modo = est[1] === 'retro' ? -1 : 1;

    lon += 1.2 * modo;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
  }
  return puntos;
}

/** Cuerpo de texto con el formato que devuelve Horizons. */
/**
 * Cuerpo de texto con el formato que devuelve Horizons.
 *
 * `planeta` no se usa para nada: la serie depende del código de cuerpo, que
 * el stub ya resuelve. Se deja el parámetro fuera para que la firma describa
 * de dónde viene la respuesta.
 */
function textoHorizons(puntos: { fecha: string; hora: string; lon: number }[]) {
  const MES: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };
  const filas = puntos
    .map((p) => ` ${p.fecha.slice(0, 4)}-${MES[p.fecha.slice(5, 7)]}-${p.fecha.slice(8, 10)} ${p.hora}     ${p.lon.toFixed(7)}   0.0`)
    .join('\n');
  return `API VERSION: 1.2\n$$SOE\n${filas}\n$$EOE\n***`;
}

/**
 * Estaciones de la serie sintética, por código de cuerpo del JPL.
 *
 * Júpiter tiene la retrógrada en 2080 y la directa en 2081: es el caso que
 * rompía el emparejamiento por posición, porque dentro del año pedido sólo
 * aparece UNA de las dos.
 */
const ESTACIONES_POR_CUERPO: Record<string, [string, 'retro' | 'directa'][]> = {
  /* Mercurio: dos retrógrados completos dentro de 2081. */
  199: [
    ['2081-03-10', 'retro'],
    ['2081-03-30', 'directa'],
    ['2081-07-05', 'retro'],
    ['2081-07-28', 'directa'],
  ],
  /* Venus: uno completo en 2081. */
  299: [
    ['2081-10-03', 'retro'],
    ['2081-11-14', 'directa'],
  ],
  /* Júpiter: empieza retrógrado en 2080 y acaba en 2081. */
  599: [
    ['2080-11-15', 'retro'],
    ['2081-03-11', 'directa'],
  ],
};

let llamadas: string[] = [];

beforeEach(async () => {
  await LIMPIAR();
  llamadas = [];

  vi.stubGlobal('fetch', async (url: string) => {
    llamadas.push(url);

    /* El cuerpo va en el comando; el rango, en START_TIME. La serie depende
       del CUERPO, no de la URL completa, porque el refinado hace consultas
       mucho más cortas sobre el mismo cuerpo. */
    const cuerpo = /COMMAND=%27(\d+)%27/.exec(url)?.[1];
    const desde = /START_TIME=%27([\d-]+)%27/.exec(url)?.[1] ?? '';
    const hasta = /STOP_TIME=%27([\d-]+)%27/.exec(url)?.[1] ?? '';

    const puntos = serieConEstaciones(ESTACIONES_POR_CUERPO[cuerpo ?? ''] ?? [], desde, hasta);
    return { ok: true, text: async () => textoHorizons(puntos) } as Response;
  });
});

afterAll(async () => {
  await LIMPIAR();
  vi.unstubAllGlobals();
});

describe('detección de estaciones', () => {
  it('empareja por tipo, no por posición', async () => {
    /* El bug 1. Júpiter sale con la directa primero porque el retrógrado
       empezó en 2080. Emparejando de dos en dos salía un período de meses
       que no existía. */
    const lista = await retrogradosDe(2081);
    const jupiter = lista.filter((p) => p.planeta === 'jupiter');

    expect(jupiter.length).toBeGreaterThan(0);
    for (const p of jupiter) {
      expect(p.hasta > p.desde).toBe(true);
      /* Un retrógrado de Júpiter dura entre 100 y 140 días. El bug daba 277. */
      expect(p.dias, `Júpiter ${p.desde}`).toBeLessThan(200);
      expect(p.dias).toBeGreaterThan(30);
    }
  });

  it('incluye un retrógrado que empezó antes del año pedido', async () => {
    /* El bug 2. Sin la ventana ampliada, el de Júpiter no aparecía: su
       estación retrógrada es de 2080 y sólo se veía la directa. */
    const lista = await retrogradosDe(2081);
    const jupiter = lista.filter((p) => p.planeta === 'jupiter');
    expect(jupiter.some((p) => p.desde.startsWith('2080'))).toBe(true);
  });

  it('consulta una ventana más ancha que el año pedido', async () => {
    await retrogradosDe(2081);
    /* La ventana va de noviembre del año anterior a enero del siguiente. */
    expect(llamadas.some((u) => u.includes('2080-11-01'))).toBe(true);
    expect(llamadas.some((u) => u.includes('2082-01-31'))).toBe(true);
  });

  it('no inventa períodos para planetas que no retrógradan', async () => {
    const lista = await retrogradosDe(2081);
    /* Marte y Saturno no tienen estaciones en la serie sintética. */
    expect(lista.filter((p) => p.planeta === 'mars')).toHaveLength(0);
  });

  it('sale ordenado por fecha de inicio', async () => {
    const lista = await retrogradosDe(2081);
    const fechas = lista.map((p) => p.desde);
    expect([...fechas].sort()).toEqual(fechas);
  });
});

describe('robustez y caché', () => {
  it('no tira si el JPL contesta error', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }) as Response);
    expect(await retrogradosDe(2081)).toEqual([]);
  });

  it('no tira si el JPL devuelve algo sin formato', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => 'nada' }) as Response);
    expect(await retrogradosDe(2081)).toEqual([]);
  });

  it('cachea, y la segunda vez no vuelve a preguntar', async () => {
    await retrogradosDe(2081);
    const primera = llamadas.length;
    expect(primera).toBeGreaterThan(0);

    await retrogradosDe(2081);
    expect(llamadas.length).toBe(primera);
  });

  it('cachea también el año sin retrógrados', async () => {
    /* Sin la fila vacía, un año así se volvería a preguntar en cada request. */
    await retrogradosDe(2082);
    const n = llamadas.length;
    await retrogradosDe(2082);
    expect(llamadas.length).toBe(n);
  });

  it('las consultas al JPL no van en paralelo', async () => {
    /* El bug 3. En paralelo le cae al JPL de golpe y contesta error, y
       Venus desaparecía del resultado. Con `fetch` falso no se ve la
       concurrencia, así que se comprueba que hay una pausa entre llamadas:
       en paralelo las cinco peticiones se solaparían en el mismo tick. */
    let simultaneas = 0;
    let maximo = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      llamadas.push(url);
      simultaneas += 1;
      maximo = Math.max(maximo, simultaneas);
      await new Promise((r) => setTimeout(r, 0));
      simultaneas -= 1;
      const cuerpo = /COMMAND=%27(\d+)%27/.exec(url)?.[1] ?? '';
      const desde = /START_TIME=%27([\d-]+)%27/.exec(url)?.[1] ?? '';
      const hasta = /STOP_TIME=%27([\d-]+)%27/.exec(url)?.[1] ?? '';
      const puntos = serieConEstaciones(ESTACIONES_POR_CUERPO[cuerpo] ?? [], desde, hasta);
      return { ok: true, text: async () => textoHorizons(puntos) } as Response;
    });

    await retrogradosDe(2081);
    expect(maximo).toBe(1);
  });
});

describe('retrogradosQueEmpieban', () => {
  const periodos = [
    { planeta: 'mercury' as const, nombre: 'Mercurio', desde: '2026-02-26T07:18:00.000Z', hasta: '2026-03-20T20:02:00.000Z', dias: 23 },
    { planeta: 'venus' as const, nombre: 'Venus', desde: '2026-02-26T10:00:00.000Z', hasta: '2026-11-14T00:00:00.000Z', dias: 260 },
  ];

  it('filtra por el día de inicio', () => {
    const r = retrogradosQueEmpiezan(periodos, '2026-02-26');
    expect(r).toHaveLength(2);
  });

  it('devuelve vacío si ese día no arranca ninguno', () => {
    expect(retrogradosQueEmpiezan(periodos, '2026-02-27')).toHaveLength(0);
  });

  it('compara sólo el día, no la hora', () => {
    /* La estación es un instante; la celda del calendario es un día. Si se
       comparara el ISO entero, una estación a las 00:30 no aparecería en la
       celda de su día. */
    const r = retrogradosQueEmpiezan(periodos, '2026-02-26');
    expect(r.some((p) => p.desde.endsWith('07:18:00.000Z'))).toBe(true);
  });
});