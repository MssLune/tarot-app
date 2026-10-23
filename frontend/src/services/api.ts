/* ==========================================================================
   Cliente HTTP base para hablar con la API de Arcana.
   Centraliza la URL base, el parseo de JSON y el desempaquetado del sobre
   { success, data } / { success, error } que devuelve el backend, para que
   los servicios de dominio (cardsService, spreadsService) no repitan fetch().
   ========================================================================== */

import { getToken } from '@clerk/react';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /* Token de sesión de Clerk: sin él las rutas /api/user y /api/admin
     responden 401, aunque el usuario esté con sesión iniciada en el browser. */
  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    // Sin Clerk inicializado (contenido público) seguimos sin token.
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      /* Sin esto el browser revalida con ETag y el server responde 304, que
         viene SIN body. `response.json()` fallaría y toda llamada "exitosa"
         se rompería al segundo render. Una API JSON como ésta no debe usar
         la caché HTTP del browser. */
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar con la API. ¿Está corriendo el servidor?');
  }

  const body = (await response.json().catch(() => null)) as
    | SuccessEnvelope<T>
    | ErrorEnvelope
    | null;

  /* Fallo explícito del servidor (4xx/5xx) o sobre con success:false. */
  if (response.status >= 400 || (body && body.success === false)) {
    const err = body && body.success === false ? body.error : undefined;
    throw new ApiRequestError(
      response.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? `Error inesperado (HTTP ${response.status}).`,
    );
  }

  /* Éxito sin sobre parseable. No debería ocurrir: la API siempre responde
     { success, data }. Si ocurre, fallamos con un mensaje claro en vez de
     devolver `undefined` y corromper el estado del store en silencio. */
  if (!body || body.success !== true) {
    throw new ApiRequestError(
      response.status,
      'MALFORMED_RESPONSE',
      'La API respondió sin el formato esperado (falta el sobre { success, data }).',
    );
  }

  return body.data;
}

/**
 * Origen del backend, sin el sufijo `/api`.
 *
 * Va aparte porque hay URLs que NO pasan por `API_URL`: las imágenes de las
 * cartas las sirve el backend en `/assets/cards/...`, fuera del prefijo de la
 * API.
 */
const ORIGEN = API_URL.replace(/\/api\/?$/, '');

/**
 * Convierte una ruta de archivo del backend en una URL absoluta.
 *
 * Sin esto, una imagen guardada como `/assets/cards/la-torre.jpg` se la pide
 * al ORIGEN DE LA PÁGINA, que en desarrollo es el de Vite (5173), y no al del
 * backend (4000): la petición da 404, el `onError` del `<img>` cae al glifo y
 * la imagen no aparece nunca. Es un fallo invisible porque el resto de la app
 * funciona: sólo falta el dibujo.
 *
 * Si la URL ya es absoluta se devuelve tal cual, y si es nula o vacía también:
 * el valor null significa "esta carta no tiene imagen" y hay que respetarlo.
 */
export function urlDeArchivo(ruta: string | null | undefined): string | undefined {
  if (!ruta) return undefined;
  if (/^https?:\/\//i.test(ruta) || ruta.startsWith('data:')) return ruta;
  return ruta.startsWith('/') ? `${ORIGEN}${ruta}` : `${ORIGEN}/${ruta}`;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /**
   * Petición que devuelve el archivo crudo, no el sobre JSON.
   *
   * El PDF es binario: si pasara por `request`, el `response.json()` fallaría y
   * el error que saltaría sería "JSON inesperado", que no dice nada de que el
   * problema es que la respuesta no es JSON. Va aparte, pero comparte el token
   * de Clerk: duplicar esa lógica en otro archivo es la forma segura de que un
   * día una ruta funcione y la otra no.
   *
   * No lanza por un 4xx: devuelve la `Response` y deja que quien la pidió
   * decida, porque cada error tiene su propio mensaje.
   */
  raw: async (path: string, init?: RequestInit): Promise<Response> => {
    let token: string | null = null;
    try {
      token = await getToken();
    } catch {
      // Sin Clerk inicializado seguimos sin token: la ruta responderá 401.
    }

    return fetch(`${API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  },
};

/* ==========================================================================
   Luna: eclipses
   ========================================================================== */

export type EclipseKind = 'total' | 'parcial' | 'penumbral';

export interface LunarEclipse {
  /** Día del eclipse, como `AAAA-MM-DD`. */
  fecha: string;
  kind: EclipseKind;
  magnitud: number;
  /** Duración de la totalidad. Sólo los eclipses totales lo tienen. */
  totalidad: string | null;
  parcial: string | null;
  penumbral: string | null;
  /** Instante del máximo, ISO. */
  mayor: string | null;
}

/**
 * Estado lunar para la pantalla: si hoy hay eclipse y cuál viene después.
 *
 * Nunca lanza. La luna de sangre es un dato lindo, no una función que la app
 * necesita para funcionar: si el backend no responde o el observatorio está
 * caído, la pantalla tiene que mostrar la fase igual. Por eso el `catch`
 * devuelve el estado vacío en vez de dejar propagar el error — un throw aquí
 * dejaría la pantalla de la luna en blanco.
 */
export async function estadoLunar(): Promise<{ hoy: LunarEclipse | null; proximo: LunarEclipse | null }> {
  try {
    return await request<{ hoy: LunarEclipse | null; proximo: LunarEclipse | null }>('/moon/estado');
  } catch {
    return { hoy: null, proximo: null };
  }
}

/**
 * Eclipses lunares del año pedido y del siguiente, para el calendario.
 *
 * Nunca lanza, por la misma razón que `retrogradosDelAnio`: si falla devuelve
 * `null` y el calendario sigue mostrando fases y festividades.
 */
export async function eclipsesDelAnio(anio: number): Promise<LunarEclipse[] | null> {
  try {
    const datos = await request<{ eclipses: LunarEclipse[] }>(`/moon/eclipses?anio=${anio}`);
    return datos.eclipses ?? [];
  } catch {
    return null;
  }
}

/* ==========================================================================
   Luna: retrógrados planetarios
   ========================================================================== */

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';

export interface RetrogradePeriod {
  planeta: PlanetId;
  nombre: string;
  /** Instante en que empieza, ISO. */
  desde: string;
  /** Instante en que termina, ISO. */
  hasta: string;
  /** Días que dura. */
  dias: number;
}

/**
 * Retrógrados de un año.
 *
 * Nunca lanza. Si el backend no responde o el JPL está caído, devuelve `null`
 * (distinto de la lista vacía, que es "no hay") y la pantalla de la Luna
 * sigue mostrando fases y festividades, que se calculan en el dispositivo.
 */
export async function retrogradosDelAnio(anio?: number): Promise<RetrogradePeriod[] | null> {
  try {
    const q = anio ? `?anio=${anio}` : '';
    const datos = await request<{ retrogrados: RetrogradePeriod[] }>(`/moon/retrogrados${q}`);
    return datos.retrogrados ?? [];
  } catch {
    return null;
  }
}
