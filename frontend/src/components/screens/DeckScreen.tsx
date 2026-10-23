import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { blankCard, getDeckTemplates, parseKeywords } from '../../data/deckTemplates';
import { buildArchive, downloadArchive } from '../../lib/archive';
import { AXIS_LABELS, ELEMENT_LABELS } from '@arcana/tarot-core';
import { useContentStore } from '../../store/useContentStore';
import { uid, useReadingStore } from '../../store/useReadingStore';
import type { Axis, CustomCard, CustomDeck, Element, Energy } from '../../types';
import ImportPanel from '../layout/ImportPanel';
import Button from '../ui/Button';
import Glyph from '../ui/Glyph';
import OrnateDivider from '../ui/OrnateDivider';
import SectionHeading from '../ui/SectionHeading';
import Toggle from '../ui/Toggle';

/* ==========================================================================
   Sistema "Mazo propio".
   Dos vistas en una pantalla:
   - Lista: mazos guardados + plantillas para crear uno nuevo.
   - Editor: identidad del mazo y carta por carta, con significado al derecho
     y al revés (más metadatos opcionales que enriquecen los patrones).
   ========================================================================== */

/** Cuántas cartas del mazo ya tienen algún significado escrito. */
const countWritten = (deck: CustomDeck): number =>
  deck.cards.filter((c) => c.upright?.trim() || c.reversed?.trim()).length;

export default function DeckScreen() {
  const editingDeck = useReadingStore((s) => s.editingDeck);
  return editingDeck ? <DeckEditor deck={editingDeck} /> : <DeckList />;
}

/* ==========================================================================
   Vista 1 — Mis mazos
   ========================================================================== */

