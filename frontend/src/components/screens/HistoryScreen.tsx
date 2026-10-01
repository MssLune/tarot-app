import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { cardDisplayName } from '@arcana/tarot-core';
import { SYSTEM_SHORT } from '../../lib/systems';
import { useContentStore } from '../../store/useContentStore';
import { useReadingStore } from '../../store/useReadingStore';
import SpreadMini from '../cards/SpreadMini';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Historial: lecturas guardadas y tiradas personalizadas.
   Todo se persiste en localStorage a través del store.
   ========================================================================== */

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type Tab = 'readings' | 'spreads' | 'decks';

export default function HistoryScreen() {
  const history = useReadingStore((s) => s.history);
  const customSpreads = useReadingStore((s) => s.customSpreads);
  const customDecks = useReadingStore((s) => s.customDecks);
  const openReading = useReadingStore((s) => s.openReading);
  const deleteReading = useReadingStore((s) => s.deleteReading);
  const clearHistory = useReadingStore((s) => s.clearHistory);
  const deleteCustomSpread = useReadingStore((s) => s.deleteCustomSpread);
  const editSpread = useReadingStore((s) => s.editSpread);
  const chooseSpread = useReadingStore((s) => s.chooseSpread);
  const startNewSpread = useReadingStore((s) => s.startNewSpread);
  const chooseDeck = useReadingStore((s) => s.chooseDeck);
  const editDeck = useReadingStore((s) => s.editDeck);
  const deleteCustomDeck = useReadingStore((s) => s.deleteCustomDeck);
  const startNewDeck = useReadingStore((s) => s.startNewDeck);
  const system = useReadingStore((s) => s.system);
  const deck = useReadingStore((s) => s.deck);
  const goTo = useReadingStore((s) => s.goTo);
  const restart = useReadingStore((s) => s.restart);
  const cardsById = useContentStore((s) => s.cardsById);

  const [tab, setTab] = useState<Tab>('readings');
  const [confirmClear, setConfirmClear] = useState(false);

  /** Al reutilizar una tirada guardada necesitamos un sistema elegido. */
  const useSpread = (index: number) => {
    const spread = customSpreads[index];
    if (!system) {
      goTo('system');
      return;
    }
    if (system === 'custom-deck' && !deck) {
      goTo('decks');
      return;
    }
    chooseSpread(spread);
  };

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'readings', label: 'Lecturas', count: history.length },
    { id: 'spreads', label: 'Mis tiradas', count: customSpreads.length },
    { id: 'decks', label: 'Mis mazos', count: customDecks.length },
  ];

  return (
    <div className="space-y-8">
      <SectionHeading
        overline="Guardado en este dispositivo"
        title="Tu archivo"
        subtitle="Las lecturas y las tiradas que creaste se guardan en tu navegador. Nada sale de tu dispositivo."
      />

      {/* ---------------- Pestañas ---------------- */}
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full border border-gold-400/20 bg-ink-900/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative rounded-full px-5 py-2.5 font-display text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                tab === t.id ? 'text-ink-900' : 'text-gold-100/50 hover:text-gold-100'
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-gold-sheen shadow-glow"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">
                {t.label} {t.count > 0 && `· ${t.count}`}
              </span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ================= Lecturas ================= */}
        {tab === 'readings' && (
          <motion.section
            key="readings"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            {history.length === 0 ? (
              <EmptyState
                glyph="☾"
                title="Todavía no guardaste lecturas"
                text="Cuando termines una tirada, tocá «Guardar lectura» y va a quedar acá para volver a consultarla."
                action={<Button onClick={restart}>Hacer una lectura</Button>}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <AnimatePresence mode="popLayout">
                    {history.map((reading) => (
                      <motion.article
                        key={reading.id}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="panel gilded group flex gap-4 p-4"
                      >
                        {/* Mini layout */}
                        <button
                          onClick={() => openReading(reading.id)}
                          className="w-24 shrink-0 self-start rounded-xl border border-gold-400/10 bg-ink-950/60 p-2 sm:w-28"
                          title="Abrir lectura"
                        >
                          <SpreadMini positions={reading.spread.positions} />
                        </button>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="text-[0.6rem] uppercase tracking-[0.18em] text-gold-100/30">
                            {DATE_FORMAT.format(new Date(reading.createdAt))}
                          </p>
                          <h3 className="mt-1 truncate font-display text-sm text-gold-100 sm:text-base">
                            {reading.title || reading.spread.name}
                          </h3>
                          <p className="mt-0.5 text-[0.68rem] text-gold-200/50">
                            {SYSTEM_SHORT[reading.system]}
                            {reading.deck ? ` · ${reading.deck.name}` : ''} ·{' '}
                            {reading.cards.length}{' '}
                            {reading.cards.length === 1 ? 'carta' : 'cartas'}
                          </p>

                          {reading.question && (
                            <p className="mt-2 line-clamp-2 text-[0.7rem] italic text-gold-100/40">
                              «{reading.question}»
                            </p>
                          )}

                          {/* Cartas resumidas */}
                          <p className="mt-2 line-clamp-2 text-[0.7rem] text-gold-100/45">
                            {reading.cards
                              .map(
                                (c) =>
                                  `${cardDisplayName(c, reading.system, cardsById, reading.deck)}${
                                    c.reversed ? ' ↓' : ''
                                  }`,
                              )
                              .join(' · ')}
                          </p>

                          <div className="mt-auto flex items-center gap-2 pt-3">
                            <Button size="sm" onClick={() => openReading(reading.id)}>
                              Abrir
                            </Button>
                            <button
                              onClick={() => deleteReading(reading.id)}
                              title="Eliminar lectura"
                              className="rounded-full px-2 py-2 text-xs text-rose-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Vaciar historial */}
                <div className="flex justify-center pt-2">
                  {confirmClear ? (
                    <div className="flex items-center gap-3 rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2">
                      <span className="text-xs text-rose-100">¿Borrar todas las lecturas?</span>
                      <button
                        onClick={() => {
                          clearHistory();
                          setConfirmClear(false);
                        }}
                        className="font-display text-[0.65rem] uppercase tracking-[0.16em] text-rose-100 underline underline-offset-4"
                      >
                        Sí, borrar
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="font-display text-[0.65rem] uppercase tracking-[0.16em] text-gold-100/60"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                      Vaciar historial
                    </Button>
                  )}
                </div>
              </>
            )}
          </motion.section>
        )}

        {/* ================= Tiradas personalizadas ================= */}
        {tab === 'spreads' && (
          <motion.section
            key="spreads"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            {customSpreads.length === 0 ? (
              <EmptyState
                glyph="✛"
                title="No tenés tiradas propias todavía"
                text="Podés diseñar una tirada con tus propias posiciones y el layout que quieras. Queda guardada para reutilizarla siempre."
                action={<Button onClick={startNewSpread}>Crear tirada</Button>}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {customSpreads.map((spread, index) => (
                      <motion.article
                        key={spread.id}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="panel gilded flex flex-col p-4"
                      >
                        <div className="mb-3 rounded-xl border border-gold-400/10 bg-ink-950/60 p-3">
                          <SpreadMini positions={spread.positions} />
                        </div>
                        <h3 className="truncate font-display text-sm text-gold-100">{spread.name}</h3>
                        <p className="mt-1 text-[0.68rem] text-gold-200/50">
                          {spread.positions.length}{' '}
                          {spread.positions.length === 1 ? 'posición' : 'posiciones'}
                          {spread.createdAt
                            ? ` · ${new Date(spread.createdAt).toLocaleDateString('es-AR')}`
                            : ''}
                        </p>
                        <p className="mt-2 line-clamp-2 flex-1 text-[0.7rem] text-gold-100/40">
                          {spread.description}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                          <Button size="sm" onClick={() => useSpread(index)} className="flex-1">
                            Usar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => editSpread(spread)}>
                            Editar
                          </Button>
                          <button
                            onClick={() => deleteCustomSpread(spread.id)}
                            title="Eliminar tirada"
                            className="rounded-full px-2 py-2 text-xs text-rose-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                          >
                            ✕
                          </button>
                        </div>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={startNewSpread}>
                    ✛ Crear otra tirada
                  </Button>
                </div>
              </>
            )}
          </motion.section>
        )}

        {/* ================= Mazos personalizados ================= */}
        {tab === 'decks' && (
          <motion.section
            key="decks"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            {customDecks.length === 0 ? (
              <EmptyState
                glyph="✧"
                title="Todavía no creaste un mazo"
                text="Podés cargar tus propias cartas con su significado al derecho y al revés, y usarlas en cualquier tirada. Sirve tanto para un tarot propio como para un oráculo."
                action={<Button onClick={() => startNewDeck()}>Crear mazo</Button>}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {customDecks.map((deck) => {
                      const written = deck.cards.filter(
                        (c) => c.upright?.trim() || c.reversed?.trim(),
                      ).length;
                      return (
                        <motion.article
                          key={deck.id}
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          className="panel gilded flex flex-col p-4"
                        >
                          <div className="mb-3 flex flex-wrap gap-1.5 rounded-xl border border-gold-400/10 bg-ink-950/60 p-3">
                            {deck.cards.slice(0, 8).map((c) => (
                              <span
                                key={c.id}
                                title={c.name}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-400/15 text-[0.7rem] text-gold-300/60"
                              >
                                {c.glyph?.trim() || '✧'}
                              </span>
                            ))}
                            {deck.cards.length > 8 && (
                              <span className="flex h-7 items-center px-1.5 text-[0.6rem] text-gold-100/35">
                                +{deck.cards.length - 8}
                              </span>
                            )}
                            {deck.cards.length === 0 && (
                              <span className="text-[0.68rem] text-gold-100/30">Sin cartas</span>
                            )}
                          </div>
                          <h3 className="truncate font-display text-sm text-gold-100">
                            {deck.name}
                          </h3>
                          <p className="mt-1 text-[0.68rem] text-gold-200/50">
                            {deck.cards.length}{' '}
                            {deck.cards.length === 1 ? 'carta' : 'cartas'} · {written} con
                            significado
                          </p>
                          {deck.description?.trim() && (
                            <p className="mt-2 line-clamp-2 flex-1 text-[0.7rem] text-gold-100/40">
                              {deck.description}
                            </p>
                          )}
                          <div className="mt-4 flex items-center gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={deck.cards.length === 0}
                              onClick={() => chooseDeck(deck)}
                            >
                              Usar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => editDeck(deck)}>
                              Editar
                            </Button>
                            <button
                              onClick={() => deleteCustomDeck(deck.id)}
                              title="Eliminar mazo"
                              className="rounded-full px-2 py-2 text-xs text-rose-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                            >
                              ✕
                            </button>
                          </div>
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </div>

                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => startNewDeck()}>
                    ✧ Crear otro mazo
                  </Button>
                </div>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState({
  glyph,
  title,
  text,
  action,
}: {
  glyph: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="panel gilded mx-auto max-w-lg px-6 py-12 text-center"
    >
      <span className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full border border-gold-300/30 bg-ink-950/70 text-2xl text-gold-gradient animate-float">
        {glyph}
      </span>
      <h3 className="text-lg text-gold-100">{title}</h3>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gold-100/45">{text}</p>
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </motion.div>
  );
}
