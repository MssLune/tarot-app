/*
 * Importa las imágenes de un mazo que viene en carpetas, las reduce de tamaño
 * y las anota en la base.
 *
 *   npx tsx tools/importarMazo.ts                       usa .entrada/major y
 *                                                       .entrada/minor
 *   npx tsx tools/importarMazo.ts --carpeta imagenes/   otra ubicación
 *   npx tsx tools/importarMazo.ts --dry                no escribe nada
 *
 * CÓMO EMPAREA CON LAS CARTAS
 *
 * Por el índice, no por el nombre. El mazo viene numerado y la base tiene un
 * campo `number` que es exactamente ese índice: 0 a 21 para los 22 arcanos
 * mayores, y para los menores el palo y el rango. Por eso:
 *
 *   major/00.jpg                      -> el arcano mayor número 0
 *   minor/Cups/01.jpg                 -> el as de copas
 *   minor/Swords/King.jpg             -> el rey de espadas
 *
 * Emparejar por texto sería frágil: "As" y "01" son la misma carta y depende
 * de cómo esté escrito en cada mazo. Los números no cambian.
 *
 * POR QUÉ REDUCE EL TAMAÑO
 *
 * Las imágenes que trae el mazo pesan alrededor de 700 kB cada una: 53 MB las
 * 78. En la pantalla una carta ocupa 200 píxeles y en el PDF 1,1 pulgadas, así
 * que a 1480 de ancho no se ve nada más. Se reducen a 600 de ancho, que
 * alcanza para una pantalla de 300 píxeles con el doble de densidad, y el PDF
 * sale igual de nítido.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '../src/database/prisma';
import { CARDS_DIR } from '../src/services/cardImages';

const RAIZ = path.resolve(__dirname, '..');

/** Ancho al que se reducen. 600 cubre una carta de 300 px con doble densidad. */
const ANCHO = 600;
const CALIDAD = 82;

/** Los palos, con el nombre que usa cada mazo en inglés. */
const PALOS: Record<string, string> = {
  wands: 'bastos',
  cups: 'copas',
  swords: 'espadas',
  pentacles: 'oros',
  coins: 'oros',
};

/** Los cuatro turnos, con el nombre en inglés y el rango en la base. */
const TURNOS: Record<string, string> = {
  page: 'Sota',
  knight: 'Caballero',
  queen: 'Reina',
  king: 'Rey',
};

interface Pareja {
  archivo: string;
  /** Descripción para los mensajes. */
  etiqueta: string;
  id: string;
}

function listar(raiz: string): string[] {
  if (!fs.existsSync(raiz)) return [];
  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(jpe?g|png|webp)$/i.test(e.name))
    .map((e) => path.join(raiz, e.name))
    .sort();
}

