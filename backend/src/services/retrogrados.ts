import { prisma } from '../database/prisma';

/* ==========================================================================
   Retrógrados planetarios, de las efemérides del JPL.

   QUÉ ES UN RETRÓGRADO
   --------------------
   Un planeta interior (Mercurio, Venus) orbita al Sol más rápido que la
   Tierra. Cuando la Tierra lo alcanza en su camino, lo vemos pasar "hacia
   atrás" contra el fondo de estrellas. No es que el planeta se dé la vuelta:
   es la perspectiva. Por eso el Sol y la Luna NUNCA están retrógrados — el Sol
   no orbita nada, y la Luna orbita la Tierra en 27,55 días siempre hacia
   adelante.

   LA DEFINICIÓN QUE SE USA
   -----------------------
   El planeta está retrógrado cuando SU PROPIA longitud eclíptica geocéntrica
   decrece. Es la definición estándar, y es la que reproduce las fechas
   publicadas al minuto.

   Ojo con el error fácil: comparar contra el Sol. La longitud del Sol menos
   la del planeta da la ELONGACIÓN, y para un interior va de −28° a +28°: se
   detiene en la elongación máxima, que NO es la estación retrógrada. Se
   comprobó: con esa cuenta Mercurio daba estaciones donde la elongación se
   frenaba, que son otros días. Con la longitud del planeta sola, la fecha
   sale exacta.

   LA FUENTE
   ---------
   JPL Horizons, la efemérides planetaria DE441 de la NASA. Gratis, sin clave,
   y es la que usan los astrónomos profesionales. No hay tabla que mantener:
   cualquier año, hasta donde se quiera, sale de la misma consulta.

   La estación es el instante donde la derivada de la longitud pasa por cero:
   un máximo local de la longitud = estación retrógrada, un mínimo = directa.
   Se busca el cambio de signo del movimiento diario y después se refina por
   interpolación lineal, porque con paso de un día el cruce queda a ±1 día.
   ========================================================================== */

const BASE = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/** Códigos de cuerpo del JPL. */
const CUERPOS = {
  mercury: { id: '199', nombre: 'Mercurio' },
  venus: { id: '299', nombre: 'Venus' },
  mars: { id: '499', nombre: 'Marte' },
  jupiter: { id: '599', nombre: 'Júpiter' },
  saturn: { id: '699', nombre: 'Saturno' },
} as const;

export type PlanetId = keyof typeof CUERPOS;

export interface RetrogradePeriod {
  /** Cuerpo del que se trata. */
  planeta: PlanetId;
  /** Nombre del cuerpo, para no mandar el id al cliente. */
  nombre: string;
  /** Instante de la estación retrógrada: el día que empieza. */
  desde: string;
  /** Instante de la estación directa: el día que termina. */
  hasta: string;
  /**
   * Días que dura el retrógrado, redondeado.
   *
   * Viene del calculation, no de restar fechas: es la diferencia entre los dos
   * instantes redondeada al día. Sirve para el cartel ("21 días").
   */
  dias: number;
}

/** El observador: geocentro terrestre, que es la convención estándar. */
const CENTRO = '500@399';

/** Devuelve el nombre del mes en abreviatura que usa Horizons. */
const MESES: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "2026-Feb-20" → "2026-02-20". `new Date` no parsea el nombre de mes. */
function aIso(fecha: string): string {
  return `${fecha.slice(0, 4)}-${MESES[fecha.slice(5, 8)]}-${fecha.slice(9, 11)}`;
}

/** Diferencia angular con signo, en (−180, 180]. */
function norm180(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180;
}

/* --------------------------------------------------------------------------
   Consulta al JPL
   -------------------------------------------------------------------------- */

interface Punto {
  fecha: string;
  hora: string;
  lon: number;
}

async function consultar(cuerpo: string, desde: string, hasta: string, paso: string): Promise<Punto[]> {
  const url =
    `${BASE}?format=text&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER` +
    `&CENTER=%27${CENTRO}%27` +
    `&START_TIME=%27${desde}%27&STOP_TIME=%27${hasta}%27&STEP_SIZE=%27${paso}%27` +
    `&QUANTITIES=%2731%27&COMMAND=%27${cuerpo}%27`;

  const respuesta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!respuesta.ok) return [];

  const texto = await respuesta.text();
  const desde_ = texto.indexOf('$$SOE');
  const hasta_ = texto.indexOf('$$EOE');
  if (desde_ < 0 || hasta_ < 0) return [];

  return texto
    .slice(desde_ + 6, hasta_)
    .trim()
    .split('\n')
    .map((linea) => {
      const p = linea.trim().split(/\s+/);
      return { fecha: aIso(p[0]), hora: p[1], lon: parseFloat(p[2]) };
    })
    .filter((p) => Number.isFinite(p.lon));
}

