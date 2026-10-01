/*
 * Genera una lectura de ejemplo y deja el PDF en `ejemplo.pdf`, para poder
 * abrirlo y mirarlo sin tener que hacer una tirada a mano.
 *
 *   npx tsx tools/ejemplo.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/database/prisma';
import { renderReadingPdf } from '../src/services/pdfService';

/** Tiradas reales, con su rotación, para ver el reparto como se ve en la app. */
const EJEMPLOS = [
  {
    archivo: 'ejemplo-crucelta.pdf',
    titulo: '¿Dejo el trabajo?',
    pregunta:
      'Tengo una oferta nueva pero no sé si conviene dejar lo que tengo. El salary es mejor, pero el equipo es nuevo y no conozco el proyecto.',
    categoria: 'trabajo' as const,
    tirada: {
      id: 'spr_ej_cruz',
      name: 'La Cruz Celta',
      description: 'Seis posiciones.',
      positions: [
        { id: 'p1', name: 'Pasado', prompt: 'de dónde vengo', x: 38, y: 22 },
        { id: 'p2', name: 'Presente', prompt: 'dónde estoy hoy', x: 62, y: 22, rotate: 90 },
        { id: 'p3', name: 'Apoyo', prompt: 'la base sobre la que se sostiene', x: 38, y: 64 },
        { id: 'p4', name: 'Miedo', prompt: 'lo que no me animo a mirar', x: 10, y: 64 },
        { id: 'p5', name: 'Futuro', prompt: 'hacia dónde voy', x: 88, y: 64 },
        { id: 'p6', name: 'Aconsejo', prompt: 'qué hago con esto', x: 50, y: 90 },
      ],
    },
    /* Cartas elegidas a mano para que la lectura tenga contenido interesante:
       un mayor, una invertida, y dos al azar. Los ids tienen que existir en la
       base: los palos son bastos, copas, espadas y oros, y "La Fortuna" se
       llama "La Rueda de la Fortuna". */
    cartas: [
      'la-rueda-de-la-fortuna',
      'as-de-espadas',
      'el-mago',
      '9-de-copas',
      'la-justicia',
      'rey-de-bastos',
    ],
  },
  {
    archivo: 'ejemplo-tres-cartas.pdf',
    titulo: '¿Sigo con él?',
    pregunta: 'Hace tres meses que no hablamos y no sé si vale la pena volver a escribirle.',
    categoria: 'amor' as const,
    tirada: {
      id: 'spr_ej_tres',
      name: 'Tres cartas',
      description: 'Pasado, presente y futuro.',
      positions: [
        { id: 'p1', name: 'Pasado', prompt: 'qué pasó', x: 15, y: 30 },
        { id: 'p2', name: 'Presente', prompt: 'dónde estamos', x: 50, y: 30 },
        { id: 'p3', name: 'Futuro', prompt: 'hacia dónde va', x: 85, y: 30 },
      ],
    },
    cartas: ['los-enamorados', 'la-torre', 'la-estrella'],
  },
];

/** Traduce el nombre de la carta al id que usa la base. */
function idDeCarta(prismaDb: typeof prisma, nombre: string): string | null {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
  return limpio;
}

async function main() {
  const usuario = await prisma.user.findFirst();
  if (!usuario) {
    console.error('No hay ningún usuario en la base. Registrate una vez en la app.');
    process.exit(1);
  }

  const todas = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  const porNombre = new Map(todas.map((c) => [idDeCarta(prisma, c.name)!, c.id]));
  console.log(`${todas.length} cartas en la base.`);

  const destino = path.resolve(__dirname, '..');

  for (const ej of EJEMPLOS) {
    /* Si un id no existe, el script se detiene en vez de poner otra carta.
       Sustituirlo en silencio genera un ejemplo que parece correcto y no lo
       es: la primera vez que lo corrí pedí "as-de-picas", que no existe, y el
       PDF salió con una carta arbitraria sin decir nada. */
    const cartas = ej.cartas.map((nombre, i) => {
      const id = porNombre.get(nombre);
      if (!id) {
        throw new Error(
          `La carta "${nombre}" no existe en la base. Revisar la lista de ` +
            `ejemplo "${ej.archivo}". Sin esto el PDF se arma con otra carta y ` +
            `nadie se entera.`,
        );
      }
      return { positionId: ej.tirada.positions[i]!.id, arcanaId: id, reversed: i === 1 };
    });

    const id = `read_ejemplo_${Date.now()}_${i0(ej.archivo)}`;
    await prisma.userReading.create({
      data: {
        id,
        userId: usuario.id,
        title: ej.titulo,
        question: ej.pregunta,
        questionCategory: ej.categoria,
        system: 'rider-waite',
        spread: JSON.stringify(ej.tirada),
        cards: JSON.stringify(cartas),
      },
    });

    const { bytes, filename } = await renderReadingPdf(usuario.id, id);
    const archivo = path.join(destino, ej.archivo);
    fs.writeFileSync(archivo, bytes);

    await prisma.userReading.deleteMany({ where: { id } });

    console.log(`\n${ej.archivo}`);
    console.log(`  nombre que ve el navegador: ${filename}`);
    console.log(`  tamaño: ${(bytes.length / 1024).toFixed(1)} kB`);
  }

  await prisma.$disconnect();
  console.log(`\nListos en: ${destino}`);
}

const i0 = (s: string): number =>
  [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
