import type { Interpretation, Reading, SystemId } from '@arcana/tarot-core';
import { CATEGORY_PHRASE } from '@arcana/tarot-core';

/* ==========================================================================
   Composición del PDF: paleta, tipografía y utilidades de texto.

   Tres decisiones que no son obvias:

   1. FONDO CLARO, aunque la app sea oscura. Un PDF es un documento para
      imprimir y para leer en un teléfono. Una página negra se lee mal en el
      modo oscuro de cualquier visor y gasta una montaña de tinta.

   2. ORO OSCURO, no el oro de la app. El dorado de la interfaz está elegido
      para verse sobre casi negro; sobre blanco es prácticamente invisible. Acá
      se usa una versión oscura del mismo tono, que sí se lee en papel.

   3. SIN GLIFOS DE CARTA. Los 26 símbolos astrológicos y alquímicos que llevan
      las cartas están fuera de WinAnsi, el juego de caracteres de las fuentes
      estándar de PDF, así que se dibujarían como recuadros negros. En su lugar
      va el texto de correspondencia, que dice lo mismo: "Aire · Urano". Un
      archivo que abre bien pero se ve roto es peor que uno sin adornos.
   ========================================================================== */

export const PAGE = {
  /** A4 en puntos. */
  width: 595.28,
  height: 841.89,
  margin: 56,
  get content() {
    return this.width - this.margin * 2;
  },
} as const;

export const COLOR = {
  /** Negro cálido del cuerpo de texto. */
  ink: '#2A2622',
  /** Texto secundario. */
  muted: '#6B635A',
  /** Muy tenue, para pies de página. */
  faint: '#9A9188',
  /** Oro oscuro: el acento de la app, oscurecido para papel. */
  gold: '#8A6D2F',
  /** Oro aún más apagado, para filetes. */
  goldSoft: '#C4B088',
  /** Fondo de los recuadros. */
  panel: '#FAF7F0',
  /** Filete interior de las cartas, más apagado que el borde. */
  rule: '#DED7C8',
} as const;

export const FONT = {
  /** Texto corrido. */
  regular: 'Helvetica',
  /** Negrita, para títulos de carta y secciones. */
  bold: 'Helvetica-Bold',
  /** Cursiva, para la pregunta del usuario. */
  italic: 'Helvetica-Oblique',
} as const;

export const SIZE = {
  title: 22,
  subtitle: 11,
  section: 12,
  cardName: 13,
  body: 10,
  small: 8,
  tiny: 7,
} as const;

/** Cuánto puede bajar el cursor antes de cortar la página. */
export const BOTTOM_LIMIT = PAGE.height - PAGE.margin - 28;

/* --------------------------------------------------------------------------
   Texto.
   -------------------------------------------------------------------------- */

/**
 * Traducción de la puntuación tipográfica al byte de CP1252 que significa lo
 * mismo.
 *
 * El detalle que hace que esto sea necesario: la comilla latina izquierda es
 * U+201C en Unicode, pero 0x93 en WinAnsi, y **0x93 es el byte que PDFKit sabe
 * dibujar**. No alcanza con "dejar pasar los caracteres que estén en el rango":
 * U+201C está por encima de 0xFF, así que un filtro por rango la elimina, y el
 * texto del usuario se queda sin las comillas que escribió.
 *
 * El idioma de la app es español, y el español usa comillas latinas, raya y
 * raya em todo el tiempo. Perderlas en cada exportación sería notorio.
 */
const A_WINANSI: Record<string, number> = {
  '‘': 0x91,
  '’': 0x92,
  '‚': 0x82,
  '‛': 0x83,
  '“': 0x93,
  '”': 0x94,
  '„': 0x84,
  '–': 0x96,
  '—': 0x97,
  '•': 0x95,
  '…': 0x85,
  '€': 0x80,
  '™': 0x99,
  /* El espacio duro se convierte en un espacio normal: en un PDF es indistinto
     y así no se cuela un hueco raro al medir el texto. */
  ' ': 0x20,
};

const TIPOGRAFICOS = /[‘’‚‛“”„–—•…€™ ]/g;

/**
 * Deja el texto en un juego de caracteres que las fuentes estándar del PDF
 * pueden representar.
 *
 * WinAnsi (CP1252) cubre el español completo: á é í ó ú ü ñ ¿ ¡, más la
 * puntuación typográfica que se traduce arriba. Lo que no tiene equivalente se
 * quita o se reemplaza, para que no aparezca un recuadro negro en medio de una
 * frase: el archivo abriría bien y se vería roto, que es la peor forma de
 * romper algo.
 */
export function sanear(texto: string): string {
  return texto
    .replace(TIPOGRAFICOS, (ch) => String.fromCharCode(A_WINANSI[ch] ?? 0x20))
    /* Las flechas no tienen equivalente en WinAnsi. */
    .replace(/[←-⇿]/g, '->')
    /* Los glifos de las cartas y cualquier otra cosa que no se pueda
       representar.

       El rango llega hasta 0xFF entero, a propósito. La raya, las comillas
       latinas y los paréntesis angulares viven justamente en 0x80-0x9F, que es
       donde los deja la traducción de arriba. Si el filtro excluía esa banda,
       los borraba a sí mismos y el texto volvía a quedarse sin las comillas
       que escribió el usuario. */
    .replace(/[^\t\n\r\x20-\xFF]/g, '');
}

/**
 * Nombre de archivo seguro, con la extensión puesta.
 *
 * Devuelve el nombre completo y no la base: se llama `toFilename` y quien lo
 * use no tiene por qué saber que el PDF se arma acá. Extenderlo en el servicio
 * repartiría el conocimiento del formato en dos archivos.
 */
export function toFilename(reading: Reading): string {
  const base =
    reading.title?.trim() ||
    `lectura-${new Date(reading.createdAt).toISOString().slice(0, 10)}`;
  const limpio = base
    .normalize('NFD')
    /* Quita los acentos: un nombre de archivo con "ñ" o tilde se rompe en
       algunos navegadores y en el cliente de correo. */
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${limpio || 'lectura'}.pdf`;
}

export const SYSTEM_LABEL: Record<SystemId, string> = {
  'rider-waite': 'Tarot Rider-Waite',
  oracle: 'Oráculo',
  'custom-deck': 'Mazo propio',
};

export const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  amor: 'Amor',
  trabajo: 'Trabajo',
  dinero: 'Dinero',
  salud: 'Salud',
};

/** La frase de enfoque que usa el motor, para encabezar la lectura. */
export function categoryPhrase(reading: Reading): string {
  return CATEGORY_PHRASE[reading.questionCategory ?? 'general'] ?? '';
}

/* --------------------------------------------------------------------------
   Formato.
   -------------------------------------------------------------------------- */

const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const fechaLarga = (ms: number): string => FECHA_LARGA.format(new Date(ms));
export const fechaHora = (ms: number): string => FECHA_HORA.format(new Date(ms));

/** Sólo las estadísticas que el motor ya calculó; no se recalcula nada. */
export function resumenLectura(interp: Interpretation): string[] {
  const partes: string[] = [`${interp.stats.total} cartas`];
  if (interp.stats.reversed > 0) partes.push(`${interp.stats.reversed} invertida(s)`);
  if (interp.stats.dominantElement) {
    partes.push(`predomina ${interp.stats.dominantElement.element}`);
  }
  if (interp.stats.dominantEnergy) {
    partes.push(`energía ${interp.stats.dominantEnergy.energy}`);
  }
  return partes;
}
