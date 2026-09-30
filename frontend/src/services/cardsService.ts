import type { ArcanaCard } from '../types';
import { api } from './api';

/** Cartas de tarot (Arcanos Mayores) expuestas por la API. */
export const cardsService = {
  getAll: (): Promise<ArcanaCard[]> => api.get<ArcanaCard[]>('/cards'),
  getById: (id: string): Promise<ArcanaCard> => api.get<ArcanaCard>(`/cards/${id}`),
};
