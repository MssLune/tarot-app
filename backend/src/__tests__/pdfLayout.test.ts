import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { A4, leerPdf, type Pagina } from '../testing/leerPdf';
import { PAGE } from '../pdf/layout';
import { COLUMNA } from '../pdf/document';
import { renderReadingPdf } from '../services/pdfService';
import { PrismaClient } from '@prisma/client';

/* ==========================================================================
   Maquetación del PDF, vista desde el archivo.

   Estos tests leen el PDF generado tal como lo leería un visor: inflan los
   flujos de contenido, sacan el texto con su posición real y miran dónde
   quedó. No reemplaza a abrirlo y mirarlo —eso sigue haciendo falta—, pero
   detecta lo que los tests de bytes no ven.

   Los tres bugs que encontró esta herramienta, y que ningún otro test agarraba:

   1. El documento salía con el doble de páginas. El pie se escribe en el
      margen inferior, fuera del marco de texto, y PDFKit lo interpreta como
      desborde y AGREGA una página. Resultado: una con el contenido y otra con
      el pie, alternadas.
   2. El título de una sección se dibujaba en medio del panel lunar. Los rótulos
      de las cartas están dentro de `save()/restore()` y mueven el cursor, así
      que la sección siguiente arrancaba donde ellos terminaban.
   3. Un título de sección quedaba al pie de una página y su contenido en la
      siguiente.

   Los tres son de posición, y ninguno se ve leyendo bytes sueltos.
   ========================================================================== */

const prisma = new PrismaClient();
const SUFIJO = '_test_layout';

let userId: string;
let readingId: string;
/** Lectura con 6 posiciones, con una rotada como la Cruz Celta. */
const posiciones = [
  { id: 'p1', name: 'Pasado', prompt: 'de dónde vengo', x: 38, y: 22 },
  { id: 'p2', name: 'Presente', prompt: 'dónde estoy', x: 62, y: 22, rotate: 90 },
  { id: 'p3', name: 'Apoyo', prompt: 'la base', x: 38, y: 62 },
  { id: 'p4', name: 'Miedo', prompt: 'lo que no se anima', x: 12, y: 62 },
  { id: 'p5', name: 'Futuro', prompt: 'hacia dónde voy', x: 88, y: 62 },
  { id: 'p6', name: 'Aconsejo', prompt: 'qué hacer', x: 50, y: 88 },
];

beforeAll(async () => {
  const sello = Date.now();
  const user = await prisma.user.create({
    data: { id: `user_lay${sello}`, email: `lay${sello}@test.local`, role: 'user' },
  });
  userId = user.id;

  const cards = await prisma.card.findMany({ orderBy: { number: 'asc' }, take: 6 });
  readingId = `read_lay${sello}`;
  await prisma.userReading.create({
    data: {
      id: readingId,
      userId,
      title: 'Prueba de maquetación',
      question: 'Una pregunta lo bastante larga para que la caja del encabezado ocupe varias líneas y empuje todo lo que viene hacia abajo, de modo que se corten páginas de verdad.',
      questionCategory: 'amor',
      system: 'rider-waite',
      spread: JSON.stringify({
        id: `spr${SUFIJO}`,
        name: 'Cruz Celta',
        description: 'Seis posiciones',
        positions: posiciones,
      }),
      cards: JSON.stringify(
        cards.map((c, i) => ({
          positionId: `p${i + 1}`,
          arcanaId: c.id,
          reversed: i % 3 === 1,
        })),
      ),
    },
  });
});

