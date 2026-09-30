/* ==========================================================================
   Etiquetas de UI para los ejes, elementos y energías del dominio.
   Estas NO son contenido editorial (no viven en la base de datos): son
   texto de interfaz atado 1 a 1 a los tipos `Axis` / `Element` / `Energy`
   definidos en el código, así que se mantienen como constantes del frontend.
   ========================================================================== */

/** Etiquetas legibles de los ejes arquetípicos (para la detección de patrones). */
export const AXIS_LABELS: Record<string, string> = {
  inicio: 'comienzos',
  voluntad: 'voluntad y acción',
  intuicion: 'introspección',
  vinculo: 'vínculos',
  estructura: 'orden y límites',
  transicion: 'tránsito y cambio',
  sombra: 'sombra y crisis',
  plenitud: 'plenitud y logro',
};

/** Etiquetas legibles de los elementos. */
export const ELEMENT_LABELS: Record<string, string> = {
  fuego: 'Fuego',
  agua: 'Agua',
  aire: 'Aire',
  tierra: 'Tierra',
};

/** Lo que aporta cada elemento cuando domina la tirada. */
export const ELEMENT_MEANING: Record<string, string> = {
  fuego: 'impulso, acción y deseo: la energía quiere salir hacia afuera y hacer',
  agua: 'emoción, vínculo e intuición: lo que se juega es sentir y sostener',
  aire: 'ideas, palabra y decisiones: el asunto se resuelve pensando y hablando',
  tierra: 'cuerpo, dinero y concreción: lo que importa es materializar y sostener en el tiempo',
};

/** Etiquetas legibles de la energía. */
export const ENERGY_LABELS: Record<string, string> = {
  activa: 'activa',
  receptiva: 'receptiva',
  transformadora: 'transformadora',
};

/** Etiquetas para el selector de categoría de la pregunta. */
export const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  amor: 'Amor',
  trabajo: 'Trabajo',
  dinero: 'Dinero',
  salud: 'Salud',
};

/** Forma en que cada categoría se nombra dentro de una frase ("en el plano de..."). */
export const CATEGORY_PHRASE: Record<string, string> = {
  amor: 'el amor',
  trabajo: 'el trabajo',
  dinero: 'el dinero',
  salud: 'la salud',
};

/** Etiquetas para la respuesta Sí/No/Incierto de la ficha de referencia. */
export const YES_NO_LABELS: Record<string, string> = {
  si: 'Sí',
  no: 'No',
  incierto: 'Incierto',
};
