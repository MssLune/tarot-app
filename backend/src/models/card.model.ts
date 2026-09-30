import type { Card as CardRow } from '@prisma/client';

/**
 * Forma pública de una carta, tal como la consume el frontend.
 * Coincide con el tipo `ArcanaCard` del cliente.
 */
export interface CardDTO {
  id: string;
  number: number;
  name: string;
  glyph: string;
  correspondence: string;
  element: string;
  axis: string;
  energy: string;
  /** 'mayor' | 'menor'. */
  arcanaType: string;
  suit?: string;
  rank?: string;
  rankValue?: number;
  keywords: string[];
  reversedKeywords: string[];
  upright: string;
  reversed: string;
  advice: string;
  /** Frase corta y opcional que enfoca la carta según el tema de la pregunta. */
  loveHint?: string;
  workHint?: string;
  moneyHint?: string;
  healthHint?: string;
  /** Ficha de referencia (siempre al derecho), tomada de la guía del usuario. */
  conceptTags?: string[];
  yesNo?: string;
  yesNoReason?: string;
  pastText?: string;
  presentText?: string;
  futureText?: string;
  pastTextReversed?: string;
  presentTextReversed?: string;
  futureTextReversed?: string;
  astrology?: string;
}

/** Datos aceptados al crear/editar una carta. */
export interface CardInput {
  id?: string;
  number: number;
  name: string;
  glyph: string;
  correspondence: string;
  element: string;
  axis: string;
  energy: string;
  arcanaType: string;
  suit?: string;
  rank?: string;
  rankValue?: number;
  keywords: string[];
  reversedKeywords: string[];
  upright: string;
  reversed: string;
  advice: string;
  loveHint?: string;
  workHint?: string;
  moneyHint?: string;
  healthHint?: string;
  conceptTags?: string[];
  yesNo?: string;
  yesNoReason?: string;
  pastText?: string;
  presentText?: string;
  futureText?: string;
  pastTextReversed?: string;
  presentTextReversed?: string;
  futureTextReversed?: string;
  astrology?: string;
}

/** Convierte la fila de la base (keywords como JSON string) a la forma pública. */
export function toCardDTO(row: CardRow): CardDTO {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    glyph: row.glyph,
    correspondence: row.correspondence,
    element: row.element,
    axis: row.axis,
    energy: row.energy,
    arcanaType: row.arcanaType,
    suit: row.suit ?? undefined,
    rank: row.rank ?? undefined,
    rankValue: row.rankValue ?? undefined,
    keywords: JSON.parse(row.keywords) as string[],
    reversedKeywords: JSON.parse(row.reversedKeywords) as string[],
    upright: row.upright,
    reversed: row.reversed,
    advice: row.advice,
    loveHint: row.loveHint ?? undefined,
    workHint: row.workHint ?? undefined,
    moneyHint: row.moneyHint ?? undefined,
    healthHint: row.healthHint ?? undefined,
    conceptTags: row.conceptTags ? (JSON.parse(row.conceptTags) as string[]) : undefined,
    yesNo: row.yesNo ?? undefined,
    yesNoReason: row.yesNoReason ?? undefined,
    pastText: row.pastText ?? undefined,
    presentText: row.presentText ?? undefined,
    futureText: row.futureText ?? undefined,
    pastTextReversed: row.pastTextReversed ?? undefined,
    presentTextReversed: row.presentTextReversed ?? undefined,
    futureTextReversed: row.futureTextReversed ?? undefined,
    astrology: row.astrology ?? undefined,
  };
}

const REQUIRED_STRING_FIELDS: (keyof CardInput)[] = [
  'name',
  'glyph',
  'correspondence',
  'element',
  'axis',
  'energy',
  'arcanaType',
  'upright',
  'reversed',
  'advice',
];

/** Valida el payload de entrada; devuelve la lista de errores (vacía si es válido). */
export function validateCardInput(input: Partial<CardInput>): string[] {
  const errors: string[] = [];

  if (typeof input.number !== 'number' || !Number.isFinite(input.number)) {
    errors.push('"number" es obligatorio y debe ser numérico.');
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof input[field] !== 'string' || !(input[field] as string).trim()) {
      errors.push(`"${field}" es obligatorio.`);
    }
  }
  if (input.arcanaType && !['mayor', 'menor'].includes(input.arcanaType)) {
    errors.push('"arcanaType" debe ser "mayor" o "menor".');
  }
  if (!Array.isArray(input.keywords)) {
    errors.push('"keywords" debe ser una lista de strings.');
  }
  if (!Array.isArray(input.reversedKeywords)) {
    errors.push('"reversedKeywords" debe ser una lista de strings.');
  }

  return errors;
}
