/*
 * Copia imágenes de cartas a `assets/cards` y anota el campo `image` de cada
 * carta en la base.
 *
 *   npx tsx tools/importarImagenes.ts            informa qué falta y qué sobra
 *   npx tsx tools/importarImagenes.ts <archivo…> importa los que se le pasen
 *   npx tsx tools/importarImagenes.ts --carpeta imagenes/
 *
 * El nombre del archivo se usa para emparejarlo con la carta, normalizando
 * acentos y signos: `La Rueda de la Fortuna.jpg` empareja con `la-rueda-de-la-
 * fortuna`. Si un nombre no empareja con ninguna carta, el script lo dice y
 * sigue: se pueden ir bajando de a uno y ver qué falta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/database/prisma';
import { CARDS_DIR, guardarImagenDeCarta, imagenDeCarta } from '../src/services/cardImages';

/** "La Rueda de la Fortuna" -> "la-rueda-de-la-fortuna" */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

async function listarArchivos(args: string[]): Promise<string[]> {
  if (args.includes('--carpeta')) {
    const i = args.indexOf('--carpeta');
    const dir = args[i + 1];
    if (!dir) throw new Error('Falta la carpeta después de --carpeta');
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => path.join(dir, f));
  }
  return args.filter((a) => !a.startsWith('--'));
}

async function main() {
  const args = process.argv.slice(2);
  const cartas = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  const porNombre = new Map(cartas.map((c) => [c.id, c]));
  const porId = new Set(cartas.map((c) => c.id));

  const archivos = await listarArchivos(args);

  /* -------------------- Importar -------------------- */
  if (archivos.length > 0) {
    console.log(`\nImportando ${archivos.length} archivo(s):\n`);
    let ok = 0;

    for (const archivo of archivos) {
      const base = path.basename(archivo, path.extname(archivo));
      const id = normalizar(base);

      if (!porId.has(id)) {
        console.log(`  ?  ${path.basename(archivo)}`);
        console.log(`     Ninguna carta se llama así. ¿Quedó un espacio o sobró una letra?`);
        continue;
      }
      try {
        const nombre = guardarImagenDeCarta(id, archivo);
        await prisma.card.update({ where: { id }, data: { image: nombre } });
        console.log(`  \u2713  ${path.basename(archivo)}  ->  ${nombre}`);
        ok += 1;
      } catch (err) {
        console.log(`  \u2717  ${path.basename(archivo)}: ${(err as Error).message}`);
      }
    }

    console.log(`\n${ok} de ${archivos.length} importadas.\n`);
  }

  /* -------------------- Estado -------------------- */
  /* Se releen las cartas después de importar. Informar con la copia que se leyó
     al principio mostraba "0 de 78" justo después de importar dos, que es
     justo cuando más importa que el resultado sea cierto. */
  const cartasAhora = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  const conImagen = cartasAhora.filter((c) => imagenDeCarta(c.image));
  const faltantes = cartasAhora.filter((c) => !imagenDeCarta(c.image));

  console.log('='.repeat(60));
  console.log(`Cartas con imagen: ${conImagen.length} de ${cartas.length}`);
  console.log('='.repeat(60));

  if (conImagen.length > 0) {
    console.log('\nYa están:');
    for (const c of conImagen) console.log(`  \u2713  ${c.name}`);
  }

  if (faltantes.length > 0) {
    console.log(`\nFaltan ${faltantes.length}. El nombre del archivo tiene que ser el de la carta:`);
    for (const c of faltantes) console.log(`  \u2022  ${c.id}.jpg`);
  }

  /* Archivos sueltos en la carpeta que no corresponden a ninguna carta: no
     molestan, pero es bueno saber que están. */
  if (fs.existsSync(CARDS_DIR)) {
    const sueltos = fs
      .readdirSync(CARDS_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .filter((f) => !porId.has(path.basename(f, path.extname(f))));
    if (sueltos.length > 0) {
      console.log(`\nArchivos en la carpeta que no corresponden a ninguna carta: ${sueltos.join(', ')}`);
    }
  }

  console.log(
    faltantes.length === 0
      ? '\nLas 78 tienen imagen. La app y el PDF las usan automáticamente.'
      : `\nLas ${faltantes.length} cartas sin imagen siguen mostrando su símbolo: no se rompe nada.`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
