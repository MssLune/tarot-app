/*
 * Saca las imágenes que ya están dentro de un PDF, sin recomprimirlas.
 *
 *   npx tsx tools/extraerImagenes.ts                     usa .entrada/*.pdf
 *   npx tsx tools/extraerImagenes.ts mazo.pdf            un archivo
 *   npx tsx tools/extraerImagenes.ts mazo.pdf --listar   no escribe nada
 *
 * CÓMO FUNCIONA, Y POR QUÉ NO SIEMPRE PUEDE
 *
 * Un PDF guarda el dibujo de dos maneras. Con imágenes incrustadas, que son
 * archivos de bytes dentro del PDF: eso se saca directamente, sin pérdida. O
 * con vectores, que son instrucciones de "trazá una curva acá": eso no es una
 * imagen, hay que dibujar la página, y para eso hace falta un rasterizador
 * (poppler, ghostscript) que este proyecto no tiene.
 *
 * Si tu mazo es un escaneo o un PDF armado con imágenes, funciona. Si son
 * páginas dibujadas con vectores, no: y en ese caso el camino es pasar el PDF
 * por un rasterizador primero, o usar el PDF mismo.
 *
 * NO ESCRIBE EN LA BASE DE DATOS
 *
 * Copia los archivos a assets/cards/ y nada más. Anotar el campo `image` es un
 * paso aparte y a propósito: así se pueden ver las imágenes con calma antes de
 * que aparezcan en la app. Para eso, tools/importarImagenes.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RAIZ = path.resolve(__dirname, '..');
const ENTRADA = path.join(RAIZ, '.entrada');
const SALIDA = path.join(RAIZ, 'assets', 'cards', '_extraidas');

/* --------------------------------------------------------------------------
   PNG
   -------------------------------------------------------------------------- */

