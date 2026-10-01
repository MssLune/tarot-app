/* ==========================================================================
   tarot-core

   El motor de interpretación, la astronomía lunar y los tipos del dominio.
   Compartidos por el frontend (la pantalla), el backend (el PDF) y, más
   adelante, la app nativa.

   Por qué un paquete y no una copia en cada lado: la interpretación es una
   redacción, no un cálculo. Si el backend tuviera su propia versión para el
   PDF, cambiar una palabra en la redacción de un texto se aplicaría a la
   pantalla y no al PDF, sin que ninguna prueba lo notara. El usuario leería
   dos cosas distintas sobre la misma tirada.
   ========================================================================== */

export * from './types';
export * from './labels';
export * from './lunar';
export * from './interpretation';
