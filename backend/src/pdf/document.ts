import PDFDocument from 'pdfkit';
import type { Interpretation, MoonPhase, Reading } from '@arcana/tarot-core';
import {
  BOTTOM_LIMIT,
  COLOR,
  FONT,
  PAGE,
  SIZE,
  categoryPhrase,
  fechaHora,
  fechaLarga,
  resumenLectura,
  sanear,
  SYSTEM_LABEL,
} from './layout';
import { drawMoonDisc } from './moon';
import { drawCardFace, type CaraDeCarta } from './carta';

/* ==========================================================================
   Maquetación de la lectura.

   El PDF va en el mismo orden en que se lee en la pantalla: primero de qué
   se trata y cuándo se hizo, después la luna, después el reparto de cartas, y
   recién entonces la interpretación posición por posición, los patrones que
   cruzan la tirada y la conclusión.
   ========================================================================== */

const M = PAGE.margin;
const W = PAGE.content;

export interface DocumentInput {
  reading: Reading;
  interpretation: Interpretation;
  luna: MoonPhase;
  /**
   * La cara a dibujar en cada posición, indexada por id de posición.
   *
   * Se calcula en el servicio, que es el único que tiene las cartas. Armarlo
   * acá obligaría a volver a pedirlas, y a que el motor y el PDF puedan
   * resolver el mismo nombre de carta de dos maneras distintas.
   */
  caras: Map<string, CaraDeCarta>;
}

export function buildDocument({ reading, interpretation, luna, caras }: DocumentInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: M, left: M, right: M },
    /* Aplaza el volcado de cada página al archivo. Es lo que permite volver
       atrás a escribir el pie: por defecto PDFKit escribe la página al flujo
       en cuanto la termina, así que no se puede modificar, y `switchToPage`
       falla con "out of bounds". */
    bufferPages: true,
    /* Sin metadatos del servidor: el archivo lo va a tener el usuario en su
       disco y no debería decir de qué máquina salió. */
    info: {
      Title: reading.title?.trim() || 'Lectura de Arcana',
      Author: 'Arcana',
      Subject: 'Lectura de Tarot u Oráculo',
      Creator: 'Arcana',
    },
  });

  const trozos: Buffer[] = [];
  doc.on('data', (c: Buffer) => trozos.push(c));
  const fin = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  encabezado(doc, { reading, interpretation });
  panelLunar(doc, luna);
  repartoDeCartas(doc, { interpretation, caras });
  posiciones(doc, interpretation, caras);
  patrones(doc, interpretation);
  conclusion(doc, interpretation);

  /* El pie va al final, ahora que se sabe cuántas páginas salieron. */
  pieDePagina(doc);
  doc.flushPages();
  doc.end();
  return fin;
}

/* --------------------------------------------------------------------------
   Pie de página.
   -------------------------------------------------------------------------- */

/**
 * Escribe el pie en todas las páginas.
 *
 * Va al final y no al principio porque sólo entonces se sabe cuántas páginas
 * hay: hacer treinta `addPage` a ciegas produciría un documento de treinta
 * páginas aunque la lectura ocupe dos.
 */
function pieDePagina(doc: PDFKit.PDFDocument): void {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);

    /* PDFKit decide dónde puede escribir texto mirando los márgenes de la
       página, y si la coordenada queda por debajo del margen inferior la
       entiende como desborde y AGREGA UNA PÁGINA nueva. El pie va justamente
       en esa zona, así que sin esto el documento salía duplicado: una página
       con el contenido y otra con el pie.

       Se abren los márgenes a cero mientras se escribe el pie y se restauran
       después, para no dejar la página con el marco alterado. */
    const m = doc.page.margins;
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

    doc
      .font(FONT.regular)
      .fontSize(SIZE.tiny)
      .fillColor(COLOR.faint)
      .text('Las cartas sugieren · la decisión es tuya', M, PAGE.height - M + 16, {
        width: W,
        align: 'center',
        lineBreak: false,
      });
    doc.text(`${i + 1} de ${rango.count}`, PAGE.width - M - 60, PAGE.height - M + 16, {
      width: 60,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins = m;
  }
}

/* --------------------------------------------------------------------------
   Encabezado.
   -------------------------------------------------------------------------- */

