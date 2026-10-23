import { interpret, moonPhase } from '@arcana/tarot-core';
import type {
  ArcanaCard,
  CardCombination,
  Reading,
  SystemId,
} from '@arcana/tarot-core';
import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import { toCardDTO } from '../models/card.model';
import { buildDocument } from '../pdf/document';
import { caraDe, paloDe, type CaraDeCarta } from '../pdf/carta';
import { imagenDeCarta } from './cardImages';
import { toFilename } from '../pdf/layout';

/* ==========================================================================
   Lectura en PDF.

   El contenido lo produce el MISMO motor de interpretación que la pantalla, el
   que vive en `@arcana/tarot-core`. Esa es la razón de que ese motor sea un
   paquete compartido y no una copia: con dos copias, cambiar una palabra en la
   redacción se aplicaría a un lado y no al otro, y el usuario leería dos
   cosas distintas sobre la misma tirada.

   El backend tiene todo lo que hace falta porque las 78 cartas con sus
   significados están en la base, no en el frontend.
   ========================================================================== */

/** Las 78 cartas. Se cargan enteras porque son pocas y el motor las indexa. */
async function cargarCartas(): Promise<ArcanaCard[]> {
  const rows = await prisma.card.findMany({ orderBy: { number: 'asc' } });
  return rows.map(toCardDTO) as unknown as ArcanaCard[];
}

async function cargarCombinaciones(): Promise<CardCombination[]> {
  const rows = await prisma.cardCombination.findMany({ orderBy: { name: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardIds: JSON.parse(r.cardIds) as string[],
    meaning: r.meaning,
    tone: r.tone as CardCombination['tone'],
  }));
}

export interface ReadingPdf {
  bytes: Buffer;
  filename: string;
}

/**
 * Arma el PDF de una lectura y devuelve los bytes con el nombre de archivo.
 *
 * La comprobación de pertenencia va aquí y no en el controller: es la última
 * línea antes de devolver el archivo, y un controller que se olvidara de ella
 * dejaría leer cualquier lectura de otro usuario. El `where` incluye el
 * `userId`, así que la consulta no encuentra la fila y no hay nada que
 * filtrar después.
 */
export async function renderReadingPdf(userId: string, readingId: string): Promise<ReadingPdf> {
  const row = await prisma.userReading.findFirst({ where: { id: readingId, userId } });
  if (!row) {
    throw ApiError.notFound('READING_NOT_FOUND', 'No existe una lectura con ese id.');
  }

  const reading: Reading = {
    id: row.id,
    createdAt: new Date(row.createdAt).getTime(),
    system: row.system as SystemId,
    title: row.title ?? undefined,
    question: row.question ?? undefined,
    questionCategory: (row.questionCategory as Reading['questionCategory']) ?? 'general',
    spread: JSON.parse(row.spread),
    deck: row.deck ? JSON.parse(row.deck) : undefined,
    cards: JSON.parse(row.cards),
  };

  const [cards, combinations] = await Promise.all([cargarCartas(), cargarCombinaciones()]);
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));

  /* El motor espera las cartas ya indexadas por id de POSICIÓN. */
  const cardsMap = Object.fromEntries(reading.cards.map((c) => [c.positionId, c]));

  const interpretation = interpret(
    reading.spread,
    cardsMap,
    reading.system,
    cardsById,
    combinations,
    reading.questionCategory ?? 'general',
    reading.question,
    reading.deck ?? null,
  );

  const luna = moonPhase(new Date(reading.createdAt));

  /* Qué cara se dibuja en cada posición. Se resuelve aquí porque el servicio es
     el único que tiene las cartas: el motor trabaja con ids, no con dibujos. */
  const cartasDe = await prisma.card.findMany({
    where: { id: { in: reading.cards.map((c) => c.arcanaId ?? '').filter(Boolean) } },
  });
  const porId = new Map(cartasDe.map((c) => [c.id, c]));

  const caras = new Map<string, CaraDeCarta>();
  for (const pos of reading.spread.positions) {
    const dibujada = reading.cards.find((c) => c.positionId === pos.id);
    if (!dibujada) continue;

    if (reading.system === 'rider-waite' && dibujada.arcanaId) {
      const carta = porId.get(dibujada.arcanaId);
      if (carta) {
        caras.set(
          pos.id,
          caraDe(carta.name, {
            subtitulo: carta.correspondence,
            esMayor: carta.arcanaType === 'mayor',
            numero: carta.arcanaType === 'mayor' ? carta.number : null,
            palo: paloDe(carta.arcanaType, carta.suit),
            imagen: imagenDeCarta(carta.image),
            invertida: dibujada.reversed,
          }),
        );
        continue;
      }
    }

    /* Mazo propio u oráculo: el nombre y el significado los escribió el
       usuario, así que no hay nada que ir a buscar. Un oráculo no tiene ni
       arcanos ni palos, y se dibuja sin símbolo: el nombre es toda la
       información que hay. */
    const propia = reading.deck?.cards.find((c) => c.id === dibujada.deckCardId) ?? null;
    caras.set(
      pos.id,
      caraDe(dibujada.customName ?? propia?.name ?? 'Carta', {
        subtitulo:
          propia?.subtitle ?? (reading.system === 'custom-deck' ? 'Mazo propio' : 'Oráculo'),
        esMayor: false,
        numero: null,
        palo: null,
        invertida: dibujada.reversed,
      }),
    );
  }

  const bytes = await buildDocument({ reading, interpretation, luna, caras });

  return { bytes, filename: toFilename(reading) };
}