/* --------------------------------------------------------------------------
   Detección de estaciones
   -------------------------------------------------------------------------- */

/**
 * Las estaciones del período consultado, con su tipo.
 *
 * El tipo sale del SIGNO del movimiento, no de la posición en la lista, y esa
 * diferencia es un bug que ya se cometió: se emparejaban de dos en dos
 * asumiendo que la primera de cada par es retrógrada. Con los planetas
 * exteriores eso es falso —si el año arranca ya en retrógrado, la primera
 * estación que aparece es la DIRECTA— y el emparejamiento se corría. Júpiter
 * salía retrógrado del 11 de marzo al 13 de diciembre: 277 días, un período
 * que no existe.
 *
 *   movimiento + → − : máximo local de la longitud = empieza a ir atrás
 *   movimiento − → + : mínimo local = vuelve a ir adelante
 */
function estacionesBrutas(puntos: Punto[]): { fecha: string; retrogradA: boolean }[] {
  const movimiento: { fecha: string; v: number }[] = [];
  for (let i = 1; i < puntos.length; i += 1) {
    movimiento.push({ fecha: puntos[i].fecha, v: norm180(puntos[i].lon - puntos[i - 1].lon) });
  }

  const crudas: { fecha: string; retrogradA: boolean }[] = [];
  for (let i = 1; i < movimiento.length - 1; i += 1) {
    if (movimiento[i - 1].v > 0 && movimiento[i].v <= 0) {
      crudas.push({ fecha: movimiento[i].fecha, retrogradA: true });
    } else if (movimiento[i - 1].v < 0 && movimiento[i].v >= 0) {
      crudas.push({ fecha: movimiento[i].fecha, retrogradA: false });
    }
  }
  return crudas;
}

/** El instante exacto del cruce, interpolando entre los dos puntos. */
function instanteCero(puntos: Punto[]): Date | null {
  for (let i = 2; i < puntos.length; i += 1) {
    const va = norm180(puntos[i - 1].lon - puntos[i - 2].lon);
    const vb = norm180(puntos[i].lon - puntos[i - 1].lon);
    const t0 = new Date(`${puntos[i - 1].fecha}T${puntos[i - 1].hora}:00Z`).getTime();
    if (va > 0 && vb <= 0) return new Date(t0 + (va / (va - vb)) * 3_600_000);
    if (va < 0 && vb >= 0) return new Date(t0 + (-va / (vb - va)) * 3_600_000);
  }
  return null;
}

/**
 * Períodos retrógrados de un cuerpo que TOCAN un año.
 *
 * La ventana de consulta va DEL 1 DE NOVIEMBRE DEL AÑO ANTERIOR AL 31 DE ENERO
 * DEL SIGUIENTE, no el año exacto. Es lo que garantiza que todo retrógrado
 * que solapa el año pedido tenga LAS DOS estaciones dentro de la consulta:
 *
 * - uno que empieza en noviembre del año pasado y termina en marzo: sin la
 *   ventana ampliada sólo se ve la estación directa, y no se puede saber que
 *   empezó antes.
 * - uno que empieza en noviembre y termina en marzo del año siguiente: igual,
 *   sólo se ve la retrógrada.
 *
 * Después se filtran los que de verdad tocan el año pedido. Con la ventana del
 * año exacto, Júpiter salió retrógrado del 11 de marzo al 13 de diciembre.
 *
 * Las consultas son SECUENCIALES a propósito. En paralelo, cinco planetas ×
 * (una anual + una por estación) le cae al JPL de golpe, que es un servicio
 * público y gratuito, y contesta con error. Venus desaparecía del resultado
 * por eso, no por cálculo. Encadenadas van igual de rápido para el usuario,
 * que sólo espera la primera vez y después está cacheado.
 */
