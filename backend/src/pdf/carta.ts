/* ==========================================================================
   Caras de carta en el PDF.

   Lo que hace la app en pantalla es vector, no imágenes: un subtítulo, un
   símbolo y el nombre, con la carta invertida girada 180°. El PDF hace lo
   mismo, con una diferencia que obliga a improvisar: el símbolo de la app es un
   glifo Unicode (☿, ♃, ☾) y los glifos están FUERA de WinAnsi, el juego de
   caracteres de las fuentes estándar de PDF. Si se copiara tal cual saldría un
   recuadro negro en el medio de la carta.

   La salida es dibujar los símbolos:

   - Los CUATRO PALOS son formas simples y se dibujan vectoriales: una copa, una
     espada, una vara y una moneda. Quedan mejor que un glifo, porque se pueden
     hacer con el mismo trazo dorado del resto del documento.
   - Los ARCOS MAYORES llevan su número romano arriba, que es como los
     identifica cualquiera, y no un símbolo que nadie reconocería dibujado a
     mano.

   El nombre de la carta va siempre en texto, que es lo que importa.
   ========================================================================== */

import { COLOR, FONT, sanear } from './layout';

export type Palo = 'bastos' | 'copas' | 'espadas' | 'oros';

/** El palo de una carta, o null si es un arcano mayor. */
export function paloDe(arcanaType: string, suit: string | null | undefined): Palo | null {
  if (arcanaType !== 'menor') return null;
  const s = (suit ?? '').toLowerCase();
  return s === 'bastos' || s === 'copas' || s === 'espadas' || s === 'oros' ? s : null;
}

/** Números romanos del 1 al 21, para los arcanos mayores. */
const ROMANOS = [
  '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
];

/* --------------------------------------------------------------------------
   Símbolos de los palos.
   -------------------------------------------------------------------------- */

/**
 * Dibuja el símbolo de un palo centrado en (cx, cy), con la mitad de su alto
 * como tamaño.
 *
 * Todo son trazos con `lineCap` y `lineJoin` redondeados, que es lo que las
 * hace parecer una ilustración y no un esquema.
 */
function simboloDePalo(doc: any, palo: Palo, cx: number, cy: number, h: number): void {
  doc.save().lineCap('round').lineJoin('round').lineWidth(Math.max(0.7, h * 0.055)).strokeColor(COLOR.gold);

  switch (palo) {
    /* Copa: cuenco, astilla y base. */
    case 'copas': {
      const w = h * 0.78;
      doc
        .moveTo(cx - w / 2, cy - h * 0.42)
        .bezierCurveTo(cx - w / 2, cy + h * 0.12, cx - w * 0.26, cy + h * 0.3, cx, cy + h * 0.3)
        .bezierCurveTo(cx + w * 0.26, cy + h * 0.3, cx + w / 2, cy + h * 0.12, cx + w / 2, cy - h * 0.42)
        .stroke();
      doc.moveTo(cx, cy + h * 0.3).lineTo(cx, cy + h * 0.46).stroke();
      doc.moveTo(cx - w * 0.3, cy + h * 0.46).lineTo(cx + w * 0.3, cy + h * 0.46).stroke();
      break;
    }

    /* Espada: hoja, guarda y empuñadura. */
    case 'espadas': {
      const w = h * 0.3;
      doc
        .moveTo(cx, cy - h * 0.5)
        .lineTo(cx, cy + h * 0.22)
        .moveTo(cx - w * 0.28, cy - h * 0.34)
        .lineTo(cx, cy - h * 0.5)
        .lineTo(cx + w * 0.28, cy - h * 0.34)
        .stroke();
      /* Guarda y empuñadura, cruzadas. */
      doc.moveTo(cx - h * 0.34, cy + h * 0.22).lineTo(cx + h * 0.34, cy + h * 0.22).stroke();
      doc.moveTo(cx, cy + h * 0.22).lineTo(cx, cy + h * 0.5).stroke();
      break;
    }

    /* Vara: un Palo con dos hojas. */
    case 'bastos': {
      doc.moveTo(cx, cy - h * 0.5).lineTo(cx, cy + h * 0.5).stroke();
      doc
        .moveTo(cx, cy - h * 0.16)
        .bezierCurveTo(cx - h * 0.3, cy - h * 0.3, cx - h * 0.3, cy + h * 0.02, cx, cy + h * 0.1)
        .stroke();
      doc
        .moveTo(cx, cy + h * 0.02)
        .bezierCurveTo(cx + h * 0.3, cy - h * 0.12, cx + h * 0.3, cy + h * 0.2, cx, cy + h * 0.28)
        .stroke();
      break;
    }

    /* Moneda: un disco con el borde marcado. */
    case 'oros': {
      const r = h * 0.42;
      doc.circle(cx, cy, r).stroke();
      doc.save().lineWidth(Math.max(0.5, h * 0.03)).circle(cx, cy, r * 0.66).stroke().restore();
      break;
    }
  }

  doc.restore();
}

/* --------------------------------------------------------------------------
   La carta.
   -------------------------------------------------------------------------- */

export interface CaraDeCarta {
  /** Título de la carta, como se muestra. */
  nombre: string;
  /** Subtítulo: la correspondencia astrológica, o el palo. */
  subtitulo: string;
  /** Qué se dibuja en el centro. */
  simbolo: { tipo: 'palo'; palo: Palo } | { tipo: 'romano'; numero: number } | { tipo: 'ninguno' };
  invertida: boolean;
}

