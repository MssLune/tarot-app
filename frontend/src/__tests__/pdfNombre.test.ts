import { describe, expect, it } from 'vitest';
import { nombreDeArchivo } from '../services/pdfService';

/* ==========================================================================
   El nombre con el que llega el PDF.

   El backend lo manda dos veces en el header `Content-Disposition`: una en
   `filename=` a secas, y otra en `filename*=` codificada en UTF-8. Está en las
   dos porque `filename=` no admite acentos ni nada fuera de ASCII, y muchos
   navegadores toman la primera y muestran un nombre roto.

   Es lógica pura de parseo de un header, que es justamente donde los errores
   no se ven: un nombre mal leído da un archivo llamado `download.pdf` y nadie
   se acuerda de por qué.
   ========================================================================== */

describe('el nombre del archivo', () => {
  it('lee el nombre en ASCII', () => {
    const header =
      'inline; filename="dejo-el-trabajo.pdf"; filename*=UTF-8\'\'dejo-el-trabajo.pdf';
    expect(nombreDeArchivo(header)).toBe('dejo-el-trabajo.pdf');
  });

  it('prefiere la versión con UTF-8 cuando está', () => {
    /* Es la que conserva los acentos. El backend manda las dos justamente
       para esto. */
    const header = "inline; filename=\"cambio.pdf\"; filename*=UTF-8''cambi%C3%B3.pdf";
    expect(nombreDeArchivo(header)).toBe('cambió.pdf');
  });

  it('decodifica los acentos', () => {
    const header = "attachment; filename*=UTF-8''a%C3%B1o%20nuevo.pdf";
    expect(nombreDeArchivo(header)).toBe('año nuevo.pdf');
  });

  it('no se rompe si el valor UTF-8 viene mal', () => {
    /* Un % suelto hace que `decodeURIComponent` tire. Caer al `filename=` es
       mejor que devolver null y perder el nombre entero. */
    const header = "inline; filename=\"respaldo.pdf\"; filename*=UTF-8''malo%ZZ.pdf";
    expect(nombreDeArchivo(header)).toBe('respaldo.pdf');
  });

  it('devuelve null si no hay header', () => {
    expect(nombreDeArchivo(null)).toBeNull();
    expect(nombreDeArchivo('')).toBeNull();
  });

  it('devuelve null si el header no trae nombre', () => {
    /* El backend con `inline` siempre lo manda, pero si algún día se cambia,
     el enlace de descarga no debe inventar un nombre. */
    expect(nombreDeArchivo('inline')).toBeNull();
  });

  it('no se confunde con un nombre que tenga punto y coma adentro', () => {
    /* Con un parseo ingenuo, el `;` cortaría el nombre a mitad. El backend
       limpia el nombre justamente por esto, pero el parser no puede confiar. */
    const header = "inline; filename=\"sin-punto-y-coma.pdf\"";
    expect(nombreDeArchivo(header)).toBe('sin-punto-y-coma.pdf');
  });
});
