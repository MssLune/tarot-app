import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blankDeck } from '../data/deckTemplates';
import { userService } from '../services/userService';
import { migrateLocalDataToAccount } from '../lib/migrateLocalData';
import { ApiRequestError } from '../services/api';
import type {
  CustomDeck,
  DrawnCard,
  QuestionCategory,
  Reading,
  Ritual,
  Screen,
  Spread,
  SystemId,
} from '../types';

/* ==========================================================================
   Store global (Zustand).
   - Estado de sesión: pantalla actual, sistema, tirada elegida y cartas.
   - Estado persistente (localStorage): tiradas y mazos personalizados +
     historial de lecturas.
   - Sincronización con la API cuando el usuario está autenticado.
   ========================================================================== */

/** Genera un id corto y único sin dependencias externas. */
export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Cuántos elementos de cada tipo se agregaron al importar un archivo. */
interface ImportResult {
  decks: number;
  spreads: number;
  readings: number;
  rituals: number;
}

/* ==========================================================================
   Operaciones pendientes de sincronización.

   Cada operación lleva un `key` derivado del id (p. ej. `deck:deck_abc`).
   Sirve para dos cosas: deduplicar (no encolar dos veces el mismo fallo) y
   resolver el caso en que una creación falla y después el usuario borra el
   mazo: la intención más reciente para ese id gana, porque si no, el reintento
   volvería a crear algo que el usuario ya eliminó.
   ========================================================================== */
export type PendingOp =
  | { key: string; kind: 'deck'; deck: CustomDeck }
  | { key: string; kind: 'spread'; spread: Spread }
  | { key: string; kind: 'reading'; reading: Reading }
  | { key: string; kind: 'ritual'; ritual: Ritual }
  | { key: string; kind: 'deleteDeck'; id: string }
  | { key: string; kind: 'deleteSpread'; id: string }
  | { key: string; kind: 'deleteReading'; id: string }
  | { key: string; kind: 'deleteRitual'; id: string };

interface ReadingState {
  /* -------- Sesión (no se persiste) -------- */
  screen: Screen;
  system: SystemId | null;
  spread: Spread | null;
  /** Cartas cargadas, indexadas por id de posición. */
  cards: Record<string, DrawnCard>;
  question: string;
  /** Tema de la pregunta, para enfocar la interpretación. */
  questionCategory: QuestionCategory;
  /** Tirada que se está editando en el creador (null = nueva). */
  editingSpread: Spread | null;
  /** Mazo personalizado elegido para la lectura en curso. */
  deck: CustomDeck | null;
  /** Mazo que se está editando en el editor de mazos (null = ninguno). */
  editingDeck: CustomDeck | null;
  /** Lectura del historial que se está visualizando. */
  viewingReadingId: string | null;

  /* -------- Persistente -------- */
  customSpreads: Spread[];
  customDecks: CustomDeck[];
  history: Reading[];
  /** Rituales anotados por el usuario, con la fuente que él declara. */
  rituals: Ritual[];

  /* -------- Autenticación -------- */
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;

  /* -------- Importar / exportar -------- */
  /**
   * Integra un archivo JSON. Los ids que ya existen se omiten, así que
   * importar dos veces el mismo archivo no duplica nada.
   */
  importArchive: (archive: {
    decks: CustomDeck[];
    spreads: Spread[];
    readings: Reading[];
    /** Opcional: los respaldos v1 no traen rituales. */
    rituals?: Ritual[];
  }) => {
    decks: number;
    spreads: number;
    readings: number;
    rituals: number;
  };

