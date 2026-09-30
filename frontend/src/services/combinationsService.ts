import type { CardCombination } from '../types';
import { api } from './api';

/** Combinaciones de cartas con significado especial, expuestas por la API. */
export const combinationsService = {
  getAll: (): Promise<CardCombination[]> => api.get<CardCombination[]>('/combinations'),
};
