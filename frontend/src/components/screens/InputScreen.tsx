import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../../lib/labels';
import { cardDisplayName, cardGlyph } from '../../lib/interpretation';
import { useContentStore } from '../../store/useContentStore';
import { useReadingStore } from '../../store/useReadingStore';
import type { QuestionCategory } from '../../types';
import CardFicha from '../cards/CardFicha';
import CardPicker, { type PickerFacet, type PickerGroup } from '../cards/CardPicker';
import SpreadLayout, { type LayoutEntry } from '../cards/SpreadLayout';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';
import Toggle from '../ui/Toggle';
import type { ArcanaCard } from '../../types';

const CATEGORIES: QuestionCategory[] = ['general', 'amor', 'trabajo', 'dinero', 'salud'];

/* ==========================================================================
   Pantalla 3 — Carga de cartas.
   Formulario dinámico: una ficha por posición de la tirada, con vista previa
   en vivo del layout a la derecha.
   ========================================================================== */

export default function InputScreen() {
  const system = useReadingStore((s) => s.system);
  const spread = useReadingStore((s) => s.spread);
  const deck = useReadingStore((s) => s.deck);
  const cards = useReadingStore((s) => s.cards);
  const question = useReadingStore((s) => s.question);
  const setQuestion = useReadingStore((s) => s.setQuestion);
  const questionCategory = useReadingStore((s) => s.questionCategory);
  const setQuestionCategory = useReadingStore((s) => s.setQuestionCategory);
  const setCard = useReadingStore((s) => s.setCard);
  const clearCards = useReadingStore((s) => s.clearCards);
  const isComplete = useReadingStore((s) => s.isComplete);
  const editDeck = useReadingStore((s) => s.editDeck);
  const goTo = useReadingStore((s) => s.goTo);
  const allCards = useContentStore((s) => s.cards);
  const cardsById = useContentStore((s) => s.cardsById);
  const [ficha, setFicha] = useState<{ id: string; reversed: boolean } | null>(null);

  /**
   * Ejes de filtro del tarot. Se viven acá y no en el CardPicker porque el
   * componente también se usa para el mazo propio, que no tiene estas
   * categorías.
   *
   * La idea es que la búsqueda por texto sirve si te acordás del nombre
   * ("La Emperatriz"), y estos filtros sirven cuando no te acordás: "era una
   * carta de arcanos mayores", "era una sota de bastos".
   */
  const TAROT_FACETS: PickerFacet[] = [
    {
      key: 'arcanaType',
      label: 'Tipo',
      options: [
        { value: 'mayor', label: 'Arcanos Mayores' },
        { value: 'menor', label: 'Arcanos Menores' },
      ],
    },
    {
      key: 'suit',
      label: 'Palo',
      options: [
        { value: 'bastos', label: 'Bastos' },
        { value: 'copas', label: 'Copas' },
        { value: 'espadas', label: 'Espadas' },
        { value: 'oros', label: 'Oros' },
      ],
    },
  ];

  /** Las 78 cartas agrupadas por palo para el buscador (Rider-Waite). */
  const arcanaGroups = useMemo<PickerGroup[]>(() => {
    const groupOf = (suit?: string) =>
      suit === 'copas'
        ? 'Copas'
        : suit === 'espadas'
          ? 'Espadas'
          : suit === 'bastos'
            ? 'Bastos'
            : suit === 'oros'
              ? 'Oros'
              : 'Arcanos Mayores';
    const order = ['Arcanos Mayores', 'Copas', 'Espadas', 'Bastos', 'Oros'];
    const map = new Map<string, ArcanaCard[]>();
    allCards.forEach((c) => {
      const label = groupOf(c.suit);
      map.set(label, [...(map.get(label) ?? []), c]);
    });
    return order
      .map((label) => ({ label, cards: map.get(label) }))
      .filter((g): g is { label: string; cards: ArcanaCard[] } => Boolean(g.cards))
      .map((group) => ({
        label: group.label,
        items: group.cards.map((c) => ({
          id: c.id,
          label: c.name,
          hint: `${c.rank ?? c.number} · ${c.correspondence}`,
          glyph: c.glyph,
          // El buscador también matchea por significado y palabras clave:
          // permite encontrar "la carta que habla de Lupertad" y no sólo el nombre.
          keywords: [...c.keywords, ...c.reversedKeywords, c.upright, c.reversed, c.advice],
          // Valores para los filtros por categoría. `suit` queda en undefined
          // en los arcanos mayores, y eso es lo que hace que el filtro de palo
          // se ignore y se oculte al elegir "Arcanos Mayores".
          facets: { arcanaType: c.arcanaType, suit: c.suit },
        })),
      }));
  }, [allCards]);

  const isTarot = system === 'rider-waite';
  const isDeck = system === 'custom-deck';

  /* Las 78 cartas, con las ya usadas en OTRA posición marcadas como no
     elegibles. Se calcula por posición porque `usedArcana` cambia al elegir. */
  const arcanasParaPosicion = (positionId: string): PickerGroup[] =>
    arcanaGroups.map((group) => ({
      label: group.label,
      items: group.items.map((item) => {
        const usedBy = usedArcana.get(item.id);
        const usedElsewhere = Boolean(usedBy && usedBy !== positionId);
        return { ...item, disabled: usedElsewhere, disabledHint: 'Usada' };
      }),
    }));

  /* Las cartas del mazo propio, con el mismo criterio de "ya usada". */
  const deckCardsParaPosicion = (positionId: string): PickerGroup[] => [
    {
      label: deck?.name ?? 'Tu mazo',
      items: (deck?.cards ?? []).map((c) => {
        const usedBy = usedDeckCards.get(c.id);
        const usedElsewhere = Boolean(usedBy && usedBy !== positionId);
        return {
          id: c.id,
          label: c.name,
          hint: c.subtitle?.trim() || undefined,
          glyph: c.glyph?.trim() || undefined,
          // Permite buscar por el significado que el usuario ya escribió.
          keywords: [...(c.keywords ?? []), ...(c.reversedKeywords ?? [])],
          meaning: `${c.upright ?? ''} ${c.reversed ?? ''} ${c.advice ?? ''}`,
          disabled: usedElsewhere,
          disabledHint: 'Usada',
        };
      }),
    },
  ];
  /** Mazos de oráculo que no se leen invertidos: se oculta el toggle. */
  const allowReversed = !isDeck || (deck?.allowReversed ?? true);

  /** Arcanos ya usados en otras posiciones (un mazo físico no repite cartas). */
  const usedArcana = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(cards).forEach((c) => {
      if (c.arcanaId) map.set(c.arcanaId, c.positionId);
    });
    return map;
  }, [cards]);

  /** Ídem para las cartas del mazo propio. */
  const usedDeckCards = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(cards).forEach((c) => {
      if (c.deckCardId) map.set(c.deckCardId, c.positionId);
    });
    return map;
  }, [cards]);

  if (!spread || !system) return null;

  /** true si la posición ya tiene una carta válida para el sistema actual. */
  const isFilled = (card?: { arcanaId?: string; deckCardId?: string; customName?: string }) => {
    if (!card) return false;
    if (isTarot) return Boolean(card.arcanaId);
    if (isDeck) return Boolean(card.deckCardId);
    return Boolean(card.customName?.trim());
  };

  const filled = spread.positions.filter((pos) => isFilled(cards[pos.id])).length;

  const complete = isComplete();

  /* Vista previa del layout con lo que ya se cargó. */
  const entries: LayoutEntry[] = spread.positions.map((pos, i) => {
    const card = cards[pos.id] ?? { positionId: pos.id, reversed: false };
    const hasCard = isFilled(card);
    return {
      position: pos,
      name: hasCard ? cardDisplayName(card, system, cardsById, deck) : '',
      glyph: hasCard ? cardGlyph(card, system, i, cardsById, deck) : '',
      reversed: card.reversed,
      empty: !hasCard,
    };
  });

  const subtitle = isTarot
    ? 'Elegí el arcano de cada posición y marcá si salió invertida. Podés agregar una nota propia si querés.'
    : isDeck
      ? `Elegí en cada posición qué carta de «${deck?.name ?? 'tu mazo'}» salió. La interpretación va a usar los significados que escribiste.`
      : 'Escribí el nombre de cada carta de tu mazo y, si tenés su significado a mano, sumalo: la interpretación lo va a usar.';

  return (
    <div className="space-y-9">
      <SectionHeading
        overline={`Paso ${isDeck ? '4 de 5' : '3 de 4'} · ${spread.name}`}
        title="Cargá las cartas que salieron"
        subtitle={subtitle}
      />

      {/* ---------------- Pregunta ---------------- */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel gilded mx-auto max-w-2xl p-5"
      >
        <label className="overline mb-3 block" htmlFor="question">
          Tu pregunta <span className="normal-case tracking-normal text-gold-100/30">(opcional)</span>
        </label>
        <input
          id="question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="¿Qué necesito ver sobre…?"
        />
        <p className="mt-2 text-[0.68rem] text-gold-100/30">
          Si la escribís, la conclusión final va a responder directamente sobre eso.
        </p>

        {/* --- Categoría: enfoca la lectura de cada carta a un tema puntual --- */}
        {isTarot && (
          <div className="mt-4 border-t border-gold-400/10 pt-4">
            <label className="overline mb-2.5 block">
              Tema{' '}
              <span className="normal-case tracking-normal text-gold-100/25">(opcional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setQuestionCategory(cat)}
                  className={`rounded-full border px-3.5 py-1.5 text-[0.68rem] uppercase tracking-[0.12em] transition-colors ${
                    questionCategory === cat
                      ? 'border-gold-300/70 bg-gold-400/15 text-gold-100'
                      : 'border-gold-400/20 text-gold-100/50 hover:border-gold-400/40 hover:text-gold-100/80'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[0.68rem] text-gold-100/30">
              Enfoca la lectura de cada carta a ese tema puntual.
            </p>
          </div>
        )}
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------- Formulario por posición ---------------- */}
        <div className="space-y-4">
          {spread.positions.map((pos, index) => {
            const card = cards[pos.id] ?? { positionId: pos.id, reversed: false };
            const hasCard = isFilled(card);
            /* Definición de la carta elegida en el mazo propio: se usa para
               mostrar en vivo el significado que ya escribió el usuario. */
            const chosen = isDeck ? deck?.cards.find((c) => c.id === card.deckCardId) : undefined;
            const chosenText = chosen
              ? card.reversed
                ? chosen.reversed?.trim() || chosen.upright?.trim()
                : chosen.upright?.trim()
              : undefined;
            const chosenKeywords =
              (card.reversed ? chosen?.reversedKeywords : chosen?.keywords) ?? [];

            return (
              <motion.div
                key={pos.id}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={`panel relative overflow-hidden p-5 transition-colors duration-500 ${
                  hasCard ? 'border-gold-400/30' : ''
                }`}
              >
                {/* Barra lateral de estado */}
                <span
                  className={`absolute inset-y-0 left-0 w-[3px] transition-colors duration-500 ${
                    hasCard ? 'bg-gold-sheen' : 'bg-gold-400/10'
                  }`}
                />

                <div className="mb-4 flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-500 ${
                      hasCard
                        ? 'border-gold-300/60 bg-gold-sheen text-ink-900 shadow-glow'
                        : 'border-gold-400/25 text-gold-200/60'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm uppercase tracking-[0.14em] text-gold-100">
                      {pos.name}
                    </h3>
                    {pos.prompt && (
                      <p className="mt-1 text-xs italic text-gold-100/40">{pos.prompt}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* --- Selección / nombre de carta --- */}
                  {isTarot ? (
                    <div>
                      <label className="overline mb-2 block" htmlFor={`arcana-${pos.id}`}>
                        Carta
                      </label>
                      <CardPicker
                        id={`arcana-${pos.id}`}
                        groups={arcanasParaPosicion(pos.id)}
                        facets={TAROT_FACETS}
                        selectedId={card.arcanaId}
                        placeholder="Buscar por nombre, significado o palabra clave…"
                        emptyText="Ninguna carta coincide con esa búsqueda."
                        onSelect={(arcanaId) => setCard(pos.id, { arcanaId })}
                      />
                      {card.arcanaId && (
                        <button
                          type="button"
                          onClick={() =>
                            setFicha(card.arcanaId ? { id: card.arcanaId, reversed: card.reversed } : null)
                          }
                          className="mt-2 font-display text-[0.62rem] uppercase tracking-[0.16em] text-gold-200/60 underline decoration-gold-400/30 underline-offset-4 transition-colors hover:text-gold-100"
                        >
                          ✧ Ver ficha completa
                        </button>
                      )}
                    </div>
                  ) : isDeck ? (
                    <div>
                      <label className="overline mb-2 block" htmlFor={`deckcard-${pos.id}`}>
                        Carta de {deck?.name ?? 'tu mazo'}
                      </label>
                      <CardPicker
                        id={`deckcard-${pos.id}`}
                        groups={deckCardsParaPosicion(pos.id)}
                        selectedId={card.deckCardId}
                        placeholder={`Buscar en «${deck?.name ?? 'tu mazo'}»…`}
                        emptyText={`Ninguna carta de ${deck?.name ?? 'tu mazo'} coincide.`}
                        onSelect={(deckCardId) => setCard(pos.id, { deckCardId })}
                      />

                      {/* Significado ya escrito para esta carta y orientación */}
                      {chosen && (
                        <div className="mt-2.5 rounded-xl border border-gold-400/15 bg-ink-950/50 px-3.5 py-2.5">
                          {chosenKeywords.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap gap-1.5">
                              {chosenKeywords.slice(0, 4).map((kw) => (
                                <span
                                  key={kw}
                                  className="rounded-full border border-gold-400/20 bg-gold-400/[0.06] px-2 py-0.5 text-[0.6rem] text-gold-200/75"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="line-clamp-3 text-[0.7rem] leading-relaxed text-gold-100/45">
                            {chosenText ||
                              'Esta carta todavía no tiene significado escrito. Podés completarlo desde «Mazo» y volver.'}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="overline mb-2 block" htmlFor={`name-${pos.id}`}>
                        Nombre de la carta
                      </label>
                      <input
                        id={`name-${pos.id}`}
                        type="text"
                        value={card.customName ?? ''}
                        onChange={(e) => setCard(pos.id, { customName: e.target.value })}
                        placeholder="Ej: La Sanadora, Renacimiento, Lobo…"
                      />
                    </div>
                  )}

                  {/* --- Invertida --- */}
                  {allowReversed && (
                    <Toggle
                      checked={card.reversed}
                      onChange={(v) => setCard(pos.id, { reversed: v })}
                      label="Carta invertida"
                      hint={
                        card.reversed
                          ? 'Se lee el mensaje en falta, en exceso o hacia adentro'
                          : 'Activá si salió al revés'
                      }
                    />
                  )}

                  {/* --- Significado / nota propia --- */}
                  <div>
                    <label className="overline mb-2 block" htmlFor={`meaning-${pos.id}`}>
                      {isTarot || isDeck ? 'Nota personal' : 'Significado propio'}{' '}
                      <span className="normal-case tracking-normal text-gold-100/25">(opcional)</span>
                    </label>
                    <textarea
                      id={`meaning-${pos.id}`}
                      rows={2}
                      value={card.customMeaning ?? ''}
                      onChange={(e) => setCard(pos.id, { customMeaning: e.target.value })}
                      placeholder={
                        isTarot || isDeck
                          ? 'Algo que te llamó la atención de esta carta…'
                          : 'Palabra clave o significado según tu mazo…'
                      }
                      className="resize-y"
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ---------------- Vista previa ---------------- */}
        <div className="lg:sticky lg:top-36 lg:self-start">
          <div className="panel gilded p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-display text-xs uppercase tracking-[0.22em] text-gold-200/80">
                Vista previa
              </h3>
              <span className="text-[0.65rem] tracking-wider text-gold-100/40">
                {filled}/{spread.positions.length}
              </span>
            </div>

            {/* En la barra lateral el espacio es acotado: el lienzo se ajusta al
                ancho disponible y, si hay muchas posiciones, se muestran sólo
                los números (que coinciden con las fichas del formulario) para
                que los rótulos no se solapen. */}
            <SpreadLayout
              entries={entries}
              revealed
              fit
              showNumbers
              showLabels={spread.positions.length <= 4}
            />

            {/* Progreso */}
            <div className="mt-5">
              <div className="h-1 overflow-hidden rounded-full bg-gold-400/10">
                <motion.div
                  className="h-full rounded-full bg-gold-sheen"
                  initial={false}
                  animate={{ width: `${(filled / spread.positions.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <p className="mt-3 text-center text-[0.68rem] text-gold-100/40">
                {complete
                  ? 'Todas las posiciones están cargadas ✦'
                  : `Faltan ${spread.positions.length - filled} ${
                      spread.positions.length - filled === 1 ? 'carta' : 'cartas'
                    }`}
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <Button fullWidth disabled={!complete} onClick={() => goTo('result')}>
                Revelar la lectura
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" fullWidth onClick={() => goTo('spread')}>
                  ← Cambiar tirada
                </Button>
                <Button variant="ghost" size="sm" fullWidth onClick={clearCards}>
                  Limpiar
                </Button>
              </div>
              {/* Atajo para completar significados sin perder lo ya cargado. */}
              {isDeck && deck && (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => editDeck(deck)}
                  title="Editar las cartas de tu mazo"
                >
                  ✧ Editar «{deck.name}»
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <CardFicha
        card={ficha ? (cardsById[ficha.id] ?? null) : null}
        reversed={ficha?.reversed}
        onClose={() => setFicha(null)}
      />
    </div>
  );
}