function listarCarpetas(raiz: string): string[] {
  if (!fs.existsSync(raiz)) return [];
  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(raiz, e.name));
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const iCarpeta = args.indexOf('--carpeta');
  const base = iCarpeta >= 0 && args[iCarpeta + 1] ? path.resolve(args[iCarpeta + 1]!) : path.join(RAIZ, '.entrada');

  const dirMajor = path.join(base, 'major');
  const dirMinor = path.join(base, 'minor');

  if (!fs.existsSync(dirMajor) && !fs.existsSync(dirMinor)) {
    console.log(`\nNo encontré la estructura del mazo en:  ${base}`);
    console.log('\nTiene que ser:');
    console.log('  major/00.jpg … major/21.jpg');
    console.log('  minor/Cups/01.jpg … minor/Swords/King.jpg');
    console.log('\nSi el mazo viene en una sola carpeta con los 78 archivos, decímelo');
    console.log('y lo adapto.\n');
    return;
  }

  const cartas = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  const porNumero = new Map(cartas.map((c) => [c.number, c]));
  const porId = new Map(cartas.map((c) => [c.id, c]));

  /* Los menores se buscan por (palo, rango) y no por id armado a mano. El id
     del as es `as-de-copas` y no `1-de-copas`, así que un id construido por
     concatenación se equivoca justo en el primero de los catorce, que es el
     que más se usa. */
  const porPaloYRango = new Map<string, (typeof cartas)[number]>();
  for (const c of cartas) {
    if (c.suit && c.rankValue) porPaloYRango.set(`${c.suit}:${c.rankValue}`, c);
  }
  const RANGO_POR_TURNO: Record<string, number> = { Sota: 11, Caballero: 12, Reina: 13, Rey: 14 };

  const parejas: Pareja[] = [];
  const sinPareja: string[] = [];

  /* ---------------- Arcanos mayores ---------------- */
  for (const archivo of listar(dirMajor)) {
    const baseArchivo = path.basename(archivo, path.extname(archivo));
    const numero = Number(baseArchivo);
    const carta = Number.isInteger(numero) ? porNumero.get(numero) : undefined;
    /* Los mayores van del 0 al 21, que es el rango de `number`. */
    const esMayor = carta?.arcanaType === 'mayor';
    if (carta && esMayor) {
      parejas.push({ archivo, etiqueta: `${String(numero).padStart(2, '0')} → ${carta.name}`, id: carta.id });
    } else {
      sinPareja.push(path.relative(base, archivo));
    }
  }

  /* ---------------- Arcanos menores ---------------- */
  for (const dirPalo of listarCarpetas(dirMinor)) {
    const paloCarpeta = path.basename(dirPalo).toLowerCase();
    const palo = PALOS[paloCarpeta];
    if (!palo) {
      sinPareja.push(`${path.relative(base, dirPalo)}/  (carpeta de palo desconocida: "${paloCarpeta}")`);
      continue;
    }

    for (const archivo of listar(dirPalo)) {
      const nombre = path.basename(archivo, path.extname(archivo));

      /* Un número del 1 al 10 es el rango. Si no, es un turno por su nombre. */
      const numeroRango = Number(nombre);
      const carta = Number.isInteger(numeroRango)
        ? porPaloYRango.get(`${palo}:${numeroRango}`)
        : porPaloYRango.get(`${palo}:${RANGO_POR_TURNO[TURNOS[nombre.toLowerCase()] ?? 0]}`);

      if (carta) {
        parejas.push({ archivo, etiqueta: `${paloCarpeta}/${nombre} → ${carta.name}`, id: carta.id });
      } else {
        sinPareja.push(path.relative(base, archivo));
      }
    }
  }

  console.log(`\nEmparejadas ${parejas.length} de ${cartas.length} cartas.`);
  if (sinPareja.length > 0) {
    console.log(`\nSin pareja (no se importan):`);
    for (const s of sinPareja.slice(0, 12)) console.log(`  ?  ${s}`);
    if (sinPareja.length > 12) console.log(`  … y ${sinPareja.length - 12} más`);
  }

  const faltantes = cartas.filter(
    (c) => c.arcanaType === 'mayor' || c.suit,
  ).filter((c) => !parejas.some((p) => p.id === c.id));
  if (faltantes.length > 0) {
    console.log(`\nSin imagen (${faltantes.length}):`);
    for (const c of faltantes.slice(0, 8)) console.log(`  -  ${c.name}`);
    if (faltantes.length > 8) console.log(`  … y ${faltantes.length - 8} más`);
  }

  if (dry) {
    console.log('\n--dry: no se escribió nada.\n');
    return;
  }

  /* ---------------- Reducir y copiar ---------------- */
  console.log(`\nReduciendo a ${ANCHO} px de ancho:`);
  fs.mkdirSync(CARDS_DIR, { recursive: true });

  let ok = 0;
  let antes = 0;
  let despues = 0;
  const problemas: string[] = [];

  for (const p of parejas) {
    try {
      const original = fs.statSync(p.archivo).size;
      const destino = path.join(CARDS_DIR, `${p.id}.jpg`);

      await sharp(p.archivo)
        .resize({ width: ANCHO, withoutEnlargement: true })
        .jpeg({ quality: CALIDAD, mozjpeg: true })
        .toFile(destino);

      const nuevo = fs.statSync(destino).size;
      antes += original;
      despues += nuevo;
      ok += 1;

      if (ok <= 5 || ok % 10 === 0) {
        console.log(
          `  ${String(ok).padStart(2)}. ${p.etiqueta.padEnd(34)} ` +
            `${(original / 1024).toFixed(0).padStart(4)} kB → ${(nuevo / 1024).toFixed(0).padStart(3)} kB`,
        );
      }
    } catch (err) {
      problemas.push(`${p.etiqueta}: ${(err as Error).message}`);
    }
  }

  /* ---------------- Anotar en la base ---------------- */
  for (const p of parejas) {
    await prisma.card.update({ where: { id: p.id }, data: { image: `${p.id}.jpg` } });
  }

  console.log(`\n${ok} imágenes importadas.`);
  console.log(
    `  ${(antes / 1024 / 1024).toFixed(1)} MB → ${(despues / 1024 / 1024).toFixed(1)} MB ` +
      `(${(100 - (despues / antes) * 100).toFixed(0)}% menos)`,
  );
  if (problemas.length > 0) {
    console.log(`\n  ${problemas.length} con problemas:`);
    for (const x of problemas.slice(0, 6)) console.log(`    ${x}`);
  }

  console.log('\nLa app y el PDF las usan automáticamente. Para verlas: npm run dev\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
