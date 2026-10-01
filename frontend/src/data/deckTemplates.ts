import type { ArcanaCard, CustomCard, CustomDeck, Element } from '../types';

/* ==========================================================================
   Plantillas para el mazo personalizable.
   El usuario puede arrancar de cero, partir de los 22 Arcanos Mayores ya
   cargados (y editarlos a su gusto) o generar la estructura de los 56
   Arcanos Menores con los nombres listos para completar significados.
   ========================================================================== */

/** Id corto local (el store tiene su propio uid, acá evitamos el import cruzado). */
const rid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Carta vacía lista para editar. */
export const blankCard = (): CustomCard => ({
  id: rid('card'),
  name: '',
  glyph: '',
  subtitle: '',
  keywords: [],
  reversedKeywords: [],
  upright: '',
  reversed: '',
  advice: '',
});

/** Mazo vacío con una primera carta en blanco. */
export const blankDeck = (): CustomDeck => ({
  id: rid('deck'),
  name: '',
  description: '',
  allowReversed: true,
  cards: [blankCard()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/* -------------------------------------------------------------------------- */

/** Copia editable de los 22 Arcanos Mayores (traídos de la API). */
const majorArcanaCards = (majorArcana: ArcanaCard[]): CustomCard[] =>
  majorArcana.map((a) => ({
    id: rid('card'),
    name: a.name,
    glyph: a.glyph,
    subtitle: `${a.number} · ${a.correspondence}`,
    keywords: [...a.keywords],
    reversedKeywords: [...a.reversedKeywords],
    upright: a.upright,
    reversed: a.reversed,
    advice: a.advice,
    element: a.element,
    energy: a.energy,
    axis: a.axis,
  }));

const SUITS: { name: string; glyph: string; element: Element }[] = [
  { name: 'Bastos', glyph: '♦', element: 'fuego' },
  { name: 'Copas', glyph: '♥', element: 'agua' },
  { name: 'Espadas', glyph: '♠', element: 'aire' },
  { name: 'Oros', glyph: '♣', element: 'tierra' },
];

const RANKS = [
  'As',
  'Dos',
  'Tres',
  'Cuatro',
  'Cinco',
  'Seis',
  'Siete',
  'Ocho',
  'Nueve',
  'Diez',
  'Sota',
  'Caballero',
  'Reina',
  'Rey',
];

/** Estructura de los 56 Arcanos Menores: nombres y elemento listos, sin textos. */
const minorArcanaCards = (): CustomCard[] =>
  SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      ...blankCard(),
      name: `${rank} de ${suit.name}`,
      glyph: suit.glyph,
      subtitle: suit.name,
      element: suit.element,
    })),
  );

/* -------------------------------------------------------------------------- */

export interface DeckTemplate {
  id: string;
  label: string;
  glyph: string;
  description: string;
  build: () => CustomDeck;
}

/**
 * Arma las plantillas disponibles. Las que parten de los Arcanos Mayores necesitan
 * las cartas traídas de la API (por eso son un parámetro y no un import
 * estático de `data/majorArcana`, que ya no existe).
 */
export function getDeckTemplates(majorArcana: ArcanaCard[]): DeckTemplate[] {
  return [
    {
      id: 'blank',
      label: 'Mazo en blanco',
      glyph: '✧',
      description:
        'Arrancá de cero: agregá una carta por vez con su nombre, su significado al derecho y al revés.',
      build: blankDeck,
    },
    {
      id: 'major',
      label: 'Partir de los 22 Arcanos Mayores',
      glyph: '☉',
      description:
        'Copia editable de los 22 Arcanos Mayores. Cambiá los textos a tu manera y sumá las cartas que quieras.',
      build: () => ({
        ...blankDeck(),
        name: 'Mi Tarot',
        description: 'Arcanos Mayores con mis propios significados.',
        cards: majorArcanaCards(majorArcana),
      }),
    },
    {
      id: 'minor',
      label: 'Arcanos Menores (56 nombres listos)',
      glyph: '♠',
      description:
        'Las 56 cartas de los cuatro palos ya nombradas, para que sólo escribas los significados.',
      build: () => ({
        ...blankDeck(),
        name: 'Mis Arcanos Menores',
        description: 'Los cuatro palos con mis propios significados.',
        cards: minorArcanaCards(),
      }),
    },
    {
      id: 'full',
      label: 'Tarot completo (78 cartas)',
      glyph: '✦',
      description:
        'Mayores con los textos del tarot clásico + los 56 menores en blanco. La base más completa para tu mazo.',
      build: () => ({
        ...blankDeck(),
        name: 'Mi Tarot completo',
        description: 'Los 78 arcanos, con mis propios significados.',
        cards: [...majorArcanaCards(majorArcana), ...minorArcanaCards()],
      }),
    },
  ];
}

/** Convierte texto separado por comas en lista de palabras clave. */
export const parseKeywords = (raw: string): string[] =>
  raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

/** true si la carta tiene lo mínimo para poder usarse en una lectura. */
export const isCardUsable = (card: CustomCard): boolean => Boolean(card.name.trim());
