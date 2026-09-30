import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import {
  type CardCombinationDTO,
  type CardCombinationInput,
  toCombinationDTO,
  validateCombinationInput,
} from '../models/combination.model';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function listCombinations(): Promise<CardCombinationDTO[]> {
  const rows = await prisma.cardCombination.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toCombinationDTO);
}

export async function getCombinationById(id: string): Promise<CardCombinationDTO> {
  const row = await prisma.cardCombination.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('COMBINATION_NOT_FOUND', `No existe una combinación con id "${id}".`);
  return toCombinationDTO(row);
}

export async function createCombination(input: CardCombinationInput): Promise<CardCombinationDTO> {
  const errors = validateCombinationInput(input);
  if (errors.length) throw ApiError.badRequest('INVALID_COMBINATION', errors.join(' '));

  const id = input.id?.trim() || slugify(input.name);
  const row = await prisma.cardCombination.create({
    data: {
      id,
      name: input.name,
      cardIds: JSON.stringify(input.cardIds),
      meaning: input.meaning,
      tone: input.tone ?? 'rose',
    },
  });
  return toCombinationDTO(row);
}

export async function updateCombination(
  id: string,
  input: Partial<CardCombinationInput>,
): Promise<CardCombinationDTO> {
  const current = await getCombinationById(id);
  const merged: CardCombinationInput = { ...current, ...input };

  const errors = validateCombinationInput(merged);
  if (errors.length) throw ApiError.badRequest('INVALID_COMBINATION', errors.join(' '));

  const row = await prisma.cardCombination.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.cardIds !== undefined ? { cardIds: JSON.stringify(input.cardIds) } : {}),
      ...(input.meaning !== undefined ? { meaning: input.meaning } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
    },
  });
  return toCombinationDTO(row);
}

export async function deleteCombination(id: string): Promise<void> {
  await getCombinationById(id);
  await prisma.cardCombination.delete({ where: { id } });
}
