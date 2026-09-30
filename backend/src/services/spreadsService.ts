import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import {
  type SpreadDTO,
  type SpreadInput,
  toSpreadDTO,
  validateSpreadInput,
} from '../models/spread.model';

const withPositions = { positions: true } as const;

export interface SpreadListQuery {
  search?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function listSpreads(query: SpreadListQuery): Promise<SpreadDTO[]> {
  const rows = await prisma.spread.findMany({
    where: query.search ? { name: { contains: query.search } } : undefined,
    include: withPositions,
    orderBy: { name: 'asc' },
  });
  return rows.map(toSpreadDTO);
}

export async function getSpreadById(id: string): Promise<SpreadDTO> {
  const row = await prisma.spread.findUnique({ where: { id }, include: withPositions });
  if (!row) throw ApiError.notFound('SPREAD_NOT_FOUND', `No existe una tirada con id "${id}".`);
  return toSpreadDTO(row);
}

export async function createSpread(input: SpreadInput): Promise<SpreadDTO> {
  const errors = validateSpreadInput(input);
  if (errors.length) throw ApiError.badRequest('INVALID_SPREAD', errors.join(' '));

  const id = input.id?.trim() || slugify(input.name);
  const row = await prisma.spread.create({
    data: {
      id,
      name: input.name,
      description: input.description,
      preset: input.preset,
      positions: {
        create: input.positions.map((p, index) => ({
          id: p.id?.trim() || `${id}-p${index + 1}`,
          order: index,
          name: p.name,
          prompt: p.prompt,
          x: p.x,
          y: p.y,
          rotate: p.rotate,
        })),
      },
    },
    include: withPositions,
  });
  return toSpreadDTO(row);
}

export async function updateSpread(id: string, input: Partial<SpreadInput>): Promise<SpreadDTO> {
  const current = await getSpreadById(id);
  const merged: SpreadInput = {
    name: input.name ?? current.name,
    description: input.description ?? current.description,
    preset: input.preset ?? current.preset,
    positions: input.positions ?? current.positions,
  };

  const errors = validateSpreadInput(merged);
  if (errors.length) throw ApiError.badRequest('INVALID_SPREAD', errors.join(' '));

  // Reemplazamos todas las posiciones: con listas tan chicas (1-12 ítems) es
  // más simple y menos propenso a errores que hacer un diff campo a campo.
  const row = await prisma.$transaction(async (tx) => {
    await tx.spreadPosition.deleteMany({ where: { spreadId: id } });
    return tx.spread.update({
      where: { id },
      data: {
        name: merged.name,
        description: merged.description,
        preset: merged.preset,
        positions: {
          create: merged.positions.map((p, index) => ({
            id: p.id?.trim() || `${id}-p${index + 1}`,
            order: index,
            name: p.name,
            prompt: p.prompt,
            x: p.x,
            y: p.y,
            rotate: p.rotate,
          })),
        },
      },
      include: withPositions,
    });
  });

  return toSpreadDTO(row);
}

export async function deleteSpread(id: string): Promise<void> {
  await getSpreadById(id);
  await prisma.spread.delete({ where: { id } });
}
