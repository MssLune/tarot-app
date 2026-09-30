import type { SpreadPosition } from '../types';

/* ==========================================================================
   Métricas de layout.
   A partir de las coordenadas de las posiciones calcula la proporción del
   lienzo y el tamaño relativo de las cartas, para que cualquier tirada
   (1 carta o Cruz Celta) se vea equilibrada, sin recortes ni solapamientos.
   ========================================================================== */

export interface LayoutMetrics {
  /** Relación ancho/alto del lienzo, para CSS aspect-ratio. */
  aspect: number;
  /** Ancho de cada carta en % del ancho del lienzo. */
  cardWidth: number;
  /** Ancho mínimo en px para que el layout siga siendo legible en celular. */
  minWidth: number;
}

/** Proporción de una carta (ancho / alto). */
const CARD_RATIO = 2 / 3;
/** Espacio reservado debajo de cada carta para el rótulo de la posición (%). */
const LABEL_SPACE = 4.5;
/** Distancia máxima para considerar que dos cartas comparten fila o columna. */
const SAME_AXIS = 15;

export function layoutMetrics(positions: SpreadPosition[]): LayoutMetrics {
  const count = positions.length;
  if (count === 0) return { aspect: 1.4, cardWidth: 20, minWidth: 320 };

  const ys = positions.map((p) => p.y);
  const xs = positions.map((p) => p.x);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const singleRow = maxY - minY < 12;

  /* --- Valores base según cantidad de cartas y forma general --- */
  let aspect: number;
  let cardWidth: number;
  let minWidth: number;

  if (count === 1) {
    aspect = 1;
    cardWidth = 40;
    minWidth = 240;
  } else if (singleRow) {
    if (count <= 3) {
      aspect = 2.1;
      cardWidth = 22;
      minWidth = 340;
    } else if (count <= 5) {
      aspect = 2.7;
      cardWidth = 16;
      minWidth = 430;
    } else {
      aspect = 3.2;
      cardWidth = 12;
      minWidth = 520;
    }
  } else if (count <= 4) {
    aspect = 1.25;
    cardWidth = 20;
    minWidth = 340;
  } else if (count <= 6) {
    aspect = 1.35;
    cardWidth = 17;
    minWidth = 400;
  } else if (count <= 8) {
    aspect = 1.4;
    cardWidth = 15;
    minWidth = 460;
  } else {
    aspect = 1.25;
    cardWidth = 10.5;
    minWidth = 560;
  }

  /* --- Separaciones reales entre posiciones -----------------------------
     Se miden los huecos entre cartas que comparten fila (para el ancho) y
     columna (para la altura). Las cartas rotadas de la Cruz Celta se ignoran:
     comparten coordenada a propósito, cruzándose sobre otra carta.            */
  const cards = positions.filter((p) => !p.rotate);
  let minRowGap = Infinity;
  let minColGap = Infinity;

  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const dx = Math.abs(cards[i].x - cards[j].x);
      const dy = Math.abs(cards[i].y - cards[j].y);
      if (dy < SAME_AXIS) minRowGap = Math.min(minRowGap, dx);
      if (dx < SAME_AXIS) minColGap = Math.min(minColGap, dy);
    }
  }

  /* Margen hasta los bordes del lienzo (se tolera un desborde mínimo de 6
     puntos, absorbido por el padding del contenedor). */
  const marginX = Math.min(Math.min(...xs), 100 - Math.max(...xs), 50);
  const marginY = Math.min(minY, 100 - maxY, 50);

  /* Ancho máximo: sin pisar la carta vecina de la misma fila ni el borde. */
  cardWidth = Math.min(cardWidth, minRowGap, marginX * 2 + 6);

  /* Altura máxima: el hueco de la columna menos el espacio del rótulo. */
  const maxCardHeight = Math.min(minColGap - LABEL_SPACE, marginY * 2 + 6);

  /* La altura de la carta, en % de la altura del lienzo, es
     cardWidth / CARD_RATIO * aspect. Se achata el lienzo (menos aspect) antes
     de encoger las cartas, y sólo después se reduce su ancho.                 */
  const neededAspect = (maxCardHeight * CARD_RATIO) / cardWidth;
  aspect = Math.min(aspect, Math.max(1, neededAspect));
  cardWidth = Math.max(6, Math.min(cardWidth, (maxCardHeight * CARD_RATIO) / aspect));

  return { aspect, cardWidth, minWidth };
}