  /* -------- Sincronización con API -------- */
  /** Sube a la cuenta lo que quedó en el localStorage. Idempotente. */
  migrateLocalData: () => Promise<void>;
  loadUserData: () => Promise<void>;
  syncDeck: (deck: CustomDeck) => Promise<void>;
  syncSpread: (spread: Spread) => Promise<void>;
  syncReading: (reading: Reading) => Promise<void>;
  removeDeck: (id: string) => Promise<void>;
  removeSpread: (id: string) => Promise<void>;
  removeReading: (id: string) => Promise<void>;
  syncRitual: (ritual: Ritual) => Promise<void>;
  removeRitual: (id: string) => Promise<void>;

  /* -------- Estado de la sincronización (visible en el menú de cuenta) -------- */
  /** Operaciones en vuelo contra la API. */
  syncInFlight: number;
  /** Operaciones que fallaron, en orden de encolado. */
  pendingOps: PendingOp[];
  /** Reintenta lo pendiente y recarga desde la cuenta. */
  retrySync: () => Promise<void>;
  /**
   * Aviso de límite del plan alcanzado.
   *
   * No es un error de sincronización: la operación es correcta y el backend la
   * rechazó porque el usuario llegó al tope de su plan. Se muestra una vez y
   * no entra en la cola de reintentos, porque reintentarla no puede funcionar
   * nunca.
   */
  planNotice: { message: string; code: string; key: string } | null;
  dismissPlanNotice: () => void;

  /* -------- Acciones -------- */
  goTo: (screen: Screen) => void;
  chooseSystem: (system: SystemId) => void;
  chooseSpread: (spread: Spread) => void;
  setQuestion: (q: string) => void;
  setQuestionCategory: (category: QuestionCategory) => void;
  setCard: (positionId: string, patch: Partial<DrawnCard>) => void;
  clearCards: () => void;
  /** true si todas las posiciones tienen una carta válida. */
  isComplete: () => boolean;

  /* Creador de tiradas */
  startNewSpread: () => void;
  editSpread: (spread: Spread) => void;
  saveCustomSpread: (spread: Spread) => void;
  deleteCustomSpread: (id: string) => void;

  /* Mazos personalizados */
  chooseDeck: (deck: CustomDeck) => void;
  startNewDeck: (base?: CustomDeck) => void;
  editDeck: (deck: CustomDeck) => void;
  cancelDeckEdit: () => void;
  saveCustomDeck: (deck: CustomDeck) => CustomDeck;
  deleteCustomDeck: (id: string) => void;
  duplicateCustomDeck: (id: string) => void;

  /* Historial */
  saveReading: (title?: string) => void;
  deleteReading: (id: string) => void;
  openReading: (id: string) => void;
  clearHistory: () => void;

  /* Rituales */
  /** Crea o actualiza un ritual. `id` de la entrada indica si es nuevo. */
  saveRitual: (ritual: Ritual) => void;
  deleteRitual: (id: string) => void;

