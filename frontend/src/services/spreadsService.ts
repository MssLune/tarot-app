import type { Spread } from '../types';
import { api } from './api';

/** Tiradas predefinidas expuestas por la API. */
export const spreadsService = {
  getAll: (): Promise<Spread[]> => api.get<Spread[]>('/spreads'),
  getById: (id: string): Promise<Spread> => api.get<Spread>(`/spreads/${id}`),
};
