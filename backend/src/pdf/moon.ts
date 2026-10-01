import type { MoonPhase } from '@arcana/tarot-core';

/* ==========================================================================
   El disco lunar en PDF.

   La geometría es la misma que en la pantalla, y conviene entenderla porque
   tiene unDetail que engaña:

   El terminador es una semielipse de semieje `a = r · |1 − 2k|`, con sus
   extremos en el norte y el sur del disco. Lo que cambia de un fase a otra es
   DE QUÉ LADO abomba:

     - Creciente (k < 0,5): abomba hacia el lado iluminado. La zona iluminada
       es una/media luna delgada.
     - Giboso (k > 0,5): abomba hacia el lado oscuro. La zona iluminada es más
       de la mitad.

   Por eso el signo importa. Si se dibuja siempre hacia el mismo lado, la fase
   gibosa sale con el área de la creciente: el disco se ve bien pero está al
   revés, y a simple vista no se nota.

   La construcción que se usa es la que no puede salir mal: se pinta el disco
   ENTERO de oscuro y encima se pinta la zona iluminada. Ésta es la mitad
   iluminada cerrada por el terminador, y sale del mismo camino en todos los
   casos.

   Las comprobaciones de área están en los tests, porque un disco invertido se
   ve plausible y es la única forma de Detectarlo sin abrir el archivo.
   ========================================================================== */

/** ¿La parte iluminada está a la derecha? Se ve así desde el hemisferio norte. */
function iluminadaADerecha(luna: MoonPhase): boolean {
  return luna.id.startsWith('waxing') || luna.id === 'new' || luna.id === 'full';
}

/** Color de la parte iluminada: un dorado claro, mate. */
const CLARO = '#E8DFC8';
/** Color de la parte en sombra, apenas un poco más apagado que el papel. */
const OSCURO = '#E2DCCB';
/** El borde, para que el disco se distinga del papel. */
const BORDE = '#BFB49A';

export function drawMoonDisc(
  doc: any,
  cx: number,
  cy: number,
  r: number,
  luna: MoonPhase,
): void {
  const k = Math.min(1, Math.max(0, luna.illumination));
  const derecha = iluminadaADerecha(luna);

  /* Luna Nueva y Luna Llena: pintar el terminador degenerado da un disco
     entero o un trazo de área cero que algunos visores dibujan como una
     raya. Se resuelven aparte. */
  if (k <= 0.0005) {
    discoOscuro(doc, cx, cy, r);
    return;
  }
  if (k >= 0.9995) {
    discoClaro(doc, cx, cy, r);
    return;
  }

  discoOscuro(doc, cx, cy, r);

  /* Semieje con signo. El signo decide de qué lado abomba el terminador, que es
     lo único que distingue una creciente de una gibosa. Para las menguantes se
     invierte todo, porque la parte iluminada está al otro lado. */
  const a = r * (1 - 2 * k) * (derecha ? 1 : -1);

  /* Barrido de la media luna iluminada: de arriba abajo por el lado
     iluminado. `1` es en sentido horario en pantalla, o sea por la derecha. */
  const sweepLuna = derecha ? 1 : 0;
  /* Barrido del terminador, de abajo arriba. Abomba hacia la derecha cuando la
     fase es creciente, y hacia la izquierda cuando es gibosa: exactamente lo
     contrario del barrido de la media luna en el primer caso, y lo mismo en el
     segundo. */
  const sweepTerminador = derecha ? (a > 0 ? 0 : 1) : a > 0 ? 1 : 0;

  const rx = Math.abs(a);
  doc
    .save()
    .fillColor(CLARO)
    .path(
      `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepLuna} ${cx} ${cy + r} ` +
        `A ${rx} ${r} 0 0 ${sweepTerminador} ${cx} ${cy - r} Z`,
    )
    .fill()
    .restore();

  doc.save().lineWidth(0.6).strokeColor(BORDE).circle(cx, cy, r).stroke().restore();
}

function discoClaro(doc: any, cx: number, cy: number, r: number): void {
  doc.save().fillColor(CLARO).circle(cx, cy, r).fill().restore();
  doc.save().lineWidth(0.6).strokeColor(BORDE).circle(cx, cy, r).stroke().restore();
}

function discoOscuro(doc: any, cx: number, cy: number, r: number): void {
  doc.save().fillColor(OSCURO).circle(cx, cy, r).fill().restore();
  doc.save().lineWidth(0.6).strokeColor(BORDE).circle(cx, cy, r).stroke().restore();
}

/* --------------------------------------------------------------------------
   Comprobación geométrica.
   -------------------------------------------------------------------------- */

/**
 * Área iluminada que DEBERÍA tener un disco de fase `k`.
 *
 * Vive acá y no en los tests porque es la definición, y los tests la comparan
 * contra el dibujo. Si las dos estuvieran en el mismo archivo, un cambio
 * wouldn't ser错误的 en los dos y el test seguiría pasando.
 */
export function litArea(r: number, k: number): number {
  return k * Math.PI * r * r;
}

/**
 * Área que da la construcción del terminador, con el signo correcto.
 *
 * Es la fórmula que de verdad usa el dibujo, expuesta para poder compararla con
 * `litArea`. Si algún día se cambia el barrido de los arcos, esta función y el
 * dibujo dejan de coincidir y el test falla.
 */
export function litAreaFromTerminator(r: number, k: number): number {
  const semidisco = (Math.PI * r * r) / 2;
  const a = r * Math.abs(1 - 2 * k);
  const bulbo = (Math.PI * r * a) / 2;
  /* Creciente: el bulbo se resta de la media luna. Giboso: se suma. */
  return k < 0.5 ? semidisco - bulbo : semidisco + bulbo;
}
