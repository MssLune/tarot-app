import type { CustomDeck, FestivalNote, Reading, Ritual, Spread } from '../types';
import { api } from './api';

/* ==========================================================================
   Servicios de datos de usuario: mazos, tiradas y lecturas.
   ========================================================================== */

export const userService = {
  /* ---------- Mazos ---------- */
  listDecks: (): Promise<CustomDeck[]> => api.get<CustomDeck[]>('/user/decks'),
  getDeck: (id: string): Promise<CustomDeck> => api.get<CustomDeck>(`/user/decks/${id}`),
  createDeck: (deck: Partial<CustomDeck>): Promise<CustomDeck> =>
    api.post<CustomDeck>('/user/decks', deck),
  updateDeck: (id: string, deck: Partial<CustomDeck>): Promise<CustomDeck> =>
    api.put<CustomDeck>(`/user/decks/${id}`, deck),
  deleteDeck: (id: string): Promise<{ id: string }> => api.delete<{ id: string }>(`/user/decks/${id}`),

  /* ---------- Tiradas ---------- */
  listSpreads: (): Promise<Spread[]> => api.get<Spread[]>('/user/spreads'),
  getSpread: (id: string): Promise<Spread> => api.get<Spread>(`/user/spreads/${id}`),
  createSpread: (spread: Partial<Spread>): Promise<Spread> =>
    api.post<Spread>('/user/spreads', spread),
  updateSpread: (id: string, spread: Partial<Spread>): Promise<Spread> =>
    api.put<Spread>(`/user/spreads/${id}`, spread),
  deleteSpread: (id: string): Promise<{ id: string }> => api.delete<{ id: string }>(`/user/spreads/${id}`),

  /* ---------- Lecturas ---------- */
  listReadings: (): Promise<Reading[]> => api.get<Reading[]>('/user/readings'),
  getReading: (id: string): Promise<Reading> => api.get<Reading>(`/user/readings/${id}`),
  createReading: (reading: Partial<Reading>): Promise<Reading> =>
    api.post<Reading>('/user/readings', reading),
  deleteReading: (id: string): Promise<{ id: string }> => api.delete<{ id: string }>(`/user/readings/${id}`),

  /* ---------- Rituales ---------- */
  listRituals: (): Promise<Ritual[]> => api.get<Ritual[]>('/user/rituals'),
  createRitual: (ritual: Partial<Ritual>): Promise<Ritual> =>
    api.post<Ritual>('/user/rituals', ritual),
  /* `object` y no `Partial<Ritual>`: el store manda los opcionales vacíos
     como null para que el servidor los borre (ver `payloadRitual`). */
  updateRitual: (id: string, ritual: object): Promise<Ritual> =>
    api.put<Ritual>(`/user/rituals/${id}`, ritual),
  deleteRitual: (id: string): Promise<{ id: string }> =>
    api.delete<{ id: string }>(`/user/rituals/${id}`),

  /* ---------- Notas de festividades ---------- */
  listFestivalNotes: (anio: number): Promise<FestivalNote[]> =>
    api.get<FestivalNote[]>(`/user/festival-notes?anio=${anio}`),
  /** Guarda la nota; con texto vacío la borra y devuelve null. */
  saveFestivalNote: (festivalId: string, anio: number, body: string): Promise<FestivalNote | null> =>
    api.put<FestivalNote | null>(`/user/festival-notes/${encodeURIComponent(festivalId)}/${anio}`, { body }),
};