function encabezado(
  doc: PDFKit.PDFDocument,
  { reading, interpretation }: Pick<DocumentInput, 'reading' | 'interpretation'>,
): void {
  doc.font(FONT.regular).fontSize(SIZE.tiny).fillColor(COLOR.gold);
  doc.text('ARCANA', M, M, { width: W, align: 'center', characterSpacing: 3 });

  doc.moveDown(0.4);
  doc.font(FONT.bold).fontSize(SIZE.title).fillColor(COLOR.ink);
  doc.text(sanear(reading.title?.trim() || 'Lectura'), { width: W, align: 'center' });

  doc.moveDown(0.3);
  doc.font(FONT.regular).fontSize(SIZE.subtitle).fillColor(COLOR.muted);
  doc.text(sanear(SYSTEM_LABEL[reading.system]), { width: W, align: 'center' });
  doc.text(fechaLarga(reading.createdAt), { width: W, align: 'center' });

  doc.moveDown(0.6);
  doc.font(FONT.regular).fontSize(SIZE.small).fillColor(COLOR.faint);
  doc.text(resumenLectura(interpretation).join(' · '), { width: W, align: 'center' });

  if (reading.question?.trim()) {
    doc.moveDown(0.9);
    const alto = doc.heightOfString(sanear(reading.question), { width: W - 72 });
    doc
      .roundedRect(M + 24, doc.y, W - 48, alto + 28, 4)
      .fillColor(COLOR.panel)
      .fill();
    doc.moveDown(0.5);
    doc.font(FONT.italic).fontSize(SIZE.body).fillColor(COLOR.ink);
    doc.text(`"${sanear(reading.question.trim())}"`, M + 40, doc.y - 8, {
      width: W - 80,
      align: 'center',
    });
    const frase = categoryPhrase(reading);
    if (frase) {
      doc.moveDown(0.3);
      doc.font(FONT.regular).fontSize(SIZE.small).fillColor(COLOR.muted);
      doc.text(sanear(frase), { width: W, align: 'center' });
    }
  }

  doc.moveDown(1);
}

/* --------------------------------------------------------------------------
   Fase lunar.
   -------------------------------------------------------------------------- */

function panelLunar(doc: PDFKit.PDFDocument, luna: MoonPhase): void {
  const r = 24;
  const top = doc.y;
  const anchoTexto = 300;
  const xTexto = M + r * 2 + 18;

  drawMoonDisc(doc, M + r + 4, top + r, r, luna);

  /* El texto se dibuja con coordenadas absolutas y el cursor se fija UNA vez
     al final, con la altura REAL que ocupó el bloque. Es lo contrario de
     letting que cada `text()` mueva el flujo: los rótulos de las cartas de más
     abajo están dentro de `save()/restore()` y si mueven el cursor, el título de
     la sección siguiente se dibuja en medio del texto anterior. */
  const lineas = [
    { t: luna.name, f: FONT.bold, s: SIZE.cardName, c: COLOR.ink },
    { t: `${Math.round(luna.illumination * 100)}% iluminada`, f: FONT.regular, s: SIZE.small, c: COLOR.muted },
    { t: luna.note, f: FONT.regular, s: SIZE.small, c: COLOR.muted },
    { t: fechaHora(luna.date.getTime()), f: FONT.regular, s: SIZE.small, c: COLOR.muted },
  ];

  let y = top;
  for (const l of lineas) {
    doc.font(l.f).fontSize(l.s).fillColor(l.c);
    const h = doc.heightOfString(sanear(l.t), { width: anchoTexto });
    doc.text(sanear(l.t), xTexto, y, { width: anchoTexto });
    y += h + 2;
  }

  const bajoPanel = Math.max(y, top + r * 2 + 10);
  asegurarEspacio(doc, bajoPanel - doc.y + 12);
  doc.y = doc.y + 12;
}

/* --------------------------------------------------------------------------
   Reparto de cartas.
   -------------------------------------------------------------------------- */

/**
 * Dibuja la tirada con las posiciones donde las puso el usuario.
 *
 * Se usan las coordenadas de la tirada, que son porcentajes, y también la
 * rotación: la Cruz Celta cruza la segunda carta sobre la primera y un
 * documento que las mostrara en fila perdería eso.
 */
