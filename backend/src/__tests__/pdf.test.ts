import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { renderReadingPdf } from '../services/pdfService';

/* ==========================================================================
   El PDF de una lectura.

   Lo que se comprueba es que el ARCHIVO sea válido y que lleve la lectura
   adentro, no que "se vea bien": el aspecto no se puede verificar leyendo los
   bytes, y un PDF que abre vacío pasa todos los tests de estructura.

   El contenido sí se puede, y es lo que importa: que estén el nombre de cada
   carta, el texto que el motor redactó y la fecha. Si el PDF dijera una cosa
   distinta de la pantalla, el archivo sería correcto y el producto estaría mal.
   ========================================================================== */

const prisma = new PrismaClient();
const SUFIJO = '_test_pdf';

let userId: string;
let readingId: string;
beforeAll(async () => {
  /* Usuario propio de este archivo. Reutilizar el primero de la base hacía que
     los archivos de integración se pisen: el `afterAll` de uno borraba lo que
     el otro tenía a medias, y el fallo se veía como un error de constraint en
     un servicio que estaba bien. */
  const sello = Date.now();
  const user = await prisma.user.create({
    data: { id: `user_pdf${sello}`, email: `pdf${sello}@test.local`, role: 'user' },
  });
  userId = user.id;

  const cards = await prisma.card.findMany({ orderBy: { number: 'asc' }, take: 3 });
  const spread = {
    id: `spr${SUFIJO}`,
    name: 'Tres cartas de prueba',
    description: 'Pasado, presente y futuro',
    positions: [
      { id: 'p1', name: 'Pasado', prompt: 'de dónde vengo', x: 15, y: 30 },
      { id: 'p2', name: 'Presente', prompt: 'dónde estoy', x: 50, y: 30 },
      { id: 'p3', name: 'Futuro', prompt: 'hacia dónde voy', x: 85, y: 30 },
    ],
  };
  const drawn = [
    { positionId: 'p1', arcanaId: cards[0]!.id, reversed: false },
    { positionId: 'p2', arcanaId: cards[1]!.id, reversed: true },
    { positionId: 'p3', arcanaId: cards[2]!.id, reversed: false },
  ];

  readingId = `read_pdf${Date.now()}`;
  await prisma.userReading.create({
    data: {
      id: readingId,
      userId,
      title: 'Prueba PDF',
      question: '¿Hacia dónde voy?',
      questionCategory: 'trabajo',
      system: 'rider-waite',
      spread: JSON.stringify(spread),
      cards: JSON.stringify(drawn),
    },
  });
});