function DeckList() {
  const customDecks = useReadingStore((s) => s.customDecks);
  const chooseDeck = useReadingStore((s) => s.chooseDeck);
  const startNewDeck = useReadingStore((s) => s.startNewDeck);
  const editDeck = useReadingStore((s) => s.editDeck);
  const deleteCustomDeck = useReadingStore((s) => s.deleteCustomDeck);
  const duplicateCustomDeck = useReadingStore((s) => s.duplicateCustomDeck);
  const goTo = useReadingStore((s) => s.goTo);
  const cards = useContentStore((s) => s.cards);
  // La plantilla "Partir de los 22 Arcanos Mayores" sólo usa los Mayores,
  // aunque el store ahora traiga las 78 cartas del mazo completo.
  const majorArcana = useMemo(() => cards.filter((c) => c.arcanaType === 'mayor'), [cards]);
  const deckTemplates = useMemo(() => getDeckTemplates(majorArcana), [majorArcana]);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{
    decks: number;
    spreads: number;
    readings: number;
    rituals: number;
  } | null>(null);

  return (
    <div className="space-y-10">
      {/* ---------------- Encabezado ---------------- */}
      <div className="space-y-5">
        <div className="flex justify-center">
          <button
            onClick={() => goTo('system')}
            className="group flex items-center gap-2 rounded-full border border-gold-400/20 bg-ink-900/50 px-4 py-2 text-[0.65rem] uppercase tracking-[0.2em] text-gold-200/70 transition-colors hover:border-gold-300/50 hover:text-gold-100"
          >
            <span className="text-gold-300">✧</span>
            Mazo propio
            <span className="text-gold-100/30 transition-colors group-hover:text-gold-200">
              · cambiar sistema
            </span>
          </button>
        </div>

        <SectionHeading
          overline="Tarot u oráculo personalizado"
          title="Elige tu mazo"
          subtitle="Carga tus cartas una vez, con su significado al derecho y al revés, y úsalas en cualquier tirada. Quedan guardadas en tu dispositivo."
        />
      </div>

      {/* ---------------- Mazos guardados ---------------- */}
      {customDecks.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <h3 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
              Mis mazos · {customDecks.length}
            </h3>
            <span className="hairline h-px flex-1 opacity-60" />
          </div>

          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {customDecks.map((deck, i) => {
                const written = countWritten(deck);
                const ready = deck.cards.length > 0;
                return (
                  <motion.article
                    key={deck.id}
                    layout
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ delay: Math.min(i * 0.06, 0.4), duration: 0.45 }}
                    whileHover={{ y: -4 }}
                    className="panel gilded group relative flex flex-col overflow-hidden p-5"
                  >
                    <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-mystic-500/10 blur-3xl transition-colors duration-700 group-hover:bg-gold-400/15" />

                    {/* Muestra de glifos del mazo */}
                    <div className="relative mb-4 flex flex-wrap gap-1.5">
                      {deck.cards.slice(0, 10).map((c, index) => (
                        <span
                          key={c.id}
                          title={c.name}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-400/15 bg-ink-950/60 text-xs text-gold-300/60"
                        >
                          <Glyph>{c.glyph?.trim() || String.fromCharCode(65 + (index % 26))}</Glyph>
                        </span>
                      ))}
                      {deck.cards.length > 10 && (
                        <span className="flex h-8 items-center rounded-lg border border-gold-400/10 px-2 text-[0.6rem] text-gold-100/35">
                          +{deck.cards.length - 10}
                        </span>
                      )}
                      {deck.cards.length === 0 && (
                        <span className="text-[0.7rem] text-gold-100/30">
                          Todavía no tiene cartas
                        </span>
                      )}
                    </div>

                    <div className="relative flex flex-1 flex-col">
                      <h3 className="text-base leading-snug text-gold-100 sm:text-lg">{deck.name}</h3>
                      <p className="mt-1 text-[0.68rem] text-gold-200/50">
                        {deck.cards.length} {deck.cards.length === 1 ? 'carta' : 'cartas'} ·{' '}
                        {written} con significado
                        {deck.allowReversed ? ' · admite invertidas' : ''}
                      </p>
                      {deck.description?.trim() && (
                        <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-gold-100/40">
                          {deck.description}
                        </p>
                      )}

                      {confirmId === deck.id ? (
                        <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2">
                          <span className="flex-1 text-[0.7rem] text-rose-100">
                            ¿Borrar «{deck.name}»?
                          </span>
                          <button
                            onClick={() => {
                              deleteCustomDeck(deck.id);
                              setConfirmId(null);
                            }}
                            className="font-display text-[0.62rem] uppercase tracking-[0.14em] text-rose-100 underline underline-offset-4"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="font-display text-[0.62rem] uppercase tracking-[0.14em] text-gold-100/60"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="mt-5 flex items-center gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={!ready}
                            title={ready ? undefined : 'Agrega al menos una carta'}
                            onClick={() => chooseDeck(deck)}
                          >
                            Usar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => editDeck(deck)}>
                            Editar
                          </Button>
                          <button
                            onClick={() => duplicateCustomDeck(deck.id)}
                            title="Duplicar mazo"
                            className="rounded-full px-2 py-2 text-xs text-gold-200/45 transition-colors hover:bg-gold-400/10 hover:text-gold-100"
                          >
                            ⧉
                          </button>
                          <button
                            onClick={() => setConfirmId(deck.id)}
                            title="Eliminar mazo"
                            className="rounded-full px-2 py-2 text-xs text-rose-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      {customDecks.length > 0 && <OrnateDivider symbol="☾" />}

      {/* ---------------- Plantillas ---------------- */}
      <section className="space-y-5">
        <div className="flex items-center gap-4">
          <h3 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
            {customDecks.length > 0 ? 'Crear otro mazo' : 'Crea tu primer mazo'}
          </h3>
          <span className="hairline h-px flex-1 opacity-60" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {deckTemplates.map((template, i) => (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.45 }}
              whileHover={{ y: -4 }}
              onClick={() => startNewDeck(template.build())}
              className="panel group relative flex items-start gap-4 overflow-hidden p-5 text-left transition-colors hover:border-gold-300/50"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-300/30 bg-ink-950/70 text-xl text-gold-gradient transition-transform duration-500 group-hover:scale-110">
                <Glyph>{template.glyph}</Glyph>
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm uppercase tracking-[0.14em] text-gold-100">
                  {template.label}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-gold-100/45">
                  {template.description}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Respaldo: exportar / importar todo en un archivo JSON. */}
      <section className="panel gilded space-y-3 p-5">
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            Respaldo
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-gold-100/45">
            Descarga tus mazos, tiradas, lecturas y rituales en un archivo JSON. Es la
            única copia que sobrevive si limpias los datos del navegador.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const { customDecks, customSpreads, history, rituals } =
                useReadingStore.getState();
              downloadArchive(buildArchive({ customDecks, customSpreads, history, rituals }));
            }}
          >
            ⇩ Exportar todo
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            ⇧ Importar desde archivo
          </Button>
        </div>
        {showImport && (
          <ImportPanel
            onClose={() => setShowImport(false)}
            onDone={(result) => {
              setShowImport(false);
              setImportResult(result);
            }}
          />
        )}
        {importResult && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-gold-400/25 bg-gold-400/[0.07] px-4 py-2.5 text-xs text-gold-100/75"
          >
            Importado: {importResult.decks} mazo(s), {importResult.spreads} tirada(s),{' '}
            {importResult.readings} lectura(s), {importResult.rituals} ritual(es).
          </motion.p>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Vista 2 — Editor de mazo
   ========================================================================== */

/** Campo de palabras clave: mantiene el texto crudo mientras se escribe. */
function KeywordsInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string[];
  onChange: (list: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value.join(', '));
  return (
    <input
      id={id}
      type="text"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseKeywords(e.target.value));
      }}
      placeholder={placeholder}
      className="!py-2 !text-sm"
    />
  );
}

const ELEMENTS: Element[] = ['fuego', 'agua', 'aire', 'tierra'];
const ENERGIES: Energy[] = ['activa', 'receptiva', 'transformadora'];
const AXES: Axis[] = [
  'inicio',
  'voluntad',
  'intuicion',
  'vinculo',
  'estructura',
  'transicion',
  'sombra',
  'plenitud',
];

function DeckEditor({ deck }: { deck: CustomDeck }) {
  const saveCustomDeck = useReadingStore((s) => s.saveCustomDeck);
  const cancelDeckEdit = useReadingStore((s) => s.cancelDeckEdit);
  const chooseDeck = useReadingStore((s) => s.chooseDeck);
  /** true si el mazo ya existe en el archivo (edición) y no es una plantilla nueva. */
  const isSaved = useReadingStore((s) => s.customDecks.some((d) => d.id === deck.id));

  /* ---------------- Estado local del editor ---------------- */
  const [name, setName] = useState(deck.name);
  const [description, setDescription] = useState(deck.description ?? '');
  const [allowReversed, setAllowReversed] = useState(deck.allowReversed);
  const [cards, setCards] = useState<CustomCard[]>(() => deck.cards.map((c) => ({ ...c })));
  const [selectedId, setSelectedId] = useState<string | null>(deck.cards[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.name.toLowerCase().includes(q));
  }, [cards, search]);

  const written = cards.filter((c) => c.upright?.trim() || c.reversed?.trim()).length;
  const named = cards.filter((c) => c.name.trim()).length;

  /* ---------------- Operaciones sobre cartas ---------------- */
  const updateCard = (id: string, patch: Partial<CustomCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (error) setError(null);
  };

  const addCard = () => {
    const card = blankCard();
    setCards((prev) => [...prev, card]);
    setSelectedId(card.id);
    setSearch('');
  };

  const duplicateCard = (id: string) => {
    const original = cards.find((c) => c.id === id);
    if (!original) return;
    const copy: CustomCard = { ...original, id: uid('card'), name: `${original.name} (copia)` };
    setCards((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  };

  const removeCard = (id: string) => {
    setCards((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      const next = prev.filter((c) => c.id !== id);
      if (selectedId === id) setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
      return next;
    });
  };

  /* ---------------- Guardado ---------------- */
  const buildDeck = (): CustomDeck => ({
    ...deck,
    name: name.trim() || 'Mi mazo',
    description: description.trim() || undefined,
    allowReversed,
    cards: cards.map((c) => ({ ...c, name: c.name.trim() })),
  });

  const validate = (): boolean => {
    if (!name.trim()) {
      setError('Ponele un nombre al mazo para poder guardarlo.');
      return false;
    }
    if (!cards.some((c) => c.name.trim())) {
      setError('Agrega al menos una carta con nombre.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    saveCustomDeck(buildDeck());
  };

  const handleSaveAndUse = () => {
    if (!validate()) return;
    // saveCustomDeck devuelve el mazo normalizado (sin cartas sin nombre).
    chooseDeck(saveCustomDeck(buildDeck()));
  };

  return (
    <div className="space-y-9">
      <SectionHeading
        overline={isSaved ? 'Editar mazo' : 'Nuevo mazo'}
        title="Tu mazo, tus significados"
        subtitle="Nombra cada carta y escribe qué dice al derecho y qué dice invertida. Lo que dejes vacío se resuelve solo en la lectura, así que puedes empezar por lo esencial y completar de a poco."
      />

      {/* ---------------- Identidad del mazo ---------------- */}
      <div className="panel gilded grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="overline mb-2 block" htmlFor="deck-name">
            Nombre del mazo
          </label>
          <input
            id="deck-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Ej: Oráculo de la Luna, Mi Tarot"
          />
        </div>
        <div>
          <label className="overline mb-2 block" htmlFor="deck-desc">
            Descripción{' '}
            <span className="normal-case tracking-normal text-gold-100/25">(opcional)</span>
          </label>
          <input
            id="deck-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="De qué mazo se trata"
          />
        </div>
        <div className="sm:col-span-2">
          <Toggle
            checked={allowReversed}
            onChange={setAllowReversed}
            label="Este mazo se lee invertido"
            hint={
              allowReversed
                ? 'Al cargar las cartas vas a poder marcar cuáles salieron al revés'
                : 'Se oculta la opción de carta invertida al hacer la lectura'
            }
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ================= Lista de cartas ================= */}
        <div className="panel flex flex-col p-4 lg:sticky lg:top-36 lg:max-h-[calc(100vh-12rem)] lg:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
              Cartas · {cards.length}
            </h3>
            <span className="text-[0.6rem] uppercase tracking-[0.14em] text-gold-100/30">
              {written} con texto
            </span>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar carta…"
            className="!py-2 !text-sm"
          />

          <div className="no-scrollbar mt-3 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            <AnimatePresence initial={false}>
              {visible.map((card) => {
                const active = card.id === selectedId;
                const hasText = Boolean(card.upright?.trim() || card.reversed?.trim());
                return (
                  <motion.button
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    onClick={() => setSelectedId(card.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-gold-300/60 bg-gold-400/[0.1]'
                        : 'border-gold-400/12 bg-ink-950/40 hover:border-gold-400/35'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold-400/20 text-xs text-gold-300/70">
                      <Glyph>{card.glyph?.trim() || '✧'}</Glyph>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-xs ${
                          card.name.trim() ? 'text-gold-100' : 'italic text-gold-100/30'
                        }`}
                      >
                        {card.name.trim() || 'Carta sin nombre'}
                      </span>
                      {card.subtitle?.trim() && (
                        <span className="block truncate text-[0.6rem] uppercase tracking-[0.14em] text-gold-100/30">
                          {card.subtitle}
                        </span>
                      )}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        hasText ? 'bg-gold-300' : 'bg-gold-400/20'
                      }`}
                      title={hasText ? 'Con significado' : 'Sin significado'}
                    />
                  </motion.button>
                );
              })}
            </AnimatePresence>

            {visible.length === 0 && (
              <p className="py-6 text-center text-xs text-gold-100/30">
                No hay cartas que coincidan con «{search}».
              </p>
            )}
          </div>

          <Button variant="outline" size="sm" fullWidth className="mt-3" onClick={addCard}>
            + Agregar carta
          </Button>
        </div>

        {/* ================= Editor de la carta ================= */}
        <div className="space-y-5">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="panel gilded space-y-5 p-5"
            >
              {/* --- Identidad de la carta --- */}
              <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                <div>
                  <label className="overline mb-2 block" htmlFor="card-name">
                    Nombre de la carta
                  </label>
                  <input
                    id="card-name"
                    type="text"
                    value={selected.name}
                    onChange={(e) => updateCard(selected.id, { name: e.target.value })}
                    placeholder="Ej: La Sanadora, Renacimiento, Lobo…"
                  />
                </div>
                <div>
                  <label className="overline mb-2 block" htmlFor="card-glyph">
                    Símbolo
                  </label>
                  <input
                    id="card-glyph"
                    type="text"
                    maxLength={2}
                    value={selected.glyph ?? ''}
                    onChange={(e) => updateCard(selected.id, { glyph: e.target.value })}
                    placeholder="✧"
                    className="text-center"
                  />
                </div>
              </div>

              <div>
                <label className="overline mb-2 block" htmlFor="card-subtitle">
                  Subtítulo{' '}
                  <span className="normal-case tracking-normal text-gold-100/25">
                    (número, palo, correspondencia…)
                  </span>
                </label>
                <input
                  id="card-subtitle"
                  type="text"
                  value={selected.subtitle ?? ''}
                  onChange={(e) => updateCard(selected.id, { subtitle: e.target.value })}
                  placeholder="Ej: 3 · Agua · Luna"
                  className="!py-2 !text-sm"
                />
              </div>

              <div className="hairline h-px opacity-50" />

              {/* --- Derecho --- */}
              <div className="space-y-3 rounded-2xl border border-gold-400/15 bg-ink-950/40 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gold-300/70">↑</span>
                  <h4 className="font-display text-xs uppercase tracking-[0.2em] text-gold-200">
                    Al derecho
                  </h4>
                </div>
                <div>
                  <label className="overline mb-2 block" htmlFor="card-kw">
                    Palabras clave{' '}
                    <span className="normal-case tracking-normal text-gold-100/25">
                      (separadas por coma)
                    </span>
                  </label>
                  <KeywordsInput
                    id="card-kw"
                    key={`kw-${selected.id}`}
                    value={selected.keywords ?? []}
                    onChange={(list) => updateCard(selected.id, { keywords: list })}
                    placeholder="apertura, confianza, comienzo"
                  />
                </div>
                <div>
                  <label className="overline mb-2 block" htmlFor="card-upright">
                    Significado
                  </label>
                  <textarea
                    id="card-upright"
                    rows={3}
                    value={selected.upright ?? ''}
                    onChange={(e) => updateCard(selected.id, { upright: e.target.value })}
                    placeholder="Qué dice esta carta cuando sale al derecho…"
                    className="resize-y"
                  />
                </div>
              </div>

              {/* --- Invertida --- */}
              <div
                className={`space-y-3 rounded-2xl border p-4 transition-opacity ${
                  allowReversed
                    ? 'border-rose-300/20 bg-rose-500/[0.04]'
                    : 'border-gold-400/10 bg-ink-950/30 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-rose-200/70">↓</span>
                  <h4 className="font-display text-xs uppercase tracking-[0.2em] text-rose-100/80">
                    Invertida
                  </h4>
                  {!allowReversed && (
                    <span className="text-[0.62rem] text-gold-100/35">
                      · este mazo no se lee invertido
                    </span>
                  )}
                </div>
                <div>
                  <label className="overline mb-2 block" htmlFor="card-kw-rev">
                    Palabras clave invertida
                  </label>
                  <KeywordsInput
                    id="card-kw-rev"
                    key={`kwr-${selected.id}`}
                    value={selected.reversedKeywords ?? []}
                    onChange={(list) => updateCard(selected.id, { reversedKeywords: list })}
                    placeholder="miedo a empezar, dispersión"
                  />
                </div>
                <div>
                  <label className="overline mb-2 block" htmlFor="card-reversed">
                    Significado invertida
                  </label>
                  <textarea
                    id="card-reversed"
                    rows={3}
                    value={selected.reversed ?? ''}
                    onChange={(e) => updateCard(selected.id, { reversed: e.target.value })}
                    placeholder="Qué dice cuando sale del revés. Si lo dejas vacío, la lectura usa el sentido derecho leído en falta o en exceso."
                    className="resize-y"
                  />
                </div>
              </div>

              {/* --- Consejo --- */}
              <div>
                <label className="overline mb-2 block" htmlFor="card-advice">
                  Consejo{' '}
                  <span className="normal-case tracking-normal text-gold-100/25">(opcional)</span>
                </label>
                <input
                  id="card-advice"
                  type="text"
                  value={selected.advice ?? ''}
                  onChange={(e) => updateCard(selected.id, { advice: e.target.value })}
                  placeholder="Un gesto concreto que sugiere esta carta"
                  className="!py-2 !text-sm"
                />
              </div>

              {/* --- Metadatos opcionales --- */}
              <details className="group rounded-2xl border border-gold-400/12 bg-ink-950/40 p-4">
                <summary className="cursor-pointer list-none font-display text-[0.68rem] uppercase tracking-[0.18em] text-gold-200/70 transition-colors hover:text-gold-100">
                  Clasificación opcional
                  <span className="ml-2 normal-case tracking-normal text-gold-100/30">
                    mejora la detección de patrones
                  </span>
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="overline mb-2 block" htmlFor="card-element">
                      Elemento
                    </label>
                    <select
                      id="card-element"
                      value={selected.element ?? ''}
                      onChange={(e) =>
                        updateCard(selected.id, {
                          element: (e.target.value || undefined) as Element | undefined,
                        })
                      }
                    >
                      <option value="">— Sin definir —</option>
                      {ELEMENTS.map((el) => (
                        <option key={el} value={el}>
                          {ELEMENT_LABELS[el]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="overline mb-2 block" htmlFor="card-energy">
                      Energía
                    </label>
                    <select
                      id="card-energy"
                      value={selected.energy ?? ''}
                      onChange={(e) =>
                        updateCard(selected.id, {
                          energy: (e.target.value || undefined) as Energy | undefined,
                        })
                      }
                    >
                      <option value="">— Sin definir —</option>
                      {ENERGIES.map((en) => (
                        <option key={en} value={en}>
                          {en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="overline mb-2 block" htmlFor="card-axis">
                      Eje
                    </label>
                    <select
                      id="card-axis"
                      value={selected.axis ?? ''}
                      onChange={(e) =>
                        updateCard(selected.id, {
                          axis: (e.target.value || undefined) as Axis | undefined,
                        })
                      }
                    >
                      <option value="">— Sin definir —</option>
                      {AXES.map((ax) => (
                        <option key={ax} value={ax}>
                          {AXIS_LABELS[ax]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>

              {/* --- Acciones de la carta --- */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => duplicateCard(selected.id)}>
                  ⧉ Duplicar
                </Button>
                <Button size="sm" variant="danger" onClick={() => removeCard(selected.id)}>
                  Eliminar carta
                </Button>
                <span className="ml-auto text-[0.65rem] text-gold-100/30">
                  {named} {named === 1 ? 'carta nombrada' : 'cartas nombradas'}
                </span>
              </div>
            </motion.div>
          ) : (
            <div className="panel gilded px-6 py-14 text-center">
              <span className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full border border-gold-300/30 bg-ink-950/70 text-2xl text-gold-gradient animate-float">
                ✧
              </span>
              <h3 className="text-lg text-gold-100">Tu mazo está vacío</h3>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gold-100/45">
                Agrega la primera carta y escribe qué significa para ti al derecho y al revés.
              </p>
              <div className="mt-7 flex justify-center">
                <Button onClick={addCard}>+ Agregar carta</Button>
              </div>
            </div>
          )}

          {/* --- Guardar --- */}
          <div className="panel space-y-3 p-5">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-100"
              >
                {error}
              </motion.p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button fullWidth onClick={handleSaveAndUse}>
                Guardar y usar
              </Button>
              <Button fullWidth variant="outline" onClick={handleSave}>
                Sólo guardar
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                fullWidth
                variant="ghost"
                size="sm"
                onClick={() => {
                  const { customDecks } = useReadingStore.getState();
                  const saved = customDecks.find((d) => d.id === deck.id);
                  downloadArchive(
                    buildArchive(
                      {
                        customDecks: saved ? [saved] : [buildDeck()],
                        customSpreads: [],
                        history: [],
                        rituals: [],
                      },
                      { spreads: false, readings: false, rituals: false },
                    ),
                  );
                }}
                title="Descarga este mazo como archivo JSON para guardarlo como respaldo"
              >
                ⇩ Exportar este mazo
              </Button>
              <Button fullWidth variant="ghost" size="sm" onClick={cancelDeckEdit}>
                ← Volver sin guardar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