  /* Reinicio */
  resetSession: () => void;
  restart: () => void;
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => {
      /* ------------------------------------------------------------------
         Cola de sincronización.
         ------------------------------------------------------------------ */

      /** Encola (o reemplaza) la operación pendiente para ese id. */
      const queueOp = (op: PendingOp) =>
        set((s) => ({
          pendingOps: [...s.pendingOps.filter((p) => p.key !== op.key), op],
        }));

      /** Saca la operación de la cola: ya está en la cuenta. */
      const dequeue = (key: string) =>
        set((s) => ({ pendingOps: s.pendingOps.filter((p) => p.key !== key) }));

      /** Traduce una operación a la llamada HTTP correspondiente. */
      const executeOp = async (op: PendingOp): Promise<void> => {
        switch (op.kind) {
          /* Mazos y tiradas van por una ruta que es upsert en el backend: si el
             id no existe lo crea y devuelve 201, si existe lo actualiza y
             devuelve 200. Una sola petición para ambos casos.

             Antes el frontend probaba con PUT y, si volvía 404, hacía el POST.
             Funcionaba, pero cada elemento nuevo generaba un 404 en la consola
             y una petición de más. */
          case 'deck':
            await userService.updateDeck(op.deck.id, op.deck);
            return;
          case 'spread':
            await userService.updateSpread(op.spread.id, op.spread);
            return;
          /* Las lecturas son inmutables: no hay ruta de actualización. */
          case 'reading':
            await userService.createReading(op.reading);
            return;
          case 'ritual':
            await userService.updateRitual(op.ritual.id, op.ritual);
            return;
          case 'deleteDeck':
            await userService.deleteDeck(op.id);
            return;
          case 'deleteSpread':
            await userService.deleteSpread(op.id);
            return;
          case 'deleteReading':
            await userService.deleteReading(op.id);
            return;
          case 'deleteRitual':
            await userService.deleteRitual(op.id);
            return;
        }
      };

      /**
       * Ejecuta la operación. Si falla por una razón recuperable, queda en
       * cola para el reintento.
       *
       * Un 402 NO entra en la cola. Es un límite del plan: reintentarlo no
       * puede funcionar nunca, y si lo encoláramos el usuario vería "1 cambio
       * sin subir" para siempre y cada "Reintentar" lo volvería a sumar. En vez
       * de eso se guarda como aviso para que la interfaz muestre el cartel de
       * "se alcanzó el límite".
       *
       * Lo mismo con un 409 de id tomado por otra cuenta: reintentar con el
       * mismo id va a seguir chocando.
       */
      const runOp = async (op: PendingOp): Promise<void> => {
        if (!get().isAuthenticated) return;
        set((s) => ({ syncInFlight: s.syncInFlight + 1 }));
        try {
          await executeOp(op);
          dequeue(op.key);
        } catch (err) {
          if (err instanceof ApiRequestError && (err.status === 402 || err.status === 409)) {
            set({
              planNotice: { message: err.message, code: err.code, key: op.key },
            });
            console.warn(`[useReadingStore] ${err.code}: ${err.message}`);
          } else {
            queueOp(op);
            console.error(`[useReadingStore] No se pudo sincronizar ${op.key}:`, err);
          }
        } finally {
          set((s) => ({ syncInFlight: Math.max(0, s.syncInFlight - 1) }));
        }
      };

      return {
        /* ---------------- Estado inicial ---------------- */
        screen: 'system',
        system: null,
        spread: null,
        cards: {},
        question: '',
        questionCategory: 'general',
        editingSpread: null,
        deck: null,
        editingDeck: null,
        viewingReadingId: null,
        customSpreads: [],
        customDecks: [],
        history: [],
        rituals: [],
        isAuthenticated: false,
        syncInFlight: 0,
        pendingOps: [],
        planNotice: null,
        dismissPlanNotice: () => set({ planNotice: null }),
        /* ---------------- Autenticación ---------------- */
        setIsAuthenticated: (value) => set({ isAuthenticated: value }),

        /* ---------------- Importar / exportar ---------------- */
        importArchive: (archive) => {
          const { customDecks, customSpreads, history, rituals: misRituales } = get();
          const deckIds = new Set(customDecks.map((d) => d.id));
          const spreadIds = new Set(customSpreads.map((s) => s.id));
          const readingIds = new Set(history.map((r) => r.id));
          const ritualIds = new Set(misRituales.map((r) => r.id));

          const added: ImportResult = { decks: 0, spreads: 0, readings: 0, rituals: 0 };

          /* Deduplicación por id, igual para los cuatro tipos: importar dos
             veces el mismo archivo no duplica nada. */
          const nuevos = <T extends { id: string }>(
            lista: T[],
            vistos: Set<string>,
            campo: keyof ImportResult,
          ): T[] =>
            lista.filter((item) => {
              if (vistos.has(item.id)) return false;
              vistos.add(item.id);
              added[campo] += 1;
              return true;
            });

          const newDecks = nuevos(archive.decks, deckIds, 'decks');
          const newSpreads = nuevos(archive.spreads, spreadIds, 'spreads');
          const newReadings = nuevos(archive.readings, readingIds, 'readings');
          /* Los respaldos v1 no traen la lista: `?? []` y sigue funcionando. */
          const newRituals = nuevos(archive.rituals ?? [], ritualIds, 'rituals');

          const hayAlgo =
            added.decks > 0 || added.spreads > 0 || added.readings > 0 || added.rituals > 0;
          if (hayAlgo) {
            set((state) => ({
              customDecks: [...newDecks, ...state.customDecks],
              customSpreads: [...newSpreads, ...state.customSpreads],
              history: [...newReadings, ...state.history].slice(0, 100),
              rituals: [...newRituals, ...state.rituals],
            }));
            /* Al estar autenticado, lo recién importado también va a la cuenta. */
            if (get().isAuthenticated) {
              newDecks.forEach((deck) => void get().syncDeck(deck));
              newSpreads.forEach((spread) => void get().syncSpread(spread));
              newReadings.forEach((reading) => void get().syncReading(reading));
              newRituals.forEach((ritual) => void get().syncRitual(ritual));
            }
          }

          return added;
        },

        /* ---------------- Sincronización con API ---------------- */
        /* Sube lo que quedó en el navegador ANTES de cargar desde la API:
         loadUserData pisa el estado con la respuesta, así que si migráramos
         después, los datos locales ya se habrían perdido. */
        migrateLocalData: async () => {
          const { isAuthenticated } = get();
          console.info('[migrate] Intentando migrar. isAuthenticated =', isAuthenticated);
          if (!isAuthenticated) return;
          try {
            const report = await migrateLocalDataToAccount();
            console.info(
              `[migrate] Encontrados en el navegador: ${report.localDecksFound} mazo(s), ` +
                `${report.localSpreadsFound} tirada(s), ${report.localReadingsFound} lectura(s).`,
            );
            console.info(
              `[migrate] Migrados a la cuenta: ${report.decksUploaded} mazo(s), ` +
                `${report.spreadsUploaded} tirada(s), ${report.readingsUploaded} lectura(s). ` +
                `Sin tocar (ya estaban): ${report.skipped}.`,
            );
          } catch (err) {
            console.error('[useReadingStore] Error migrando datos locales:', err);
          }
        },

        loadUserData: async () => {
          try {
            const [decks, spreads, readings, rituals] = await Promise.all([
              userService.listDecks(),
              userService.listSpreads(),
              userService.listReadings(),
              /* Los rituales son una función nueva: si la llamada falla no
                 debe impedir cargar el resto, así que va con su propio catch. */
              userService.listRituals().catch(() => null),
            ]);
            /* Se fusiona con lo que haya en el navegador: la API puede devolver listas
             vacías (p. ej. la migración no corrió) y, como `persist` escribe
             CADA cambio de estado en localStorage, hacer `set` con vacío
             BORRARÍA los mazos y tiradas que el usuario tenía guardados.
             Sólo se descarta lo local si ya está en la API. */
            const state = get();
            const merge = <T extends { id: string }>(remote: T[], local: T[]): T[] => {
              const remoteIds = new Set(remote.map((item) => item.id));
              const onlyLocal = local.filter((item) => !remoteIds.has(item.id));
              return [...remote, ...onlyLocal];
            };
            set({
              customDecks: merge(decks, state.customDecks),
              customSpreads: merge(spreads, state.customSpreads),
              history: merge(readings, state.history),
              /* `rituals === null` significa que esa llamada falló. En ese caso
                 no se toca la lista local: vaciarla por un fallo de red sería
                 justo la pérdida de datos que el merge de arriba evita. */
              ...(rituals ? { rituals: merge(rituals, state.rituals) } : {}),
            });
          } catch (err) {
            console.error('[useReadingStore] Error cargando datos del usuario:', err);
          }
        },

        /* Todas las sincronización pasan por la cola: si la llamada falla, la
         operación queda registrada y el menú de cuenta puede ofrecer el
         reintento. Antes el error se perdía en un console.error y el usuario
         no tenía forma de enterarse de que su mazo no se había guardado. */
        syncDeck: async (deck) => {
          await runOp({ key: `deck:${deck.id}`, kind: 'deck', deck });
        },

        syncSpread: async (spread) => {
          await runOp({ key: `spread:${spread.id}`, kind: 'spread', spread });
        },

        syncReading: async (reading) => {
          await runOp({
            key: `reading:${reading.id}`,
            kind: 'reading',
            reading,
          });
        },

        removeDeck: async (id) => {
          await runOp({ key: `deck:${id}`, kind: 'deleteDeck', id });
        },

        removeSpread: async (id) => {
          await runOp({ key: `spread:${id}`, kind: 'deleteSpread', id });
        },

        removeReading: async (id) => {
          await runOp({ key: `reading:${id}`, kind: 'deleteReading', id });
        },

        syncRitual: async (ritual) => {
          /* La ruta de rituales también es upsert en el backend, así que un
             ritual nuevo y uno editado salen por la misma llamada. */
          await runOp({ key: `ritual:${ritual.id}`, kind: 'ritual', ritual });
        },

        removeRitual: async (id) => {
          await runOp({ key: `ritual:${id}`, kind: 'deleteRitual', id });
        },

        /* Reintenta la cola y recarga desde la cuenta. Se recorren en serie: son
         pocas operaciones y así el contador de "en vuelo" refleja una en una,
         en vez de saltar a N y volver a 0 de golpe. */
        retrySync: async () => {
          const ops = [...get().pendingOps];
          for (const op of ops) {
            await runOp(op);
          }
          await get().loadUserData();
        },

        /* ---------------- Navegación ---------------- */
        goTo: (screen) => set({ screen }),

        chooseSystem: (system) =>
          set({
            system,
            // El mazo personalizable necesita un paso extra: elegir/crear el mazo.
            screen: system === 'custom-deck' ? 'decks' : 'spread',
            spread: null,
            cards: {},
            deck: null,
            viewingReadingId: null,
          }),

        chooseSpread: (spread) => {
          // Inicializa una carta vacía por posición para que el formulario sea controlado.
          const cards: Record<string, DrawnCard> = {};
          spread.positions.forEach((pos) => {
            cards[pos.id] = {
              positionId: pos.id,
              reversed: false,
              customName: '',
            };
          });
          set({ spread, cards, screen: 'input', viewingReadingId: null });
        },

        setQuestion: (question) => set({ question }),
        setQuestionCategory: (questionCategory) => set({ questionCategory }),

        /* ---------------- Carga de cartas ---------------- */
        setCard: (positionId, patch) =>
          set((state) => ({
            cards: {
              ...state.cards,
              [positionId]: {
                ...(state.cards[positionId] ?? { positionId, reversed: false }),
                ...patch,
              },
            },
          })),

        clearCards: () => {
          const spread = get().spread;
          if (!spread) return set({ cards: {} });
          const cards: Record<string, DrawnCard> = {};
          spread.positions.forEach((pos) => {
            cards[pos.id] = {
              positionId: pos.id,
              reversed: false,
              customName: '',
            };
          });
          set({ cards });
        },

        isComplete: () => {
          const { spread, cards, system } = get();
          if (!spread) return false;
          return spread.positions.every((pos) => {
            const c = cards[pos.id];
            if (!c) return false;
            if (system === 'rider-waite') return Boolean(c.arcanaId);
            if (system === 'custom-deck') return Boolean(c.deckCardId);
            return Boolean(c.customName?.trim());
          });
        },

        /* ---------------- Creador de tiradas ---------------- */
        startNewSpread: () => set({ editingSpread: null, screen: 'builder' }),

        editSpread: (spread) => set({ editingSpread: spread, screen: 'builder' }),

        saveCustomSpread: (spread) => {
          const normalized: Spread = {
            ...spread,
            custom: true,
            createdAt: spread.createdAt ?? Date.now(),
          };
          set((state) => {
            const exists = state.customSpreads.some((s) => s.id === normalized.id);
            return {
              customSpreads: exists
                ? state.customSpreads.map((s) => (s.id === normalized.id ? normalized : s))
                : [normalized, ...state.customSpreads],
              editingSpread: null,
            };
          });
          /* Se sube `normalized`, no el original: si no, a la base iría la tirada
           sin `custom: true` y sin `createdAt`, y quedaría distinta de la local. */
          get().syncSpread(normalized);
        },

        deleteCustomSpread: (id) => {
          set((state) => ({
            customSpreads: state.customSpreads.filter((s) => s.id !== id),
          }));
          get().removeSpread(id);
        },

        /* ---------------- Mazos personalizados ---------------- */
        /** Fija el mazo (y el sistema) de la lectura y avanza a elegir la tirada. */
        chooseDeck: (deck) =>
          set({
            system: 'custom-deck',
            deck,
            screen: 'spread',
            spread: null,
            cards: {},
          }),

        /** Abre el editor. Sin base arranca un mazo en blanco; con base la usa
         *  como plantilla (ya viene con ids nuevos). */
        startNewDeck: (base) => set({ editingDeck: base ?? blankDeck(), screen: 'decks' }),

        editDeck: (deck) => set({ editingDeck: deck, screen: 'decks' }),

        cancelDeckEdit: () => set({ editingDeck: null }),

        saveCustomDeck: (deck) => {
          const normalized: CustomDeck = {
            ...deck,
            name: deck.name.trim() || 'Mi mazo',
            // Descartamos las cartas sin nombre: no aportan nada a la lectura.
            cards: deck.cards
              .filter((c) => c.name.trim())
              .map((c) => ({ ...c, name: c.name.trim() })),
            createdAt: deck.createdAt || Date.now(),
            updatedAt: Date.now(),
          };
          set((state) => {
            const exists = state.customDecks.some((d) => d.id === normalized.id);
            return {
              customDecks: exists
                ? state.customDecks.map((d) => (d.id === normalized.id ? normalized : d))
                : [normalized, ...state.customDecks],
              editingDeck: null,
              // Si estábamos usando ese mazo en la lectura en curso, lo refrescamos.
              deck: state.deck?.id === normalized.id ? normalized : state.deck,
            };
          });
          get().syncDeck(normalized);
          return normalized;
        },

        deleteCustomDeck: (id) => {
          set((state) => ({
            customDecks: state.customDecks.filter((d) => d.id !== id),
            deck: state.deck?.id === id ? null : state.deck,
            editingDeck: state.editingDeck?.id === id ? null : state.editingDeck,
          }));
          get().removeDeck(id);
        },

        /* Se arma la copia fuera del `set` para poder subirla después: si la
         creáramos dentro del updater, no tendríamos la referencia. */
        duplicateCustomDeck: (id) => {
          const original = get().customDecks.find((d) => d.id === id);
          if (!original) return;
          const copy: CustomDeck = {
            ...original,
            id: uid('deck'),
            name: `${original.name} (copia)`,
            cards: original.cards.map((c) => ({ ...c, id: uid('card') })),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set((state) => ({ customDecks: [copy, ...state.customDecks] }));
          get().syncDeck(copy);
        },

        /* ---------------- Historial ---------------- */
        saveReading: (title) => {
          const { spread, cards, system, question, questionCategory, deck } = get();
          if (!spread || !system) return;
          const reading: Reading = {
            id: uid('read'),
            createdAt: Date.now(),
            system,
            // Copia profunda de la tirada para que el histórico no se rompa
            // si luego se edita o borra la tirada personalizada original.
            spread: {
              ...spread,
              positions: spread.positions.map((p) => ({ ...p })),
            },
            // Igual con el mazo propio: la lectura guardada queda autocontenida.
            deck: deck ? { ...deck, cards: deck.cards.map((c) => ({ ...c })) } : undefined,
            cards: spread.positions.map((pos) => {
              const c = cards[pos.id];
              return c ? { ...c } : { positionId: pos.id, reversed: false };
            }),
            question: question.trim() || undefined,
            questionCategory: questionCategory !== 'general' ? questionCategory : undefined,
            title: title?.trim() || undefined,
          };
          set((state) => ({
            history: [reading, ...state.history].slice(0, 100),
          }));
          get().syncReading(reading);
        },

        deleteReading: (id) => {
          set((state) => ({
            history: state.history.filter((r) => r.id !== id),
          }));
          get().removeReading(id);
        },

        openReading: (id) => {
          const reading = get().history.find((r) => r.id === id);
          if (!reading) return;
          const cards: Record<string, DrawnCard> = {};
          reading.cards.forEach((c) => {
            cards[c.positionId] = { ...c };
          });
          set({
            system: reading.system,
            spread: reading.spread,
            deck: reading.deck ?? null,
            cards,
            question: reading.question ?? '',
            questionCategory: reading.questionCategory ?? 'general',
            viewingReadingId: reading.id,
            screen: 'result',
          });
        },

        /* Tiene que llegar a la cuenta también: si sólo se vacía el
         localStorage, `loadUserData` en el próximo arranque trae las lecturas
         de vuelta de la API y el usuario ve reaparecer lo que recién borró. */
        clearHistory: () => {
          const { history, isAuthenticated } = get();
          set({ history: [] });
          if (isAuthenticated) {
            history.forEach((reading) => void get().removeReading(reading.id));
          }
        },

        /* ---------------- Rituales ---------------- */
        saveRitual: (ritual) => {
          /* `sourceVerified` no se fuerza: es una afirmación del usuario sobre
             su propia fuente, no algo que la app pueda comprobar. Lo único que
             garantizamos es que no se marque como verificada sola. */
          const normalized: Ritual = {
            ...ritual,
            title: ritual.title.trim() || 'Ritual sin título',
            body: ritual.body.trim(),
            phase: ritual.phase ?? 'any',
            source: ritual.source?.trim() || undefined,
            sourceDetail: ritual.sourceDetail?.trim() || undefined,
          };
          set((state) => {
            const exists = state.rituals.some((r) => r.id === normalized.id);
            return {
              rituals: exists
                ? state.rituals.map((r) => (r.id === normalized.id ? normalized : r))
                : [normalized, ...state.rituals],
            };
          });
          get().syncRitual(normalized);
        },

        deleteRitual: (id) => {
          set((state) => ({ rituals: state.rituals.filter((r) => r.id !== id) }));
          get().removeRitual(id);
        },

        /* ---------------- Reinicio ---------------- */
        resetSession: () =>
          set({
            system: null,
            spread: null,
            cards: {},
            question: '',
            questionCategory: 'general',
            deck: null,
            viewingReadingId: null,
          }),

        restart: () =>
          set({
            screen: 'system',
            system: null,
            spread: null,
            cards: {},
            question: '',
            questionCategory: 'general',
            editingSpread: null,
            deck: null,
            editingDeck: null,
            viewingReadingId: null,
          }),
      };
    },
    {
      name: 'arcana-storage-v1',
      // Sólo persistimos lo que el usuario creó: tiradas, mazos, historial y
      // rituales. `pendingOps` y `syncInFlight` son deliberadamente efímeros:
      // la cola de reintentos vale para la sesión en curso. Al recargar, la
      // migración vuelve a subir lo que falta.
      partialize: (state) => ({
        customSpreads: state.customSpreads,
        customDecks: state.customDecks,
        history: state.history,
        rituals: state.rituals,
      }),
    },
  ),
);