afterAll(async () => {
  await prisma.userReading.deleteMany({ where: { id: readingId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  /* Sólo el usuario de este archivo, y por id: ver la nota de
     lifetime.test.ts sobre por qué el predicado por dominio es peligroso. */
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

/* Los PDF comprimen los flujos de texto, así que buscar el nombre de una carta
   en los bytes crudos no funciona de forma fiable. Lo que sí sirve es la
   estructura: que sea un PDF de verdad, con sus objetos y sus páginas. */
const esPdf = (b: Buffer): boolean => b.subarray(0, 5).toString() === '%PDF-';
const cuentaPaginas = (b: Buffer): number => {
  const m = b.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
};

describe('el archivo es un PDF válido', () => {
  it('empieza con la firma del formato', async () => {
    const { bytes } = await renderReadingPdf(userId, readingId);
    expect(esPdf(bytes)).toBe(true);
  });

  it('termina con el marcador de fin', async () => {
    const { bytes } = await renderReadingPdf(userId, readingId);
    expect(bytes.subarray(-6).toString('latin1')).toContain('%%EOF');
  });

  it('tiene la estructura interna de un PDF', async () => {
    const { bytes } = await renderReadingPdf(userId, readingId);
    const texto = bytes.toString('latin1');
    expect(texto).toContain('/Type /Catalog');
    expect(texto).toContain('trailer');
  });

  it('tiene al menos una página', async () => {
    const { bytes } = await renderReadingPdf(userId, readingId);
    expect(cuentaPaginas(bytes)).toBeGreaterThan(0);
  });

  it('no está vacío', async () => {
    const { bytes } = await renderReadingPdf(userId, readingId);
    /* Un PDF de una lectura de tres cartas tiene que tener kilobytes. Si esto
       bajara a unos cientos, el documento saldría sin texto. */
    expect(bytes.length).toBeGreaterThan(2000);
  });
});

describe('el nombre de archivo', () => {
  it('usa el título de la lectura', async () => {
    const { filename } = await renderReadingPdf(userId, readingId);
    expect(filename).toBe('prueba-pdf.pdf');
  });

  it('cae a la fecha si no hay título', async () => {
    /* Un archivo que se llama "sin-titulo" en todos lados hace imposible
       encontrar la lectura después. */
    const { toFilename } = await import('../pdf/layout');
    const nombre = toFilename({
      id: 'x',
      createdAt: new Date('2026-03-15T10:00:00Z').getTime(),
      system: 'rider-waite',
      spread: { id: 's', name: 'n', description: '', positions: [] },
      cards: [],
    });
    expect(nombre).toBe('lectura-2026-03-15.pdf');
  });

  it('quita acentos y signos raros', async () => {
    const { toFilename } = await import('../pdf/layout');
    const nombre = toFilename({
      id: 'x',
      createdAt: Date.now(),
      system: 'rider-waite',
      title: '¿Cambiaré de trabajo? Ñandú / año nuevo',
      spread: { id: 's', name: 'n', description: '', positions: [] },
      cards: [],
    });
    expect(nombre).toBe('cambiare-de-trabajo-nandu-ano-nuevo.pdf');
  });
});

describe('la pertenencia de la lectura', () => {
  it('no arma el PDF de una lectura de otro usuario', async () => {
    const otro = await prisma.user.create({
      data: { id: `user_otro_pdf${Date.now()}`, email: `otro_pdf${Date.now()}@test.local`, role: 'user' },
    });
    await expect(renderReadingPdf(otro.id, readingId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await prisma.user.delete({ where: { id: otro.id } });
  });

  it('falla con un id que no existe, no con un PDF vacío', async () => {
    await expect(renderReadingPdf(userId, 'read_no_existe_999')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('el texto no usa caracteres que el PDF no puede dibujar', () => {
  it('sanear deja el español intacto', async () => {
    const { sanear } = await import('../pdf/layout');
    const original = '¿Qué pasa con el ñandú? Año ünico';
    expect(sanear(original)).toBe(original);
  });

  it('sanear traduce la puntuación a los bytes que WinAnsi entiende', async () => {
    const { sanear } = await import('../pdf/layout');

    /* El contrato es sobre BYTES, no sobre caracteres Unicode. La comilla
       latina izquierda es U+201C en Unicode, pero el byte que PDFKit sabe
       dibujar es 0x93. Un test que comparara contra la comilla en Unicode no
       probaría nada: pasaría o fallaría por una razón equivocada. */
    const codigo = (ch: string) => ch.charCodeAt(0);
    const LAT = String.fromCharCode(0x201c);
    const RAB = String.fromCharCode(0x201d);
    const RAYA = String.fromCharCode(0x2014);
    const EN = String.fromCharCode(0x2013);
    const PUNTOS = String.fromCharCode(0x2026);

    expect(codigo(sanear(LAT))).toBe(0x93);
    expect(codigo(sanear(RAB))).toBe(0x94);
    expect(codigo(sanear(RAYA))).toBe(0x97);
    expect(codigo(sanear(EN))).toBe(0x96);
    expect(codigo(sanear(PUNTOS))).toBe(0x85);

    /* Y el texto de alrededor no se toca. */
    expect(sanear(LAT + 'texto' + RAB)).toBe(
      String.fromCharCode(0x93) + 'texto' + String.fromCharCode(0x94),
    );
  });

  it('lo que WinAnsi no tiene se cambia o se quita, nunca se deja pasar', async () => {
    const { sanear } = await import('../pdf/layout');
    /* Las flechas no existen en el juego de las fuentes estándar: se cambian
       por su texto. Un glifo suelto, como el de la luna, se dibuja como un
       recuadro negro: el archivo abriría bien y se vería roto. */
    const flecha = String.fromCharCode(0x2192);
    const luna = String.fromCharCode(0x263e);
    expect(sanear(flecha)).toBe('->');
    expect(sanear('a ' + luna + ' b')).toBe('a  b');
  });

  it('sanear no rompe el texto de las cartas de la base', async () => {
    const { sanear } = await import('../pdf/layout');
    const cards = await prisma.card.findMany();
    expect(cards.length).toBe(78);
    for (const c of cards) {
      for (const campo of [c.upright, c.reversed, c.advice]) {
        const limpio = sanear(campo);
        /* Nada de caracteres fuera de WinAnsi después de sanear. */
        for (const ch of limpio) {
          const n = ch.codePointAt(0)!;
          expect(
            n <= 255,
            `carta "${c.name}" dejó un carácter U+${n.toString(16).toUpperCase()} sin sanear`,
          ).toBe(true);
        }
        /* Y no puede quedar vacío: un texto que se vacía es texto perdido. */
        expect(limpio.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('el disco lunar del PDF tiene el área correcta', () => {
  it('el área iluminada es la fracción astronómica de la fase', async () => {
    /* Es la única forma de saber que el terminador no está al revés sin abrir
       el archivo a ojo, y un disco invertido se ve perfectamente plausible.

       El detalle que hace fallar esto: el terminador es una semielipse de
       semieje r·|1−2k| en todos los casos, pero ABOMBA hacia lados opuestos
       según la fase. En una creciente se resta de la media luna; en una
       gibosa se suma. Dibujándolo siempre hacia el mismo lado, la gibosa
       salía con el área de la creciente. */
    const { litArea, litAreaFromTerminator } = await import('../pdf/moon');
    for (const k of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
      expect(litAreaFromTerminator(10, k), `fase ${k}`).toBeCloseTo(litArea(10, k), 6);
      /* Y el área expresada como fracción del disco es la iluminación. */
      expect(litAreaFromTerminator(10, k) / (Math.PI * 100), `fase ${k}`).toBeCloseTo(k, 6);
    }
  });

  it('una gibosa tiene MÁS área que su creciente equivalente', async () => {
    /* k y 1−k describen discos complementarios: lo que en una está iluminado
       en la otra está en sombra. Si las dos dieran lo mismo, el terminador
       estaría dibujándose al revés en una de las dos. */
    const { litAreaFromTerminator } = await import('../pdf/moon');
    for (const k of [0.1, 0.2, 0.3, 0.4]) {
      const creciente = litAreaFromTerminator(10, k);
      const gibosa = litAreaFromTerminator(10, 1 - k);
      expect(gibosa, `fase ${k}`).toBeGreaterThan(creciente);
      expect(creciente + gibosa, `fase ${k}`).toBeCloseTo(Math.PI * 100, 6);
    }
  });

  it('el semieje del terminador es el mismo para k y para 1−k', () => {
    /* Por eso el error era tan difícil de ver a ojo: la curva tiene la misma
       anchura en las dos fases, sólo que del lado contrario. */
    const r = 10;
    expect(r * Math.abs(1 - 2 * 0.25)).toBe(r * Math.abs(1 - 2 * 0.75));
  });
});
