/* ==========================================================================
   Tipos del dominio: sistemas, cartas, tiradas, lecturas e interpretación.

   acá vive lo que ES una lectura, y no depende de nada de la interfaz. Vive
   en un paquete compartido y no en el frontend por una razón concreta: el
   motor de interpretación se usa en dos lugares —la pantalla y el PDF que
   arma el backend— y si cada uno tuviera su copia, el PDF podría terminar
   diciendo una cosa distinta de la que dice la pantalla. No es un problema
   teórico: cualquier cambio en la redacción de un texto se aplicaría a un
   lado y no al otro sin que nada se enterara.

   Lo que sí es de la interfaz (la pantalla actual, el plan, el usuario
   autenticado) sigue en `frontend/src/types`.
   ========================================================================== */

/** Sistema de lectura elegido por el usuario. */
export type SystemId = 'rider-waite' | 'oracle' | 'custom-deck';

/** Eje arquetípico usado para detectar patrones entre cartas. */
export type Axis =
  | 'inicio'
  | 'voluntad'
  | 'intuicion'
  | 'vinculo'
  | 'estructura'
  | 'transicion'
  | 'sombra'
  | 'plenitud';

/** Polaridad energética de la carta (para leer el tono general de la tirada). */
export type Energy = 'activa' | 'receptiva' | 'transformadora';

/** Elemento clásico asociado. */
export type Element = 'fuego' | 'agua' | 'aire' | 'tierra';

/** Tema de la pregunta, para enfocar la interpretación. 'general' = sin enfoque particular. */
export type QuestionCategory = 'general' | 'amor' | 'trabajo' | 'dinero' | 'salud';

/** Arcano Mayor o Menor. */
export type ArcanaType = 'mayor' | 'menor';

/** Palo de los Arcanos Menores. */
export type Suit = 'bastos' | 'copas' | 'espadas' | 'oros';

/** Respuesta de la carta a una pregunta cerrada, según la guía de referencia. */
export type YesNoAnswer = 'si' | 'no' | 'incierto';

/** Carta del mazo Rider-Waite (78 cartas: 22 Arcanos Mayores + 56 Arcanos Menores). */
export interface ArcanaCard {
  id: string;
  /** Índice global de orden (0-21 Mayores, 22-77 Menores). */
  number: number;
  name: string;
  /** Símbolo astrológico/alquímico que se dibuja en el frente de la carta. */
  glyph: string;
  /** Correspondencia astrológica tradicional, a modo de subtítulo. */
  correspondence: string;
  element: Element;
  axis: Axis;
  energy: Energy;
  arcanaType: ArcanaType;
  /** Palo, sólo en Arcanos Menores. */
  suit?: Suit;
  /** Etiqueta del rango ('As','2'...'10','Sota','Caballero','Reina','Rey'), sólo en Arcanos Menores. */
  rank?: string;
  /** Valor del rango (1-14), sólo en Arcanos Menores. */
  rankValue?: number;
  /** Palabras clave en posición derecha. */
  keywords: string[];
  /** Palabras clave en posición invertida. */
  reversedKeywords: string[];
  /** Lectura extendida en posición derecha. */
  upright: string;
  /** Lectura extendida en posición invertida. */
  reversed: string;
  /** Consejo breve, independiente de la orientación. */
  advice: string;
  /** Frases cortas y opcionales que enfocan la carta según el tema de la pregunta. */
  loveHint?: string;
  workHint?: string;
  moneyHint?: string;
  healthHint?: string;
  /** Ficha de referencia. Sí/No es una cualidad fija de la carta, no varía
   *  con la orientación; Pasado/Presente/Futuro sí tiene una variante
   *  invertida propia (la misma energía bloqueada, demorada o hacia adentro). */
  conceptTags?: string[];
  yesNo?: YesNoAnswer;
  yesNoReason?: string;
  pastText?: string;
  presentText?: string;
  futureText?: string;
  pastTextReversed?: string;
  presentTextReversed?: string;
  futureTextReversed?: string;
  /** Signo/regente y rango de fechas (ej. "Aries · 21 de marzo al 20 de abril"). */
  astrology?: string;
  /**
   * URL de la imagen de la carta, o undefined si no tiene.
   *
   * Opcional a propósito: el mazo funciona entero sin imágenes, con los
   * símbolos y el número romano. Por eso se pueden ir agregando de a una sin
   * que nada se rompa.
   */
  imageUrl?: string;
}

/**
 * Conjunto de 2-3 cartas que, si aparecen juntas en una misma tirada
 * (sin importar posición ni orientación), tienen un significado especial.
 */
export interface CardCombination {
  id: string;
  name: string;
  cardIds: string[];
  meaning: string;
  tone: 'gold' | 'violet' | 'amber' | 'rose';
}

