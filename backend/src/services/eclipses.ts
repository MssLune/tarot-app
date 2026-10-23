import { prisma } from '../database/prisma';

/* ==========================================================================
   Eclipses lunares, del IMCCE.

   El IMCCE (Institut de Mécanique Céleste et de Calcul des Éphémérides) es el
   observatorio astronómico oficial de Francia, el equivalente del USNO
   estadounidense. Ambos tienen API pública y sin clave, pero sólo el USNO tiene
   la de eclipses, y es SOLARES. La de lunares no existe: `eclipses/lunar/year`
   da 404. Por eso el que se usa es el IMCCE, que sí publica lunares.

   Por qué esto no se calcula como las fases: un eclipse depende de la
   cercanía de la Luna a un nodo de su órbita, y predecirlo con series es el
   capítulo más difícil de Meeus. Traerlo hecho, de un observatorio nacional y
   con efemérides INPOP19A, sale más barato y más exacto.

   LA RESPUESTA PESA 1,5 MB POR AÑO. Trae `visibilityLines` y `visibilityPaths`,
   que son la geometría de dónde se ve el eclipse, punto por punto. Nada de eso
   lo usa la app. Por eso se guarda sólo una versión recortada a seis campos, y
   por eso la llamada se cachea: no se puede pedir 1,5 MB a un servidor
   * francés cada vez que alguien abre la pantalla de la luna.
   ========================================================================== */

const BASE = 'https://opale.imcce.fr/api/v1/phenomena/eclipses';

/** `301` es el código de cuerpo del IMCCE para la Luna. */
const CUERPO_LUNA = 301;

export type EclipseKind = 'total' | 'parcial' | 'penumbral';

export interface LunarEclipse {
  /** Día del eclipse, a medianoche UTC. */
  fecha: string;
  kind: EclipseKind;
  /** Magnitud del eclipse. */
  magnitud: number;
  /** Duración de la totalidad. Sólo en los totales: es lo que define la luna
   *  de sangre. */
  totalidad: string | null;
  /** Duración de la fase parcial. */
  parcial: string | null;
  /** Duración de la fase penumbral. */
  penumbral: string | null;
  /** Instante del máximo del eclipse, ISO. */
  mayor: string | null;
}

/** Claves de caché. */
const claveDe = (anio: number) => `eclipses-lunares:${anio}`;

/* --------------------------------------------------------------------------
   Recorte de la respuesta
   -------------------------------------------------------------------------- */

/**
 * Traduce `type` del IMCCE a los tres casos que la app distingue.
 *
 * El nombre en inglés se queda como está en el tipo, no como string suelto: es
 * parte del contrato del servicio y escribirlo aquí evita que un typo en el
 * mapeo se descubra recién en producción.
 */
function kindDe(type: string): EclipseKind {
  if (type === 'TotalEclipse') return 'total';
  if (type === 'PartialEclipse') return 'parcial';
  return 'penumbral';
}

/** La respuesta cruda, reducida a lo que la app usa. */
function recortar(crudo: unknown): LunarEclipse[] {
  const respuesta = crudo as { response?: { lunareclipse?: unknown[] } };
  const lista = respuesta?.response?.lunareclipse;
  if (!Array.isArray(lista)) return [];

  return lista.map((e) => {
    const x = e as {
      calendarDate?: string;
      type?: string;
      magnitude?: number;
      duration?: { total?: string; partial?: string; penumbral?: string };
      events?: { greatest?: { date?: string } };
    };
    return {
      fecha: x.calendarDate ?? '',
      kind: kindDe(x.type ?? ''),
      magnitud: x.magnitude ?? 0,
      /* `?? null` y no `|| ''`: una duración de "00:00:00" es un dato real
         (un eclipse total que dura nada), no un campo faltante. */
      totalidad: x.duration?.total ?? null,
      parcial: x.duration?.partial ?? null,
      penumbral: x.duration?.penumbral ?? null,
      mayor: x.events?.greatest?.date ?? null,
    };
  });
}

/* --------------------------------------------------------------------------
   Consulta
   -------------------------------------------------------------------------- */

/**
 * Eclipses lunares de un año, de la caché.
 *
 * Devuelve `null` si todavía no se/cacheó ese año, para que el que llama
 * distinga "no hay eclipses" de "no sé todavía". No es un detalle: 2027 no
 * tiene ningún eclipse total, y confundirse con "no sé" haría que la app
 * dijera que no hay nada que mostrar cuando en realidad no lo sabe.
 */
async function deCache(anio: number): Promise<LunarEclipse[] | null> {
  const fila = await prisma.astronomyCache.findUnique({ where: { key: claveDe(anio) } });
  if (!fila) return null;
  try {
    return JSON.parse(fila.payload) as LunarEclipse[];
  } catch {
    /* Un JSON corrupto es peor que un cache miss: se borra y se vuelve a
       pedir. La fila existe pero no sirve, y quedarse con ella para siempre
       dejaría a la app sin eclipses hasta que alguien la borre a mano. */
    await prisma.astronomyCache.delete({ where: { key: claveDe(anio) } }).catch(() => {});
    return null;
  }
}

/**
 * Eclipses lunares de un año, consultando la API si hace falta.
 *
 * NUNCA tira. Si el IMCCE está caído o cambia la respuesta, la app sigue
 * funcionando: peor no es tener la luna de sangre.
 *
 * `timeoutMs` es configurable y no sólo por los tests: un worker que reintenta
 * en segundo plano tolera más espera que una request que el usuario tiene
 * abierta. El AbortSignal evita que una petición colgada deje la request viva
 * para siempre.
 */
export async function eclipsesLunares(anio: number, timeoutMs = 10_000): Promise<LunarEclipse[]> {
  const guardado = await deCache(anio);
  if (guardado) return guardado;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let cruda: unknown;
    try {
      const r = await fetch(`${BASE}/${CUERPO_LUNA}/${anio}`, { signal: ctrl.signal });
      if (!r.ok) return [];
      cruda = await r.json();
    } finally {
      clearTimeout(t);
    }

    const lista = recortar(cruda);
    /* Se cachea incluso la lista vacía, y eso es lo importante: hay años sin
       ningún eclipse lunar, y sin la fila vacía guardada se volvería a
       preguntar en cada request, para siempre. */
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

/**
 * Eclipse lunar vigente en una fecha, o el próximo si hoy no hay ninguno.
 *
 * Es lo que la pantalla de la luna consulta para poner "luna de sangre" o no.
 */
export async function eclipseVigente(
  fecha: Date,
): Promise<{ eclipse: LunarEclipse; esHoy: boolean } | null> {
  const dia = fecha.toISOString().slice(0, 10);
  const anio = fecha.getUTCFullYear();

  // El eclipse cae en un día, pero buscar en el año vecino tampoco cuesta: si
  // el eclipse es el 31 de diciembre, el año que viene es donde hay que mirar.
  for (const a of [anio, anio + 1]) {
    const lista = await eclipsesLunares(a);
    const hoy = lista.find((e) => e.fecha === dia);
    if (hoy) return { eclipse: hoy, esHoy: true };
  }
  return null;
}

/** Próximo eclipse lunar a partir de una fecha, de cualquier tipo. */
export async function proximoEclipse(fecha: Date): Promise<LunarEclipse | null> {
  const dia = fecha.toISOString().slice(0, 10);
  const anio = fecha.getUTCFullYear();
  for (const a of [anio, anio + 1]) {
    const lista = await eclipsesLunares(a);
    const siguiente = lista.find((e) => e.fecha >= dia);
    if (siguiente) return siguiente;
  }
  return null;
}