function repartoDeCartas(
  doc: PDFKit.PDFDocument,
  { interpretation, caras }: Pick<DocumentInput, 'interpretation' | 'caras'>,
): void {
  asegurarEspacio(doc, 200);

  tituloSeccion(doc, 'El reparto', 40);
  const top = doc.y;
  const alto = 150;

  for (const p of interpretation.positions) {
    const x = M + (p.position.x / 100) * W;
    const y = top + (p.position.y / 100) * alto;
    const rot = p.position.rotate ?? 0;
    const w = 66;
    const h = 94;

    /* La rotación va alrededor del centro de la carta, no de su esquina: con
       la esquina, la Cruz Celta saca la carta del papel. */
    doc.save().translate(x, y).rotate(rot, { origin: [0, 0] });

    drawCardFace(doc, 0, 0, w, h, caras.get(p.position.id)!, {
      conNombre: true,
      conSubtitulo: false,
    });

    /* El nombre de la posición va FUERA de la carta: adentro hay poco lugar y
       el texto se lee mejor abajo, como una etiqueta. */
    const etiqueta = sanear(recortar(p.position.name, 22));
    doc.font(FONT.regular).fontSize(5.5).fillColor(COLOR.muted);
    doc.text(etiqueta, -w / 2, h / 2 + 2, { width: w, align: 'center' });
    if (p.card.reversed) {
      doc.font(FONT.regular).fontSize(5).fillColor(COLOR.gold);
      doc.text('invertida', -w / 2, h / 2 + 11, { width: w, align: 'center' });
    }
    doc.restore();
  }

  doc.y = top + alto + 18;
}

/** Recorta sin cortar a media palabra, y sin "…" que no existe en WinAnsi. */
function recortar(texto: string, max: number): string {
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max - 3).replace(/[\s,;:.-]+$/, '') + '...';
}

/* --------------------------------------------------------------------------
   Lectura por posición.
   -------------------------------------------------------------------------- */

function posiciones(
  doc: PDFKit.PDFDocument,
  interp: Interpretation,
  caras: Map<string, CaraDeCarta>,
): void {
  /* Se reserva el título más la primera carta entera: es la unidad de lectura
     que tiene sentido, y partirla entre dos páginas deja medio pensamiento
     arriba y medio abajo. */
  tituloSeccion(doc, 'Carta por carta', 240);

  const { cartaAncho: anchoCarta, cartaAlto: altoCarta, textoX: xTextoBase } = COLUMNA;

  for (const p of interp.positions) {
    asegurarEspacio(doc, 150);

    /* La carta va a la izquierda y el texto a la derecha, como en la pantalla.
       En una columna sola, la carta se separaría del texto que explica y habría
       que saltar la vista; al lado, se lee como una unidad. */
    /* El bloque tiene que medir lo que mide el texto, no un número inventado:
       es lo que decide dónde termina la carta. */
    const altoTexto = doc.heightOfString(sanear(p.text), {
      width: W - anchoCarta - 16,
      align: 'justify',
      lineGap: 1.5,
    });
    const altoBloque = Math.max(altoCarta, altoTexto + 64);

    const top = doc.y;
    const xTexto = xTextoBase;

    drawCardFace(doc, M + anchoCarta / 2, top + altoCarta / 2, anchoCarta, altoCarta, caras.get(p.position.id)!, {
      conNombre: true,
      conSubtitulo: true,
    });

    let y = top;
    const anchoTexto = W - anchoCarta - 16;

    doc.font(FONT.regular).fontSize(SIZE.tiny).fillColor(COLOR.gold);
    doc.text(sanear(p.position.name.toUpperCase()), xTexto, y, {
      width: anchoTexto,
      characterSpacing: 1.4,
    });
    y += 14;

    doc.font(FONT.regular).fontSize(SIZE.small).fillColor(COLOR.muted);
    doc.text(sanear(p.subtitle), xTexto, y, { width: anchoTexto });
    y += 12;

    if (p.keywords.length > 0) {
      doc.font(FONT.regular).fontSize(SIZE.small).fillColor(COLOR.gold);
      doc.text(sanear(p.keywords.join(' · ')), xTexto, y, { width: anchoTexto });
      y += 14;
    }

    y += 2;
    doc.font(FONT.regular).fontSize(SIZE.body).fillColor(COLOR.ink);
    doc.text(sanear(p.text), xTexto, y, { width: anchoTexto, align: 'justify', lineGap: 1.5 });
    y = doc.y;

    if (p.advice) {
      y += 5;
      doc.font(FONT.italic).fontSize(SIZE.body).fillColor(COLOR.gold);
      doc.text(sanear(p.advice), xTexto, y, { width: anchoTexto - 10 });
    }

    doc.y = top + altoBloque + 18;
  }
}