/* --------------------------------------------------------------------------
   Mazo personalizable: el usuario define sus propias cartas con significado
   en posición derecha e invertida. Sirve tanto para un tarot propio como
   para un oráculo que no esté en la base de datos.
   -------------------------------------------------------------------------- */

/** Carta de un mazo creado por el usuario. */
export interface CustomCard {
  id: string;
  name: string;
  /** Símbolo opcional para el frente de la carta. */
  glyph?: string;
  /** Subtítulo libre (número, palo, correspondencia…). */
  subtitle?: string;
  /** Palabras clave separadas por coma, en posición derecha. */
  keywords?: string[];
  /** Palabras clave en posición invertida. */
  reversedKeywords?: string[];
  /** Significado en posición derecha. */
  upright?: string;
  /** Significado en posición invertida. */
  reversed?: string;
  /** Consejo breve, independiente de la orientación. */
  advice?: string;
  /** Metadatos opcionales que enriquecen la detección de patrones. */
  element?: Element;
  energy?: Energy;
  axis?: Axis;
}

/** Mazo completo definido por el usuario. */
export interface CustomDeck {
  id: string;
  name: string;
  description?: string;
  /** Si el mazo admite cartas invertidas (muchos oráculos no). */
  allowReversed: boolean;
  cards: CustomCard[];
  createdAt: number;
  updatedAt: number;
}

/** Una posición dentro de una tirada. Coordenadas en % del lienzo (0-100). */
export interface SpreadPosition {
  id: string;
  /** Nombre de la posición, ej. "Miedo oculto". */
  name: string;
  /** Pregunta o matiz que aporta la posición a la lectura. */
  prompt?: string;
  /** Posición horizontal en el layout, 0-100. */
  x: number;
  /** Posición vertical en el layout, 0-100. */
  y: number;
  /** Rotación en grados (la Cruz Celta cruza la carta 2 sobre la 1). */
  rotate?: number;
}

/** Familia de layout usada por el creador de tiradas. */
export type LayoutPreset = 'line' | 'cross' | 'circle' | 'grid' | 'pyramid' | 'free';

/** Definición de una tirada (predefinida o creada por el usuario). */
export interface Spread {
  id: string;
  name: string;
  description: string;
  positions: SpreadPosition[];
  /** true si la creó el usuario en el editor. */
  custom?: boolean;
  /** Layout con el que se generó (informativo). */
  preset?: LayoutPreset;
  /** Fecha de creación para tiradas personalizadas. */
  createdAt?: number;
}

/** Carta cargada por el usuario en una posición concreta. */
export interface DrawnCard {
  positionId: string;
  /** Id del arcano cuando el sistema es Rider-Waite. */
  arcanaId?: string;
  /** Nombre libre de la carta cuando el sistema es Oráculo. */
  customName?: string;
  /** Significado propio (Oráculo o notas extra en Rider-Waite). */
  customMeaning?: string;
  /** Id de la carta dentro del mazo personalizado elegido. */
  deckCardId?: string;
  /** Carta invertida. */
  reversed: boolean;
}

/** Lectura completa, tal como se guarda en el historial. */
export interface Reading {
  id: string;
  createdAt: number;
  system: SystemId;
  /** Copia de la tirada usada, para poder re-dibujar el layout histórico. */
  spread: Spread;
  /** Copia del mazo personalizado usado, si el sistema lo requiere. */
  deck?: CustomDeck;
  cards: DrawnCard[];
  question?: string;
  /** Tema elegido para la pregunta (amor/trabajo/dinero/salud/general). */
  questionCategory?: QuestionCategory;
  /** Título con el que el usuario guardó la lectura. */
  title?: string;
}

/** Patrón detectado por el motor de interpretación. */
export interface Pattern {
  id: string;
  /** Etiqueta corta, ej. "Predominio de agua". */
  label: string;
  /** Explicación de qué implica en la lectura. */
  detail: string;
  /** Intensidad: define el color/peso visual del badge. */
  tone: 'gold' | 'violet' | 'amber' | 'rose';
}

/** Interpretación de una posición concreta. */
export interface PositionReading {
  position: SpreadPosition;
  card: DrawnCard;
  /** Nombre visible de la carta. */
  cardName: string;
  /** Símbolo a dibujar. */
  glyph: string;
  /** Subtítulo (correspondencia o "Oráculo"). */
  subtitle: string;
  keywords: string[];
  /** Texto interpretativo ya contextualizado con la posición. */
  text: string;
  /** Consejo puntual, si existe. */
  advice?: string;
}

/** Resultado completo del motor de interpretación. */
export interface Interpretation {
  positions: PositionReading[];
  patterns: Pattern[];
  /** Párrafos de la conclusión integradora. */
  conclusion: string[];
  /** Estadísticas rápidas mostradas en el resumen. */
  stats: {
    total: number;
    reversed: number;
    dominantElement?: { element: Element; count: number };
    dominantEnergy?: { energy: Energy; count: number };
  };
}