/** CRC32, que PNG necesita para sus chunks. */
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = TABLA_CRC[(c ^ buf[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Arma un PNG a partir de píxeles crudos, sin depender de ninguna biblioteca. */
function aPng(
  pixeles: Buffer,
  ancho: number,
  alto: number,
  canales: 3 | 4 | 1,
): Buffer {
  const colorType = canales === 1 ? 0 : canales === 3 ? 2 : 6;

  /* Cada línea de una imagen PNG lleva delante un byte que dice el filtro que
     se usó. El 0 es "sin filtro", que es lo más simple y comprime bien. */
  const bpp = canales;
  const filas = Buffer.alloc((ancho * canales + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    const desde = y * ancho * canales;
    const hasta = (y + 1) * ancho * canales;
    filas[y * (ancho * canales + 1)] = 0;
    pixeles.copy(filas, y * (ancho * canales + 1) + 1, desde, hasta);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = colorType;
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------------
   Lectura del PDF
   -------------------------------------------------------------------------- */

interface Imagen {
  numero: number;
  ancho: number;
  alto: number;
  /** Qué filtro usa el flujo: DCTDecode es un JPEG entero. */
  filtro: string;
  bytes: number;
  datos: Buffer;
}

function leerEntero(dic: string, clave: string): number | null {
  const m = new RegExp(`/${clave}\\s+(\\d+)`).exec(dic);
  return m ? Number(m[1]) : null;
}

function leerColorSpace(dic: string): { canales: 3 | 4 | 1; invertida: boolean } {
  if (/\/DeviceGray|\/CalGray|\/Indexed/.test(dic)) return { canales: 1, invertida: false };
  if (/\/DeviceCMYK/.test(dic)) return { canales: 4, invertida: false };
  /* Lo más común: DeviceRGB, a veces en forma abreviada con un alias. */
  return { canales: 3, invertida: /\/CalRGB|\/Lab/.test(dic) };
}

/**
 * Recorre el PDF buscando objetos que sean imágenes.
 *
 * Se hace con expresiones regulares sobre el archivo crudo en vez de con una
 * biblioteca de PDF a propósito: el proyecto no tiene ninguna, y agregar una
 * para leer imágenes que ya están ahí sería una dependencia de un megabyte
 * para un trabajo de ochenta líneas.
 */
function buscarImagenes(buf: Buffer): Imagen[] {
  const latin = buf.toString('latin1');
  const encontradas: Imagen[] = [];

  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const inicioDic = m.index + m[0].length;
    const finDic = latin.indexOf('stream', inicioDic);
    if (finDic < 0) continue;

    const dic = latin.slice(inicioDic, finDic);
    if (!/\/Subtype\s*\/Image/.test(dic)) continue;

    const ancho = leerEntero(dic, 'Width');
    const alto = leerEntero(dic, 'Height');
    if (!ancho || !alto) continue;

    const filtro = (/\/Filter\s*(\/\w+|\[[^\]]*\])/.exec(dic)?.[1] ?? '').replace(/[[\]\/\s]/g, '');
    const bits = leerEntero(dic, 'BitsPerComponent') ?? 8;

    /* El cuerpo del flujo empieza después de la palabra "stream" y su salto de
       línea, y termina antes de "endstream". */
    let desde = finDic + 'stream'.length;
    if (latin[desde] === '\r') desde += 1;
    if (latin[desde] === '\n') desde += 1;
    const fin = latin.indexOf('endstream', desde);
    if (fin < 0) continue;

    const crudo = buf.subarray(desde, fin);
    let datos = crudo;
    try {
      if (/FlateDecode/.test(filtro)) datos = zlib.inflateSync(crudo);
    } catch {
      /* Si no se puede inflar, se deja el dato crudo y que se vea el error al
         escribir. Un PDF con stream comprimido de otra forma es raro pero
         existe. */
    }

    encontradas.push({ numero: encontradas.length + 1, ancho, alto, filtro, bytes: datos.length, datos });
    re.lastIndex = fin;
  }

  return encontradas;
}

/* --------------------------------------------------------------------------
   Programa
   -------------------------------------------------------------------------- */

function pdfsDeEntrada(argumentos: string[]): string[] {
  const directos = argumentos.filter((a) => !a.startsWith('--') && a.toLowerCase().endsWith('.pdf'));
  if (directos.length > 0) return directos;
  if (!fs.existsSync(ENTRADA)) return [];
  return fs
    .readdirSync(ENTRADA)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(ENTRADA, f));
}

async function main() {
  const argumentos = process.argv.slice(2);
  const soloListar = argumentos.includes('--listar');
  const pdfs = pdfsDeEntrada(argumentos);

  if (pdfs.length === 0) {
    console.log('\nNo hay ningún PDF.');
    console.log(`Ponelo en:  ${ENTRADA}`);
    console.log('\nO pasalo directo:  npx tsx tools/extraerImagenes.ts mazo.pdf\n');
    return;
  }

  let total = 0;

  for (const pdf of pdfs) {
    const buf = fs.readFileSync(pdf);
    const imagenes = buscarImagenes(buf);
    const paginas = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

    console.log(`\n${'='.repeat(64)}`);
    console.log(path.basename(pdf));
    console.log(`${'='.repeat(64)}`);
    console.log(`  páginas:  ${paginas}`);
    console.log(`  imágenes incrustadas:  ${imagenes.length}`);

    if (imagenes.length === 0) {
      console.log(
        '\n  No hay imágenes incrustadas.\n' +
          '  Lo más probable es que el PDF esté dibujado con vectores, o sea que\n' +
          '  no hay una imagen que extraer: hay que rasterizar la página. Eso\n' +
          '  necesita una herramienta aparte (poppler o ghostscript) y este\n' +
          '  script no puede hacerlo.\n' +
          '  En ese caso decime y lo resolvemos, o si tenés las imágenes sueltas\n' +
          '  en una carpeta, usá tools/importarImagenes.ts --carpeta.',
      );
      continue;
    }

    const porPagina = paginas > 0 ? (imagenes.length / paginas).toFixed(1) : '?';
    console.log(`  promedio por página:  ${porPagina}`);
    console.log('\n  las 8 primeras:');
    for (const img of imagenes.slice(0, 8)) {
      console.log(
        `    #${String(img.numero).padStart(3)}  ${String(img.ancho).padStart(5)}x${String(img.alto).padEnd(5)} ` +
          `${(img.bytes / 1024).toFixed(0).padStart(5)} kB  ${img.filtro || 'sin filtro'}`,
      );
    }
    if (imagenes.length > 8) console.log(`    … y ${imagenes.length - 8} más`);

    if (soloListar) continue;

    /* Las imágenes que son JPEG se copian enteras. Las que son bits crudos
       necesitan convertirse a PNG, y eso hay que hacerlo con el color space del
       diccionario, que se busca en el PDF completo. */
    const latin = buf.toString('latin1');
    let guardadas = 0;
    let omitidas = 0;

    fs.mkdirSync(SALIDA, { recursive: true });

    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(latin)) !== null && i < imagenes.length) {
      const img = imagenes[i]!;
      const inicioDic = m.index + m[0].length;
      const finDic = latin.indexOf('stream', inicioDic);
      const dic = latin.slice(inicioDic, finDic);
      const cs = leerColorSpace(dic);
      const bits = leerEntero(dic, 'BitsPerComponent') ?? 8;

      const nombre = `img-${String(img.numero).padStart(3, '0')}.`;
      try {
        if (/DCTDecode/.test(img.filtro)) {
          fs.writeFileSync(path.join(SALIDA, nombre + 'jpg'), img.datos);
        } else if (bits === 8) {
          const pixeles = cs.invertida ? invertir(img.datos, img.ancho, img.alto, cs.canales) : img.datos;
          fs.writeFileSync(
            path.join(SALIDA, nombre + 'png'),
            aPng(pixeles, img.ancho, img.alto, cs.canales),
          );
        } else {
          omitidas += 1;
          i += 1;
          continue;
        }
        guardadas += 1;
      } catch (err) {
        console.log(`    no se pudo guardar la ${img.numero}: ${(err as Error).message}`);
        omitidas += 1;
      }
      i += 1;
    }

    console.log(`\n  guardadas ${guardadas} en assets/cards/_extraidas/`);
    if (omitidas > 0) console.log(`  omitidas ${omitidas}`);
    total += guardadas;
  }

  if (total > 0 && !soloListar) {
    console.log('\n' + '─'.repeat(64));
    console.log('Las imágenes quedaron sueltas, con nombres img-001, img-002…');
    console.log('\nPara verlas ábrelas en el explorador de archivos. Cuando te gusten,');
    console.log('renombralas al nombre de la carta y usá:');
    console.log('  npx tsx tools/importarImagenes.ts --carpeta assets/cards/_extraidas\n');
  }
}

/** Da vuelta los bytes de una imagen para un espacio de color invertido. */
function invertir(datos: Buffer, ancho: number, alto: number, canales: number): Buffer {
  const out = Buffer.from(datos);
  const total = ancho * alto * canales;
  for (let i = 0; i < total; i += 1) out[i] = 255 - out[i]!;
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
