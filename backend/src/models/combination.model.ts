import type { CardCombination as CombinationRow } from '@prisma/client';

/** Forma pública de una combinación de cartas, tal como la consume el frontend. */
export interface CardCombinationDTO {
  id: string;
  name: string;
  cardIds: string[];
  meaning: string;
  tone: string;
}

export interface CardCombinationInput {
  id?: string;
  name: string;
  cardIds: string[];
  meaning: string;
  tone?: string;
}

const VALID_TONES = new Set(['gold', 'violet', 'amber', 'rose']);

export function toCombinationDTO(row: CombinationRow): CardCombinationDTO {
  return {
    id: row.id,
    name: row.name,
    cardIds: JSON.parse(row.cardIds) as string[],
    meaning: row.meaning,
    tone: row.tone,
  };
}

export function validateCombinationInput(input: Partial<CardCombinationInput>): string[] {
  const errors: string[] = [];

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('"name" es obligatorio.');
  }
  if (typeof input.meaning !== 'string' || !input.meaning.trim()) {
    errors.push('"meaning" es obligatorio.');
  }
  if (!Array.isArray(input.cardIds) || input.cardIds.length < 2 || input.cardIds.length > 3) {
    errors.push('"cardIds" debe tener 2 o 3 ids de carta.');
  }
  if (input.tone !== undefined && !VALID_TONES.has(input.tone)) {
    errors.push(`"tone" debe ser uno de: ${[...VALID_TONES].join(', ')}.`);
  }

  return errors;
}