/* --------------------------------------------------------------------------
   Patrones transversales.
   -------------------------------------------------------------------------- */

function patrones(doc: PDFKit.PDFDocument, interp: Interpretation): void {
  if (interp.patterns.length === 0) return;
  asegurarEspacio(doc, 120);

  tituloSeccion(doc, 'Lo que se repite', 90);
  doc.moveDown(0.5);

  for (const p of interp.patterns) {
    asegurarEspacio(doc, 54);
    doc.font(FONT.bold).fontSize(SIZE.body).fillColor(COLOR.ink);
    doc.text(sanear(p.label));
    doc.font(FONT.regular).fontSize(SIZE.body).fillColor(COLOR.muted);
    doc.text(sanear(p.detail), { align: 'justify', lineGap: 1 });
    doc.moveDown(0.7);
  }
  doc.moveDown(0.4);
}

/* --------------------------------------------------------------------------
   Conclusión.
   -------------------------------------------------------------------------- */

function conclusion(doc: PDFKit.PDFDocument, interp: Interpretation): void {
  if (interp.conclusion.length === 0) return;
  asegurarEspacio(doc, 120);

  tituloSeccion(doc, 'Hilo de la tirada', 110);
  doc.moveDown(0.5);

  for (const parrafo of interp.conclusion) {
    asegurarEspacio(doc, 60);
    doc.font(FONT.regular).fontSize(SIZE.body).fillColor(COLOR.ink);
    doc.text(sanear(parrafo), { align: 'justify', lineGap: 1.8 });
    doc.moveDown(0.6);
  }
}

/* --------------------------------------------------------------------------
   Geometría de la sección de cartas.
   -------------------------------------------------------------------------- */

/**
 * Dónde van las dos columnas de la sección "carta por carta".
 *
 * Vive declarado y no repartido dentro de la función porque los tests
 * necesitan comprobar la aritmética: que el texto no se monte sobre la carta y
 * que ninguna de las dos se salga de la hoja. Si estos números estuvieran
 * escritos en el medio del dibujado, esa comprobación tendría que medirlos del
 * PDF generado, y medir el ancho de una línea contando sus caracteres es una
 * estimación que falla.
 */
export const COLUMNA = {
  cartaX: M,
  cartaAncho: 78,
  cartaAlto: 110,
  /** Separación entre la carta y el texto. */
  hueco: 16,
  textoX: M + 78 + 16,
  textoAncho: W - 78 - 16,
} as const;

/* --------------------------------------------------------------------------
   Utilidades de maquetación.
   -------------------------------------------------------------------------- */

function tituloSeccion(doc: PDFKit.PDFDocument, texto: string, conElPrimero = 0): void {
  /* `conElPrimero` es el alto del primer bloque de la sección. Se reserva
     junto con el título a propósito: si sólo se reserva el título, el título
     queda al pie de una página y su contenido arranca en la siguiente, que se
     lee como un documento roto. */
  asegurarEspacio(doc, 70 + conElPrimero);
  /* El espacio de arriba se decide una vez, mirando dónde quedó el cursor, y
     no acumulando `moveDown` sobre un valor que ya cambiaron los bloques
     anteriores. */
  const y = doc.y + (doc.y > M + 6 ? 22 : 0);

  doc.font(FONT.bold).fontSize(SIZE.section).fillColor(COLOR.ink);
  doc.text(sanear(texto), M, y, { width: W, characterSpacing: 0.6 });

  const bajo = y + doc.heightOfString(sanear(texto)) + 4;
  doc
    .save()
    .moveTo(M, bajo)
    .lineTo(M + 46, bajo)
    .lineWidth(1.4)
    .strokeColor(COLOR.gold)
    .stroke()
    .restore();

  doc.x = M;
  doc.y = bajo + 16;
}

/**
 * Corta la página si no queda lugar.
 *
 * Se pide bastante más de lo que hace falta a propósito: partir la página a
 * mitad de un párrafo queda peor que dejar un hueco abajo. Con_pdfKit no hay
 * "viudas y huérfanas" como en un motor de texto.
 */
function asegurarEspacio(doc: PDFKit.PDFDocument, necesario: number): void {
  if (doc.y + necesario > BOTTOM_LIMIT) {
    doc.addPage();
    doc.x = M;
    doc.y = M;
  }
}