/** Los datos que hacen falta para dibujar, ya resueltos. */
export interface DatosDeCarta {
  /** Subtítulo: la correspondencia astrológica, o el palo del mazo propio. */
  subtitulo: string;
  /** true si es un arcano mayor. */
  esMayor: boolean;
  /** 0 a 21 para los mayores, que es lo que da el número romano. */
  numero: number | null;
  /** El palo, o null si no aplica. */
  palo: Palo | null;
  invertida: boolean;
}

/**
 * Reúne lo que hay que dibujar.
 *
 * Recibe los campos sueltos y no la carta entera a propósito: la carta del
 * Rider-Waite y la de un mazo propio no tienen la misma forma, y la única
 * diferencia que importa para el dibujo es si es mayor y qué palo tiene.
 * Pasarle el objeto obligaba a narrowing de tipos que no光源 de ningún valor
 * real.
 */
export function caraDe(nombre: string, datos: DatosDeCarta): CaraDeCarta {
  if (datos.esMayor) {
    return {
      nombre,
      subtitulo: datos.subtitulo,
      simbolo: { tipo: 'romano', numero: datos.numero ?? 0 },
      invertida: datos.invertida,
    };
  }
  if (datos.palo) {
    return {
      nombre,
      subtitulo: datos.subtitulo,
      simbolo: { tipo: 'palo', palo: datos.palo },
      invertida: datos.invertida,
    };
  }
  return { nombre, subtitulo: datos.subtitulo, simbolo: { tipo: 'ninguno' }, invertida: datos.invertida };
}

/** El número romano, o cadena vacía si no corresponde. */
export function romanoDe(n: number): string {
  return ROMANOS[n] ?? '';
}

/**
 * Dibuja una carta completa, centrada en (cx, cy), de `ancho` por `alto`.
 *
 * `girar` permite dibujarla ya rotada, que es como la app muestra las cartas
 * invertidas: al revés, no con un tachito.
 */
export function drawCardFace(
  doc: any,
  cx: number,
  cy: number,
  ancho: number,
  alto: number,
  cara: CaraDeCarta,
  opts: { conNombre?: boolean; conSubtitulo?: boolean; borde?: boolean } = {},
): void {
  const conNombre = opts.conNombre ?? true;
  const conSubtitulo = opts.conSubtitulo ?? true;

  doc.save().translate(cx, cy);
  if (cara.invertida) {
    doc.rotate(180, { origin: [0, 0] });
  }

  /* El marco. */
  doc
    .roundedRect(-ancho / 2, -alto / 2, ancho, alto, 3)
    .fillColor(COLOR.panel)
    .fill();
  if (opts.borde !== false) {
    doc.lineWidth(0.8).strokeColor(COLOR.goldSoft).stroke();
  }
  /* Un filete interior, que es lo que le da el aire de carta y no de
     rectángulo con texto. */
  doc
    .save()
    .lineWidth(0.4)
    .strokeColor(COLOR.rule)
    .roundedRect(-ancho / 2 + 4, -alto / 2 + 4, ancho - 8, alto - 8, 2)
    .stroke()
    .restore();

  const pad = 6;
  let y = -alto / 2 + pad;

  if (conSubtitulo && cara.subtitulo) {
    doc.font(FONT.regular).fontSize(Math.max(4.2, alto * 0.048)).fillColor(COLOR.muted);
    doc.text(sanear(cara.subtitulo), -ancho / 2 + pad, y, {
      width: ancho - pad * 2,
      align: 'center',
      lineBreak: false,
    });
    y += alto * 0.075;
  }

  /* El símbolo, en el hueco que queda entre el subtítulo y el nombre. */
  const zonaSimbolo = { y: y, h: alto * 0.5 - y - (conNombre ? alto * 0.3 : 0) };
  const cySimbolo = y + Math.max(6, zonaSimbolo.h * 0.45);

  if (cara.simbolo.tipo === 'palo') {
    simboloDePalo(doc, cara.simbolo.palo, 0, cySimbolo, Math.min(zonaSimbolo.h * 0.9, alto * 0.3));
  } else if (cara.simbolo.tipo === 'romano') {
    const romano = romanoDe(cara.simbolo.numero);
    doc.font(FONT.bold).fontSize(Math.max(6, alto * 0.13)).fillColor(COLOR.gold);
    doc.text(romano, -ancho / 2 + pad, cySimbolo - alto * 0.09, {
      width: ancho - pad * 2,
      align: 'center',
      lineBreak: false,
    });
  } else {
    /* Sin símbolo: un punto discreto, para que la carta no quede vacía. */
    doc.save().fillColor(COLOR.goldSoft).circle(0, cySimbolo, 1.6).fill().restore();
  }

  if (conNombre) {
    const nombre = sanear(cara.nombre);
    doc.font(FONT.bold).fontSize(Math.max(4.5, alto * 0.058)).fillColor(COLOR.ink);
    const altoNombre = doc.heightOfString(nombre, { width: ancho - pad * 2 });
    doc.text(nombre, -ancho / 2 + pad, alto / 2 - pad - altoNombre, {
      width: ancho - pad * 2,
      align: 'center',
    });
  }

  doc.restore();
}
