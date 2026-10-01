import type { SystemId } from '../types';

/* ==========================================================================
   Etiquetas y símbolos de los sistemas de lectura, para usar en toda la UI.

   POR QUÉ NO DECIMOS "RIDER-WAITE"

   "The Rider-Waite tarot deck" es una marca registrada en Estados Unidos
   (registros 1-644-495 y 1-640-623), y poner el nombre de un mazo al que se
   le pone el artwork es uso de marca, no descripción de la obra. Mientras la
   app no tenía imágenes el riesgo era bajo; en cuanto se le ponga el arte,
   pasa a ser el titular de la marca quien decide qué se puede llamar así.

   El arte original de 1909 es de dominio público en Estados Unidos desde hace
   décadas y en Reino Unido y Europa desde el 1 de enero de 2022, así que se
   puede usar y vender. Lo que no se puede es usar el nombre.

   El id interno sigue siendo 'rider-waite': aparece dentro de las lecturas
   guardadas y de los mazos de los usuarios, y renombrarlo rompería el
   historial sin ningún beneficio para quien mira la pantalla. Lo que ve la
   persona son estos rótulos.

   Si algún día se quiere cambiar el nombre, es editar estas dos constantes.
   ========================================================================== */

export const SYSTEM_LABELS: Record<SystemId, string> = {
  'rider-waite': 'Tarot clásico',
  oracle: 'Oráculo',
  'custom-deck': 'Mazo propio',
};

/** Etiqueta corta para tarjetas y listados compactos. */
export const SYSTEM_SHORT: Record<SystemId, string> = {
  'rider-waite': 'Clásico',
  oracle: 'Oráculo',
  'custom-deck': 'Mazo propio',
};

export const SYSTEM_GLYPHS: Record<SystemId, string> = {
  'rider-waite': '☉',
  oracle: '❋',
  'custom-deck': '✧',
};
