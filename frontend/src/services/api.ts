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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