async function periodosDeCuerpo(cuerpo: string, anio: number): Promise<{ desde: Date; hasta: Date }[]> {
  const anterior = (anio - 1).toString().padStart(4, '0');
  const indice = anio.toString().padStart(4, '0');
  const siguiente = (anio + 1).toString().padStart(4, '0');

  const serie = await consultar(cuerpo, `${anterior}-11-01`, `${siguiente}-01-31`, '1d');
  if (serie.length === 0) return [];

  /* Instante exacto de cada estación, refinado a una hora. */
  const estaciones: { instante: Date; retrogradA: boolean }[] = [];
  for (const dia of estacionesBrutas(serie)) {
    const t0 = new Date(`${dia.fecha}T00:00:00Z`).getTime();
    const dosDias = 2 * 86_400_000;
    const desde = new Date(t0 - dosDias).toISOString().slice(0, 10);
    const hasta = new Date(t0 + dosDias).toISOString().slice(0, 10);
    const fino = await consultar(cuerpo, desde, hasta, '1h');
    const instante = instanteCero(fino);
    /* Si el refinado falla, se usa el día crudo. Mejor un día de margen que
       perder la estación entera. */
    estaciones.push({ instante: instante ?? new Date(`${dia.fecha}T00:00:00Z`), retrogradA: dia.retrogradA });
  }

  /* Cada estación DIRECTA cierra el retrógrado que empezó en la estación
     RETRÓGRADA anterior. Se busca hacia atrás, no "de dos en dos", por lo
     dicho arriba. */
  const periodos: { desde: Date; hasta: Date }[] = [];
  for (let i = 0; i < estaciones.length; i += 1) {
    if (estaciones[i].retrogradA) continue;
    const anteriorRetro = estaciones
      .slice(0, i)
      .reverse()
      .find((e) => e.retrogradA);
    if (anteriorRetro) periodos.push({ desde: anteriorRetro.instante, hasta: estaciones[i].instante });
  }

  /* Sólo los que tocan el año pedido. */
  const inicio = new Date(`${indice}-01-01T00:00:00Z`).getTime();
  const fin = new Date(`${indice}-12-31T23:59:59Z`).getTime();
  return periodos.filter((p) => p.desde.getTime() <= fin && p.hasta.getTime() >= inicio);
}

/* --------------------------------------------------------------------------
   Caché
   -------------------------------------------------------------------------- */

const claveDe = (anio: number) => `retrogrados:${anio}`;

async function deCache(anio: number): Promise<RetrogradePeriod[] | null> {
  const fila = await prisma.astronomyCache.findUnique({ where: { key: claveDe(anio) } });
  if (!fila) return null;
  try {
    return JSON.parse(fila.payload) as RetrogradePeriod[];
  } catch {
    await prisma.astronomyCache.delete({ where: { key: claveDe(anio) } }).catch(() => {});
    return null;
  }
}

/* --------------------------------------------------------------------------
   API
   -------------------------------------------------------------------------- */

const PLANETAS = Object.keys(CUERPOS) as PlanetId[];

/**
 * Retrógrados de un año, para los cinco planetas visibles.
 *
 * NUNCA tira. Si el JPL está caído, la app sigue funcionando: la pantalla de la
 * Luna muestra las fases y las festividades igual, sólo que sin los
 * retrógrados. Peor no es que falte el dato.
 *
 * Un `AbortSignal` de 20 s por consulta porque sin él una petición colgada
 * deja la request abierta para siempre, y el usuario mirando una pantalla que
 * no carga.
 */
export async function retrogradosDe(anio: number): Promise<RetrogradePeriod[]> {
  const guardado = await deCache(anio);
  if (guardado) return guardado;

  try {
    /* Encadenado, no en paralelo: ver la nota de `periodosDeCuerpo`. */
    const porPlaneta: RetrogradePeriod[][] = [];
    for (const planeta of PLANETAS) {
      try {
        const periodos = await periodosDeCuerpo(CUERPOS[planeta].id, anio);
        porPlaneta.push(
          periodos.map((p) => ({
            planeta,
            nombre: CUERPOS[planeta].nombre,
            desde: p.desde.toISOString(),
            hasta: p.hasta.toISOString(),
            dias: Math.round((p.hasta.getTime() - p.desde.getTime()) / 86_400_000),
          })),
        );
      } catch {
        porPlaneta.push([]);
      }
    }

    const lista = porPlaneta.flat().sort((a, b) => a.desde.localeCompare(b.desde));

    await prisma.astronomyCache
      .create({ data: { key: claveDe(anio), payload: JSON.stringify(lista) } })
      .catch(() => {
        /* Otro proceso lo guardó primero. No es un error: el dato es el mismo. */
      });
    return lista;
  } catch {
    return [];
  }
}

/** El retrógrado que empieza un día dado, de cualquier planeta. */
export function retrogradosQueEmpiezan(periodos: RetrogradePeriod[], dia: string): RetrogradePeriod[] {
  return periodos.filter((p) => p.desde.slice(0, 10) === dia);
}