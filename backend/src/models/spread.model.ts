import type { Spread as SpreadRow, SpreadPosition as SpreadPositionRow } from '@prisma/client';

/** Forma pública de una posición dentro de una tirada. Coincide con `SpreadPosition` del cliente. */
export interface SpreadPositionDTO {
  id: string;
  name: string;
  prompt?: string;
  x: number;
  y: number;
  rotate?: number;
}

/** Forma pública de una tirada. Coincide con el tipo `Spread` del cliente. */
export interface SpreadDTO {
  id: string;
  name: string;
  description: string;
  preset?: string;
  positions: SpreadPositionDTO[];
}

export interface SpreadPositionInput {
  id?: string;
  name: string;
  prompt?: string;
  x: number;
  y: number;
  rotate?: number;
}

export interface SpreadInput {
  id?: string;
  name: string;
  description: string;
  preset?: string;
  positions: SpreadPositionInput[];
}

type SpreadWithPositions = SpreadRow & { positions: SpreadPositionRow[] };

export function toSpreadDTO(row: SpreadWithPositions): SpreadDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preset: row.preset ?? undefined,
    positions: [...row.positions]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({
        id: p.id,
        name: p.name,
        prompt: p.prompt ?? undefined,
        x: p.x,
        y: p.y,
        rotate: p.rotate ?? undefined,
      })),
  };
}

export function validateSpreadInput(input: Partial<SpreadInput>): string[] {
  const errors: string[] = [];

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('"name" es obligatorio.');
  }
  if (typeof input.description !== 'string' || !input.description.trim()) {
    errors.push('"description" es obligatorio.');
  }
  if (!Array.isArray(input.positions) || input.positions.length === 0) {
    errors.push('"positions" debe tener al menos una posición.');
  } else {
    input.positions.forEach((pos, i) => {
      if (typeof pos.name !== 'string' || !pos.name.trim()) {
        errors.push(`La posición ${i + 1} necesita "name".`);
      }
      if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
        errors.push(`La posición ${i + 1} necesita coordenadas "x" e "y" numéricas.`);
      }
    });
  }

  return errors;
}