afterAll(async () => {
  await prisma.userReading.deleteMany({ where: { id: readingId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

/** Genera el PDF una vez y lo devuelve page a page. */
let cache: Pagina[] | null = null;
async function paginasDelPdf() {
  if (cache) return cache;
  const { bytes } = await renderReadingPdf(userId, readingId);
  cache = leerPdf(bytes);
  return cache;
}

describe('paginación', () => {
  it('sale un número de páginas razonable', async () => {
    const p = await paginasDelPdf();
    /* Seis cartas con su interpretación dan tres o cuatro páginas. El límite
       es apretado a propósito: con el bug del pie el documento salía de nueve,
       y un tope de "diez" lo habría dejado pasar. */
    expect(p.length).toBeGreaterThan(1);
    expect(p.length, `${p.length} páginas para seis cartas`).toBeLessThan(6);
  });

  it('el número de páginas es impar o par según el contenido, nunca el doble', async () => {
    const p = await paginasDelPdf();
    /* Con el bug, cada página de contenido iba acompañada de una vacía con el
       pie. Ninguna página vacía es la comprobación directa de eso. */
    for (const pagina of p) {
      expect(
        pagina.textos.filter((t) => t.tamano > 8).length,
        `la página ${pagina.indice} sólo tiene el pie: falta el contenido`,
      ).toBeGreaterThan(0);
    }
  });

  it('ninguna página está vacía', async () => {
    const p = await paginasDelPdf();
    for (const pagina of p) {
      expect(
        pagina.textos.length,
        `la página ${pagina.indice} no tiene texto: es una página en blanco`,
      ).toBeGreaterThan(0);
    }
  });

  it('el pie aparece en todas las páginas y sólo una vez', async () => {
    const p = await paginasDelPdf();
    for (const pagina of p) {
      const pies = pagina.textos.filter((t) => t.texto.includes('Las cartas sugieren'));
      expect(pies, `la página ${pagina.indice} no tiene pie`).toHaveLength(1);
      /* Y en el margen de abajo, no en medio del texto. */
      expect(pies[0]!.y).toBeGreaterThan(A4.alto - 60);
    }
  });

  it('el número de página es correcto', async () => {
    const p = await paginasDelPdf();
    for (const pagina of p) {
      /* Con un `includes(' de ')` esto encuentra el título de la lectura, que
         también tiene un "de". Hay que buscar el patrón completo. */
      const n = pagina.textos.find((t) => /^\d+ de \d+$/.test(t.texto.trim()));
      expect(n?.texto, `falta el número en la página ${pagina.indice}`).toBe(
        `${pagina.indice} de ${p.length}`,
      );
    }
  });
});

describe('nada se dibuja fuera de la hoja', () => {
  it('todo el texto está dentro de los márgenes', async () => {
    const p = await paginasDelPdf();
    const problemas: string[] = [];
    for (const pagina of p) {
      for (const t of pagina.textos) {
        if (t.y < 30 || t.y > A4.alto - 20 || t.x < 30 || t.x > A4.ancho - 30) {
          problemas.push(`p${pagina.indice} y=${t.y.toFixed(0)} x=${t.x.toFixed(0)} "${t.texto.slice(0, 30)}"`);
        }
      }
    }
    expect(problemas, `texto en el margen:\n${problemas.join('\n')}`).toHaveLength(0);
  });
});

/* ==========================================================================
   La geometría de las dos columnas.

   Hubo aquí un test que medía solapamientos estimando el ancho de cada línea
   con `caracteres x tamaño de letra`. Se sacó.

   No era confiable: el ancho de una línea justificada o centrada no sale de
   contar caracteres, y el test daba falsos positivos con la carta y el texto
   que tiene al lado. Peor que no tener test es uno que falla de a ratos y que
   hay que aprender a ignorar.

   Lo que sí se puede verificar de verdad es la ARITMÉTICA de la maqueta, que
   son números que el código declara y no estima. Eso es lo que se comprueba
   aquí: que la columna de texto empieza a la derecha de la carta y con margen,
   y que ninguna de las dos se sale de la hoja.
   ========================================================================== */
describe('la geometría de la maqueta', () => {
  it('la columna de texto no invade la carta', () => {
    /* La carta se dibuja desde el margen izquierdo con ANCHO_CARTA de ancho, y
       el texto arranca en M + ANCHO_CARTA + HUECO. Lo que importa es que lo
       segundo sea mayor que lo primero. */
    expect(COLUMNA.textoX).toBeGreaterThan(COLUMNA.cartaX + COLUMNA.cartaAncho);
  });

  it('el hueco entre la carta y el texto es usable', () => {
    /* Menos de 8 puntos el texto queda pegado a la carta y se lee como un
       bloque solo. */
    expect(COLUMNA.hueco).toBeGreaterThanOrEqual(8);
  });

  it('la columna de texto entra en la hoja', () => {
    expect(COLUMNA.textoX + COLUMNA.textoAncho).toBeLessThanOrEqual(PAGE.width - PAGE.margin);
  });

  it('la carta entra en la hoja con su margen', () => {
    expect(COLUMNA.cartaX).toBeGreaterThanOrEqual(PAGE.margin);
  });

  it('el nombre más largo de la base cabe en la carta, en dos líneas', async () => {
    /* Se mide con PDFKit de verdad, no estimando por cantidad de caracteres:
       "La Rueda de la Fortuna" mide 78 puntos a 6,5 y el ancho útil de la
       carta es de 66, así que se parte en dos líneas. Con una estimación
       aproximada este test habría pasado o fallado por casualidad.

       Lo que importa no es que entre en una línea, sino que entre en la
       altura que la carta le reserva y que no needs tres, porque una carta con
       el nombre desarmado en tres renglones se ve rota. */
    const doc = new PDFDocument({ size: 'A4' });
    const cartas = await prisma.card.findMany({ orderBy: { number: 'asc' } });
    const util = COLUMNA.cartaAncho - 12;

    const problemas: string[] = [];
    for (const c of cartas) {
      doc.font('Helvetica-Bold').fontSize(6.5);
      const alto = doc.heightOfString(c.name, { width: util });
      const lineas = Math.round(alto / (6.5 * 1.15));
      if (lineas > 2) {
        problemas.push(`"${c.name}" ocupa ${lineas} líneas`);
      }
      /* Y que la altura que la carta reserva alcance. */
      const reservado = COLUMNA.cartaAlto * 0.3;
      if (alto > reservado) {
        problemas.push(`"${c.name}" necesita ${alto.toFixed(1)}pt y hay ${reservado.toFixed(1)}pt`);
      }
    }
    doc.end();

    expect(problemas.join(' | '), 'nombres de carta que no entran').toBe('');
  });
});

describe('el orden de lectura', () => {
  it('empieza por el encabezado y termina por la conclusión', async () => {
    const p = await paginasDelPdf();
    const todo = p.flatMap((pagina) =>
      pagina.textos.slice().sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.texto),
    );
    const unido = todo.join('\n');

    const iArcana = unido.indexOf('ARCANA');
    const iReparto = unido.indexOf('El reparto');
    const iCartaPorCarta = unido.indexOf('Carta por carta');
    const iHilo = unido.indexOf('Hilo de la tirada');

    expect(iArcana).toBeGreaterThanOrEqual(0);
    expect(iReparto).toBeGreaterThan(iArcana);
    expect(iCartaPorCarta).toBeGreaterThan(iReparto);
    expect(iHilo).toBeGreaterThan(iCartaPorCarta);
  });

  it('los rótulos de las posiciones salen en el orden de la tirada', async () => {
    const p = await paginasDelPdf();
    /* El orden es por página y después por posición vertical. Ordenar todo junto
       por `y` mezcla las páginas: la 2 arranca arriba y sus textos se colarían
       antes que el final de la 1, y el test daría un orden imposible. */
    const todo = p
      .flatMap((pagina) =>
        pagina.textos
          .slice()
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((t) => t.texto),
      )
      .join('\n');
    const iPasado = todo.indexOf('PASADO');
    const iPresente = todo.indexOf('PRESENTE');
    const iMiedo = todo.indexOf('MIEDO');
    expect(iPasado).toBeGreaterThanOrEqual(0);
    expect(iPresente).toBeGreaterThan(iPasado);
    expect(iMiedo).toBeGreaterThan(iPresente);
  });

  it('cada posición lleva el nombre de su carta', async () => {
    const p = await paginasDelPdf();
    const todo = p
      .flatMap((pagina) => pagina.textos)
      .map((t) => t.texto)
      .join('\n');
    /* Los nombres de las seis cartas del mazo eleccionado. */
    const cartas = await prisma.card.findMany({ orderBy: { number: 'asc' }, take: 6 });
    for (const c of cartas) {
      expect(todo, `falta la carta "${c.name}" en el PDF`).toContain(c.name);
    }
  });
});

describe('el reparto conserva la tirada', () => {
  it('las seis cartas están dibujadas', async () => {
    const p = await paginasDelPdf();
    /* El diagrama usa rectángulos redondeados: un `re` por carta. El resto de
       la página también traza, así que se mira la primera página, que es
       donde está. */
    expect(p[0]!.trazados).toBeGreaterThan(6);
  });

  it('la carta girada no se sale de la hoja', async () => {
    /* La Cruz Celta rota la segunda carta 90°. Si la rotación fuera alrededor
       de la esquina en vez del centro, la carta se iría del papel. */
    const p = await paginasDelPdf();
    const primera = p[0]!;
    for (const t of primera.textos) {
      expect(t.x).toBeGreaterThanOrEqual(30);
      expect(t.x).toBeLessThanOrEqual(A4.ancho - 30);
    }
  });
});
