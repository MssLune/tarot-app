import { describe, expect, it } from 'vitest';
import { urlDeArchivo } from '../services/api';

/* ==========================================================================
   Rutas de archivo del backend.

   El backend guarda en la base una ruta RELATIVA (`/assets/cards/la-torre.jpg`)
   y la sirve en el puerto 4000, mientras la página vive en el 5173.

   Si el frontend usa esa ruta tal cual, el navegador la pide al servidor de la
   PÁGINA, que es el de Vite, y no al del backend: da 404, el `onError` del
   `<img>` cae al glifo, y las imágenes no aparecen nunca.

   El síntoma es desconcertante: todo lo demás funciona, las 78 imágenes están
   en el disco, la API las devuelve, y en la pantalla no se ve ninguna. Es
   exactamente lo que pasó.
   ========================================================================== */

describe('convertir una ruta del backend en URL', () => {
  it('le pone el origen del backend a una ruta que empieza con barra', () => {
    /* Este es el caso que rompía: la ruta es del backend, no de la página. */
    const url = urlDeArchivo('/assets/cards/la-torre.jpg');
    expect(url).toBeDefined();
    expect(url!.startsWith('http')).toBe(true);
    expect(url).toContain('/assets/cards/la-torre.jpg');
  });

  it('no deja la ruta relativa, que es lo que rompe', () => {
    expect(urlDeArchivo('/assets/cards/la-torre.jpg')).not.toBe('/assets/cards/la-torre.jpg');
  });

  it('aguanta una ruta sin barra adelante', () => {
    const url = urlDeArchivo('assets/cards/el-mago.jpg');
    expect(url).toContain('/assets/cards/el-mago.jpg');
    expect(url!.startsWith('http')).toBe(true);
  });

  it('respeta una URL que ya es absoluta', () => {
    const abs = 'https://cdn.ejemplo.com/carta.jpg';
    expect(urlDeArchivo(abs)).toBe(abs);
  });

  it('respeta una imagen embebida en la página', () => {
    const data = 'data:image/png;base64,AAAA';
    expect(urlDeArchivo(data)).toBe(data);
  });

  it('undefined cuando no hay imagen, que es un caso válido', () => {
    /* Una carta sin imagen NO es un error: el valor null significa "sigue con
       el símbolo". Convertirlo en una URL vacía haría que el navegador pidiera
       la página misma como imagen. */
    expect(urlDeArchivo(null)).toBeUndefined();
    expect(urlDeArchivo(undefined)).toBeUndefined();
    expect(urlDeArchivo('')).toBeUndefined();
  });
});
