import { create } from 'zustand';
import { cardsService } from '../services/cardsService';
import { combinationsService } from '../services/combinationsService';
import { spreadsService } from '../services/spreadsService';
import type { ArcanaCard, CardCombination, Spread } from '../types';

/* ==========================================================================
   Store de contenido editorial (cartas + tiradas predefinidas + combinaciones).
   A diferencia de useReadingStore, esto NO se persiste: se trae de la API
   al arrancar la app y vive sólo en memoria durante la sesión.
   ========================================================================== */

type ContentStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ContentState {
  status: ContentStatus;
  error: string | null;
  cards: ArcanaCard[];
  cardsById: Record<string, ArcanaCard>;
  spreads: Spread[];
  combinations: CardCombination[];
  loadContent: () => Promise<void>;
}

export const useContentStore = create<ContentState>()((set, get) => ({
  status: 'idle',
  error: null,
  cards: [],
  cardsById: {},
  spreads: [],
  combinations: [],

  loadContent: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const [cards, spreads, combinations] = await Promise.all([
        cardsService.getAll(),
        spreadsService.getAll(),
        combinationsService.getAll(),
      ]);
      const cardsById = cards.reduce<Record<string, ArcanaCard>>((acc, card) => {
        acc[card.id] = card;
        return acc;
      }, {});
      set({ status: 'ready', cards, cardsById, spreads, combinations });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'No se pudo cargar el contenido.',
      });
    }
  },
}));
