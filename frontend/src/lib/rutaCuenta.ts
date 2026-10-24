/* ==========================================================================
   La pantalla de cuenta (iniciar sesión / crear cuenta) en la URL.

   La app no tiene router: qué pantalla se ve vive en el store. Pero Clerk SÍ
   navega en algunos pasos del inicio de sesión y del registro:

   - al volver de Google o Apple (`#/sso-callback`),
   - cuando alguien entra con Google sin tener cuenta y Clerk lo pasa al
     registro, o le faltan datos (`#/continue`),
   - al verificar el correo.

   En esos casos va a la dirección de inicio de sesión o de registro que tenga
   configurada. Si la app no le dice cuál es, usa las páginas de Clerk
   (`*.accounts.dev`): la persona terminaba en la página de Clerk y no en
   Arcana. Ahora la app le da sus propias direcciones (`/?cuenta=entrar` y
   `/?cuenta=registro`) y, al cargar con una de ellas, abre la pantalla de
   cuenta correspondiente para que Clerk siga el paso donde lo dejó.
   ========================================================================== */

export type ModoCuenta = 'sign-in' | 'sign-up';

const VALOR: Record<ModoCuenta, string> = { 'sign-in': 'entrar', 'sign-up': 'registro' };

/** Direcciones que se le pasan a Clerk (`signInUrl` / `signUpUrl`). */
export const URL_ENTRAR = `/?cuenta=${VALOR['sign-in']}`;
export const URL_REGISTRO = `/?cuenta=${VALOR['sign-up']}`;

/** ¿La dirección actual pide la pantalla de cuenta? */
export function modoDesdeUrl(href: string = window.location.href): ModoCuenta | null {
  const url = new URL(href);
  const valor = url.searchParams.get('cuenta');
  if (valor === VALOR['sign-up']) return 'sign-up';
  if (valor === VALOR['sign-in']) return 'sign-in';
  /* Vuelta de Google/Apple sin el parámetro (por ejemplo, desde una versión
     anterior de la app): también es un inicio de sesión a medio terminar. */
  if (url.hash.startsWith('#/sso-callback')) return 'sign-in';
  return null;
}

/**
 * Dirección a la que hay que pasar para reflejar la pantalla de cuenta, o
 * null si ya está bien. No toca el `#…`, que es donde Clerk guarda el paso en
 * curso, salvo al cerrar la pantalla de cuenta.
 */
export function urlParaModo(modo: ModoCuenta | null, href: string = window.location.href): string | null {
  const url = new URL(href);
  const actual = url.searchParams.get('cuenta');
  const deseado = modo ? VALOR[modo] : null;
  if (actual === deseado && (modo || !url.hash.startsWith('#/'))) return null;
  if (deseado) {
    url.searchParams.set('cuenta', deseado);
  } else {
    url.searchParams.delete('cuenta');
    if (url.hash.startsWith('#/')) url.hash = '';
  }
  return url.toString();
}

/** Deja la URL de acuerdo con la pantalla de cuenta, sin recargar ni sumar historial. */
export function sincronizarUrl(modo: ModoCuenta | null): void {
  const nueva = urlParaModo(modo);
  if (nueva) window.history.replaceState(window.history.state, '', nueva);
}
