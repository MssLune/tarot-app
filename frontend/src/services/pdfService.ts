import { api } from './api';

/* ==========================================================================
   Descarga del PDF de una lectura.
   ========================================================================== */

/** Por qué no se pudo descargar, si no se pudo. */
export type MotivoFallo = 'no-pro' | 'sin-sesion' | 'no-existe' | 'sin-red' | 'error';

export type ResultadoPdf = { ok: true } | { ok: false; motivo: MotivoFallo; mensaje: string };

/**
 * Pide el PDF y lo abre en una pestaña nueva.
 *
 * Se abre en vez de descargarse solo a propósito: el archivo se arma en el
 * servidor y puede tardar, y una descarga que arranca sin que se vea nada es
 * indistinguible de una que falló. Abriendo la pestaña, el navegador muestra
 * su propio indicador mientras carga y después deja elegir entre guardar o
 * imprimir, que es lo que la mayoría quiere hacer con una lectura.
 */
export async function abrirPdf(readingId: string): Promise<ResultadoPdf> {
  let respuesta: Response;
  try {
    respuesta = await api.raw(`/user/readings/${encodeURIComponent(readingId)}/pdf`);
  } catch {
    return {
      ok: false,
      motivo: 'sin-red',
      mensaje: 'No pudimos conectarnos con el servidor. Revisa tu conexión.',
    };
  }

  if (!respuesta.ok) {
    let codigo = '';
    let mensaje = '';
    try {
      const cuerpo = (await respuesta.json()) as { error?: { code?: string; message?: string } };
      codigo = cuerpo.error?.code ?? '';
      mensaje = cuerpo.error?.message ?? '';
    } catch {
      /* Si la respuesta no es JSON, se decide sólo por el status. */
    }

    /* El mensaje del 402 no sirve: dice "el PDF es una función del Pro", que
       es cierto pero no dice qué puede hacer la persona ahora. */
    if (respuesta.status === 402) {
      return {
        ok: false,
        motivo: 'no-pro',
        mensaje:
          'El PDF es del plan Pro. Con el gratuito la lectura se ve entera en la pantalla y se puede exportar en JSON.',
      };
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return {
        ok: false,
        motivo: 'sin-sesion',
        mensaje: 'Tu sesión no está activa. Vuelve a entrar y prueba de nuevo.',
      };
    }
    if (respuesta.status === 404) {
      return {
        ok: false,
        motivo: 'no-existe',
        mensaje: 'No encontramos esa lectura. Puede que se haya borrado en otro dispositivo.',
      };
    }
    return {
      ok: false,
      motivo: codigo.includes('NOT_CONFIGURED') ? 'no-pro' : 'error',
      mensaje: mensaje || 'No pudimos generar el PDF. Prueba de nuevo en un momento.',
    };
  }

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank', 'noopener,noreferrer');

  if (!ventana) {
    /* El navegador bloqueó la ventana emergente. Un enlace directa es más
       difícil de bloquear, así que en ese caso se cae a una descarga. */
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreDeArchivo(respuesta.headers.get('Content-Disposition')) ?? '';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  }

  /* Se libera con retraso y no de inmediato: si se revoca ya, la pestaña nueva
     no llega a leer el archivo y muestra una página en blanco. */
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return { ok: true };
}

/**
 * Saca el nombre del archivo del header `Content-Disposition`.
 *
 * El backend lo manda en dos formatos: `filename=` con el nombre ya limpio, y
 * `filename*=` con el valor codificado para UTF-8. Se prefiere el segundo
 * cuando está, porque es el que conserva los acentos en algunos navegadores.
 */
export function nombreDeArchivo(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* Si el valor está mal codificado, se usa el otro. */
    }
  }
  const simple = /filename="([^"]+)"/i.exec(contentDisposition);
  return simple?.[1] ?? null;
}
