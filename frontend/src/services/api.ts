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
