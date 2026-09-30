import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import { type CardDTO, type CardInput, toCardDTO, validateCardInput } from '../models/card.model';

export interface CardListQuery {
  search?: string;
  element?: string;
  axis?: string;
  energy?: string;
  arcanaType?: string;
  suit?: string;
}

const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (ch) => ACCENTS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function listCards(query: CardListQuery): Promise<CardDTO[]> {
  const rows = await prisma.card.findMany({
    where: {
      ...(query.element ? { element: query.element } : {}),
      ...(query.axis ? { axis: query.axis } : {}),
      ...(query.energy ? { energy: query.energy } : {}),
      ...(query.arcanaType ? { arcanaType: query.arcanaType } : {}),
      ...(query.suit ? { suit: query.suit } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { upright: { contains: query.search } },
              { reversed: { contains: query.search } },
              { keywords: { contains: query.search } },
              { advice: { contains: query.search } },
            ],
          }
        : {}),
    },
    orderBy: { number: 'asc' },
  });
  return rows.map(toCardDTO);
}

export async function getCardById(id: string): Promise<CardDTO> {
  const row = await prisma.card.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('CARD_NOT_FOUND', `No existe una carta con id "${id}".`);
  return toCardDTO(row);
}

export async function createCard(input: CardInput): Promise<CardDTO> {
  const errors = validateCardInput(input);
  if (errors.length) throw ApiError.badRequest('INVALID_CARD', errors.join(' '));

  const id = input.id?.trim() || slugify(input.name);
  const row = await prisma.card.create({
    data: {
      id,
      number: input.number,
      name: input.name,
      glyph: input.glyph,
      correspondence: input.correspondence,
      element: input.element,
      axis: input.axis,
      energy: input.energy,
      arcanaType: input.arcanaType,
      suit: input.suit,
      rank: input.rank,
      rankValue: input.rankValue,
      keywords: JSON.stringify(input.keywords),
      reversedKeywords: JSON.stringify(input.reversedKeywords),
      upright: input.upright,
      reversed: input.reversed,
      advice: input.advice,
      loveHint: input.loveHint,
      workHint: input.workHint,
      moneyHint: input.moneyHint,
      healthHint: input.healthHint,
      conceptTags: input.conceptTags ? JSON.stringify(input.conceptTags) : undefined,
      yesNo: input.yesNo,
      yesNoReason: input.yesNoReason,
      pastText: input.pastText,
      presentText: input.presentText,
      futureText: input.futureText,
      pastTextReversed: input.pastTextReversed,
      presentTextReversed: input.presentTextReversed,
      futureTextReversed: input.futureTextReversed,
      astrology: input.astrology,
    },
  });
  return toCardDTO(row);
}

export async function updateCard(id: string, input: Partial<CardInput>): Promise<CardDTO> {
  const current = await getCardById(id);

  const merged: CardInput = { ...current, ...input };
  const errors = validateCardInput(merged);
  if (errors.length) throw ApiError.badRequest('INVALID_CARD', errors.join(' '));

  const row = await prisma.card.update({
    where: { id },
    data: {
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.glyph !== undefined ? { glyph: input.glyph } : {}),
      ...(input.correspondence !== undefined ? { correspondence: input.correspondence } : {}),
      ...(input.element !== undefined ? { element: input.element } : {}),
      ...(input.axis !== undefined ? { axis: input.axis } : {}),
      ...(input.energy !== undefined ? { energy: input.energy } : {}),
      ...(input.arcanaType !== undefined ? { arcanaType: input.arcanaType } : {}),
      ...(input.suit !== undefined ? { suit: input.suit } : {}),
      ...(input.rank !== undefined ? { rank: input.rank } : {}),
      ...(input.rankValue !== undefined ? { rankValue: input.rankValue } : {}),
      ...(input.keywords !== undefined ? { keywords: JSON.stringify(input.keywords) } : {}),
      ...(input.reversedKeywords !== undefined
        ? { reversedKeywords: JSON.stringify(input.reversedKeywords) }
        : {}),
      ...(input.upright !== undefined ? { upright: input.upright } : {}),
      ...(input.reversed !== undefined ? { reversed: input.reversed } : {}),
      ...(input.advice !== undefined ? { advice: input.advice } : {}),
      ...(input.loveHint !== undefined ? { loveHint: input.loveHint } : {}),
      ...(input.workHint !== undefined ? { workHint: input.workHint } : {}),
      ...(input.moneyHint !== undefined ? { moneyHint: input.moneyHint } : {}),
      ...(input.healthHint !== undefined ? { healthHint: input.healthHint } : {}),
      ...(input.conceptTags !== undefined ? { conceptTags: JSON.stringify(input.conceptTags) } : {}),
      ...(input.yesNo !== undefined ? { yesNo: input.yesNo } : {}),
      ...(input.yesNoReason !== undefined ? { yesNoReason: input.yesNoReason } : {}),
      ...(input.pastText !== undefined ? { pastText: input.pastText } : {}),
      ...(input.presentText !== undefined ? { presentText: input.presentText } : {}),
      ...(input.futureText !== undefined ? { futureText: input.futureText } : {}),
      ...(input.pastTextReversed !== undefined ? { pastTextReversed: input.pastTextReversed } : {}),
      ...(input.presentTextReversed !== undefined
        ? { presentTextReversed: input.presentTextReversed }
        : {}),
      ...(input.futureTextReversed !== undefined ? { futureTextReversed: input.futureTextReversed } : {}),
      ...(input.astrology !== undefined ? { astrology: input.astrology } : {}),
    },
  });
  return toCardDTO(row);
}

export async function deleteCard(id: string): Promise<void> {
  await getCardById(id);
  await prisma.card.delete({ where: { id } });
}
