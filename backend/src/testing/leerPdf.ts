import zlib from 'node:zlib';

/* ==========================================================================
   Lector mínimo de PDF, para tests.

   Infla los flujos de contenido y devuelve el texto dibujado con su posición
   REAL en la página. No es un validador de PDF: no comprueba la estructura, sólo
   lee los operadores de dibujo, que es lo que hace falta para verificar la
   maquetación sin depender de poder abrir el archivo a ojo.

   Lo que hay que hacer bien, porque PDFKit no lo pone fácil:

   - Aplicar la matriz de transformación vigente. La Cruz Celta rota una de sus
     cartas 90 grados, y sin seguir `q`/`Q`/`cm` las coordenadas salen del
     espacio local de la carta y parecen estar en negativo.

   - Juntar TODAS las cadenas de un `TJ`. PDFKit parte el texto en trozos para
     justifiable con micro-ajustes de espaciado, y quedarse con la última da
     "aite" en vez de "Tarot Rider-Waite".

   - Traducir los huecos de palabra a espacios. En un `TJ` justificado, el
     espacio no es un glifo sino un desplazamiento numérico: sin esto, un
     párrafo sale como "Uncomienzoseabresingarantías" y parece un documento
     roto.

   - Invertir la Y. PDFKit aplica `1 0 0 -1 0 841.89 cm` a la página, que la
     voltea: la matriz de texto crece hacia abajo desde el borde inferior.

   - Ignorar los flujos que no son contenido. En un PDF también están los
     archivos de las fuentes, y `stream` matchea dentro de `endstream`.
   ========================================================================== */

export interface TextoDibujado {
  /** Coordenadas reales en la página, con el origen arriba a la izquierda. */
  x: number;
  y: number;
  texto: string;
  tamano: number;
  /**
   * true si el texto se dibujó girado.
   *
   * Importa porque el ancho de una línea rotada no se puede estimar con
   * `caracteres x tamaño`, y cualquier comprobación de solapamiento con cajas
   * alineadas a los ejes da falsos positivos con el texto rotado.
   */
  rotado: boolean;
}

export interface Pagina {
  indice: number;
  textos: TextoDibujado[];
  /** Operadores de trazado: rectángulos, líneas y curvas. */
  trazados: number;
}

/** A4 en puntos, igual que en `pdf/layout`. */
export const A4 = { ancho: 595.28, alto: 841.89 };

/** Matriz de transformación 2x3: [a b c d e f]. */
type Matriz = [number, number, number, number, number, number];

const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

const mult = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const aplicar = (m: Matriz, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

function desescapar(bruto: string): string {
  return bruto.replace(/\\([nrtbf()\\])/g, (_m, c: string) =>
    c === '(' || c === ')' || c === '\\'
      ? c
      : { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? c,
  );
}

function deHex(bruto: string): string {
  const hex = bruto.replace(/\s+/g, '');
  let out = '';
  /* Los códigos son bytes, no caracteres: se convierten de a uno en uno. */
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

const TOKEN =
  /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|[-+]?\d*\.?\d+|\/[^\s/[\]()<>]+|[A-Za-z*'"]+/g;

/** Un operando: un número, o un trozo de texto. */
type Operando = number | string;

export function leerPagina(flujo: string, indice: number): Pagina {
  const textos: TextoDibujado[] = [];
  let trazados = 0;

  let ctm: Matriz = IDENTIDAD;
  const pilaCtm: Matriz[] = [];
  let tm: Matriz = IDENTIDAD;
  let tamano = 10;

  /** Operandos del operador que viene; dentro de un `TJ` son los trozos. */
  let pila: Operando[] = [];
  let dentroDeTJ = false;

  /** Toma el último número de la pila de operandos. */
  const num = (): number => {
    const c = [...pila].reverse().find((v): v is number => typeof v === 'number');
    return c ?? 0;
  };
  /** Los `n` últimos números, en orden. */
  const ultimos = (n: number): number[] =>
    pila.filter((v): v is number => typeof v === 'number').slice(-n);

  for (const t of flujo.match(TOKEN) ?? []) {
    if (t.startsWith('(')) {
      pila.push(desescapar(t.slice(1, -1)));
      continue;
    }
    if (t.startsWith('<')) {
      pila.push(deHex(t.slice(1, -1)));
      continue;
    }
    if (t === '[') {
      dentroDeTJ = true;
      continue;
    }
    if (t === ']') {
      dentroDeTJ = false;
      continue;
    }
    if (t.startsWith('/')) continue;
    if (/^[-+]?\d*\.?\d+$/.test(t)) {
      const v = Number(t);
      /* Dentro de un array `TJ` los números son ajustes de posición entre
         trozos, y hay que conservarlos para reconstruir los espacios. Fuera del
         array son operandos de los operadores de posición. */
      if (dentroDeTJ) pila.push(v);
      else pila.push(v);
      continue;
    }

    switch (t) {
      case 'q':
        pilaCtm.push(ctm);
        break;
      case 'Q':
        ctm = pilaCtm.pop() ?? IDENTIDAD;
        break;
      case 'cm': {
        const n = ultimos(6);
        ctm = mult(ctm, [n[0] ?? 1, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1, n[4] ?? 0, n[5] ?? 0]);
        break;
      }
      case 'BT':
        tm = IDENTIDAD;
        pila = [];
        break;
      case 'Tf':
        tamano = Math.abs(num()) || tamano;
        break;
      case 'Td':
      case 'TD': {
        const n = ultimos(2);
        tm = mult(tm, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
        break;
      }
      case 'Tm': {
        const n = ultimos(6);
        /* `a b c d e f Tm`: la posición es el par final, no los dos
           primeros. Tomar los primeros da la matriz de transformación y
           reportaría (1, 0) en todas las líneas. */
        tm = [n[0] ?? 1, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1, n[4] ?? 0, n[5] ?? 0];
        break;
      }
      case 'Tj':
      case 'TJ':
      case "'": {
        /* El hueco de palabra va como número negativo. El umbral separa eso
           del kerning entre letras, que va de -20 a -60; un espacio de
           Helvetica mide 278 milésimas y al justificar llega a -350. */
        let texto = '';
        for (const p of pila) {
          if (typeof p === 'string') texto += p;
          else if (p < -150) texto += ' ';
        }
        if (texto) {
          const m = mult(ctm, tm);
          const [px, py] = aplicar(m, 0, 0);
          textos.push({
            x: px,
            y: A4.alto - py,
            texto,
            tamano,
            rotado: Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6,
          });
        }
        break;
      }
      case 'm':
      case 'l':
      case 'c':
      case 'v':
      case 'y':
      case 're':
        trazados += 1;
        break;
      default:
        break;
    }
    pila = [];
  }

  return { indice, textos, trazados };
}

/**
 * Inflate de los flujos de CONTENIDO del PDF, en orden de página.
 *
 * No todos los flujos de un PDF son contenido: también están los archivos de
 * las fuentes. Y el patrón `stream` matchea dentro de `endstream`, así que sin
 * el lookbehind se captura el texto que hay entre un flujo y el siguiente (los
 * objetos `/Type /Page`), que no es contenido sino estructura.
 */
export function extraerFlujos(buf: Buffer): string[] {
  const latin = buf.toString('latin1');
  const flujos: string[] = [];
  const re = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const inicio = m.index + m[0].length;
    const fin = latin.indexOf('endstream', inicio);
    if (fin < 0) break;
    const bruto = buf.subarray(inicio, fin);
    let texto: string;
    try {
      texto = zlib.inflateSync(bruto).toString('latin1');
    } catch {
      texto = bruto.toString('latin1');
    }
    /* Un flujo de contenido tiene operadores de dibujo y casi ningún byte de
       control. Un archivo de fuente es binario. */
    const esBinario = /[\x00-\x08\x0E-\x1F]/.test(texto.slice(0, 2000));
    const pareceContenido =
      /(^|\n)\s*(q|BT|re|m\b|[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+cm)/.test(
        texto,
      );
    if (esBinario || !pareceContenido) continue;
    flujos.push(texto);
  }
  return flujos;
}

/** Atajo: bytes del PDF a páginas con su texto positioned. */
export function leerPdf(buf: Buffer): Pagina[] {
  return extraerFlujos(buf).map((f, i) => leerPagina(f, i + 1));
}
