import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { ELEMENT_LABELS, YES_NO_LABELS } from '@arcana/tarot-core';
import { interpret, cardImageUrl, deckCardOf } from '@arcana/tarot-core';
import { SYSTEM_LABELS } from '../../lib/systems';
import { usePlan } from '../../lib/usePlan';
import { urlDeArchivo } from '../../services/api';
import { useContentStore } from '../../store/useContentStore';
import { useReadingStore } from '../../store/useReadingStore';
import type { Pattern } from '../../types';
import CardFicha from '../cards/CardFicha';
import SpreadLayout, { type LayoutEntry } from '../cards/SpreadLayout';
import Button from '../ui/Button';
import Glyph from '../ui/Glyph';
import OrnateDivider from '../ui/OrnateDivider';

/* ==========================================================================
   Pantalla 4 — Resultado de la lectura.
   Muestra el layout real con las cartas revelándose, la interpretación por
   posición, los patrones detectados y la conclusión integradora.
   ========================================================================== */

const TONES: Record<Pattern['tone'], string> = {
  gold: 'border-gold-400/35 bg-gold-400/[0.07] text-gold-100',
  violet: 'border-mystic-400/35 bg-mystic-500/[0.09] text-gold-100',
  amber: 'border-copper-400/35 bg-copper-400/[0.08] text-gold-100',
  rose: 'border-rose-400/35 bg-rose-500/[0.08] text-gold-100',
};

const TONE_DOTS: Record<Pattern['tone'], string> = {
  gold: 'bg-gold-300',
  violet: 'bg-mystic-400',
  amber: 'bg-copper-400',
  rose: 'bg-rose-400',
};

const FECHA_AVISO = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

const YES_NO_BADGE: Record<string, string> = {
  si: 'border-gold-400/40 bg-gold-400/[0.1] text-gold-100',
  no: 'border-rose-400/40 bg-rose-500/[0.1] text-rose-100',
  incierto: 'border-mystic-400/40 bg-mystic-500/[0.12] text-gold-100',
};

export default function ResultScreen() {
  const system = useReadingStore((s) => s.system);
  const spread = useReadingStore((s) => s.spread);
  const deck = useReadingStore((s) => s.deck);
  const cards = useReadingStore((s) => s.cards);
  const question = useReadingStore((s) => s.question);
  const questionCategory = useReadingStore((s) => s.questionCategory);
  const saveReading = useReadingStore((s) => s.saveReading);
  const viewingReadingId = useReadingStore((s) => s.viewingReadingId);
  const goTo = useReadingStore((s) => s.goTo);
  const restart = useReadingStore((s) => s.restart);
  const cardsById = useContentStore((s) => s.cardsById);
  const combinations = useContentStore((s) => s.combinations);

  /** Patrón abierto en el celular (en escritorio se ven todos). */
  const [patronAbierto, setPatronAbierto] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  /* Arranca en "guardada" si se acaba de guardar al iniciar sesión (el
     invitado tocó Guardar, inició sesión y volvió aquí). */
  const [saved, setSaved] = useState(() => useReadingStore.getState().lecturaRecienGuardada);
  const [copied, setCopied] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const plan = usePlan();
  const abrirAvisoPro = useReadingStore((s) => s.abrirAvisoPro);
  const [ficha, setFicha] = useState<{ id: string; reversed: boolean } | null>(null);

  /* La interpretación se recalcula sólo si cambian las cartas o la tirada. */
  const interpretation = useMemo(
    () =>
      spread && system
        ? interpret(spread, cards, system, cardsById, combinations, questionCategory, question, deck)
        : null,
    [spread, cards, system, cardsById, combinations, questionCategory, question, deck],
  );

  if (!spread || !system || !interpretation) return null;

  const { positions, patterns, conclusion, stats } = interpretation;

  /* La imagen se busca por el id de la carta, no por el nombre: el nombre
     depende del sistema y del mazo, y dos cartas distintas pueden llamarse
     igual. El motor no la trae porque trabaja con ids, no con dibujos. */
  const entries: LayoutEntry[] = positions.map((p) => ({
    position: p.position,
    name: p.cardName,
    glyph: p.glyph,
    subtitle: undefined,
    /* La URL viene del backend como ruta relativa y hay que volverla
       absoluta: si no, el navegador la pide al servidor de Vite y da 404. */
    imageUrl: urlDeArchivo(cardImageUrl(p.card, system, cardsById, deck)),
    reversed: p.card.reversed,
  }));

  /** Arma la lectura en texto plano para copiar/compartir. */
  const buildPlainText = (): string => {
    const lines: string[] = [
      `ARCANA · ${spread.name}`,
      `Sistema: ${SYSTEM_LABELS[system]}${deck ? ` · ${deck.name}` : ''}`,
      question.trim() ? `Pregunta: ${question.trim()}` : '',
      '',
      '— CARTAS —',
    ];
    positions.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.position.name}: ${p.cardName}${p.card.reversed ? ' (invertida)' : ''}`,
        `   ${p.text}`,
        '',
      );
    });
    if (patterns.length) {
      lines.push('— PATRONES —');
      patterns.forEach((p) => lines.push(`• ${p.label}: ${p.detail}`));
      lines.push('');
    }
    lines.push('— CONCLUSIÓN —', ...conclusion);
    return lines.filter((l) => l !== '').join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Si el navegador bloquea el portapapeles, no interrumpimos la experiencia.
      setCopied(false);
    }
  };

  const handleSave = async () => {
    /* Si ya se sabe que está en el tope, ni se intenta: se explica y se
       ofrece el Pro. El servidor igual es el que decide (ver abajo). */
    if (isAuthenticated && plan.cargado && !plan.isPro && !plan.isAdmin && plan.atLimit('readings')) {
      const max = plan.limits?.readings ?? 2;
      abrirAvisoPro(
        plan.proximaLectura
          ? `Ya guardaste tus ${max} lecturas de esta semana. Puedes guardar otra el ${FECHA_AVISO.format(plan.proximaLectura)}.`
          : `Ya guardaste tus ${max} lecturas de esta semana.`,
        'readings',
      );
      return;
    }
    /* Sin cuenta, `saveReading` no guarda: aparta la lectura y abre el inicio
       de sesión. Y "guardada" se muestra sólo si el servidor la aceptó (o si
       quedó en cola por falta de conexión): con el tope, la lectura no entra
       al historial y se abre el aviso del Pro. */
    setGuardando(true);
    const resultado = await saveReading(title);
    setGuardando(false);
    if (resultado === 'guardada' || resultado === 'pendiente') setSaved(true);
  };

  return (
    <div className="space-y-12">
      {/* ---------------- Encabezado ---------------- */}
      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="overline mb-3">
          {SYSTEM_LABELS[system]}
          {deck ? ` · ${deck.name}` : ''} · {stats.total}{' '}
          {stats.total === 1 ? 'carta' : 'cartas'}
        </p>
        <h1 className="text-gold-gradient text-3xl leading-tight sm:text-5xl">{spread.name}</h1>
        {question.trim() && (
          <p className="mx-auto mt-4 max-w-xl font-display text-sm italic text-gold-100/60 sm:text-base">
            «{question.trim()}»
          </p>
        )}
        <OrnateDivider className="mt-7" symbol="☉" />
      </motion.header>

      {/* ---------------- Layout con la revelación ---------------- */}
      <section className="panel gilded p-5 sm:p-8">
        <SpreadLayout
          entries={entries}
          revealed
          showLabels
          showNumbers
          highlightIndex={focused}
          onCardClick={(i) => {
            setFocused(focused === i ? null : i);
            const drawnCard = positions[i]?.card;
            if (system === 'rider-waite' && drawnCard?.arcanaId) {
              setFicha({ id: drawnCard.arcanaId, reversed: drawnCard.reversed });
            }
          }}
        />
        <p className="mt-6 text-center text-[0.68rem] uppercase tracking-[0.2em] text-gold-100/25">
          {system === 'rider-waite' ? 'Toca una carta para ver su ficha completa' : 'Toca una carta para enfocarla'}
        </p>
      </section>

      {/* ---------------- Métricas rápidas ---------------- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Cartas', value: String(stats.total), glyph: '✦' },
          {
            label: 'Invertidas',
            value: `${stats.reversed}/${stats.total}`,
            glyph: '↓',
          },
          {
            label: 'Elemento',
            value: stats.dominantElement ? ELEMENT_LABELS[stats.dominantElement.element] : '—',
            glyph: '☍',
          },
          {
            label: 'Tono',
            value: stats.dominantEnergy ? stats.dominantEnergy.energy : '—',
            glyph: '☯',
          },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.08 }}
            className="panel px-4 py-4 text-center"
          >
            <span className="mb-1 block text-sm text-gold-300/60">{item.glyph}</span>
            <span className="block font-display text-base capitalize text-gold-100 sm:text-lg">
              {item.value}
            </span>
            <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.2em] text-gold-100/35">
              {item.label}
            </span>
          </motion.div>
        ))}
      </section>

      {/* ---------------- Patrones detectados ---------------- */}
      {patterns.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <h2 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
              Patrones del conjunto
            </h2>
            <span className="hairline h-px flex-1 opacity-60" />
          </div>

          {/* Escritorio: dos columnas, y si la cantidad es impar el último
              ocupa todo el ancho (uno solo va entero; con tres, dos arriba y
              uno abajo a lo ancho). Celular: una columna y cada patrón
              cerrado, con sólo el título; se abre al tocarlo, para que la
              lectura no se haga eterna. En escritorio siempre están abiertos. */}
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {patterns.map((pattern, i) => {
              const abierto = patronAbierto === pattern.id;
              const ultimoImpar = i === patterns.length - 1 && patterns.length % 2 === 1;
              return (
                <motion.div
                  key={pattern.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.09, duration: 0.45 }}
                  className={`rounded-2xl border backdrop-blur-sm ${TONES[pattern.tone]} ${
                    ultimoImpar ? 'sm:col-span-2' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPatronAbierto(abierto ? null : pattern.id)}
                    aria-expanded={abierto}
                    aria-controls={`patron-${pattern.id}`}
                    className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300/70 sm:pointer-events-none sm:px-5 sm:pb-2 sm:pt-5"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOTS[pattern.tone]}`} />
                    <h3 className="min-w-0 flex-1 font-display text-xs uppercase tracking-[0.16em]">{pattern.label}</h3>
                    <span
                      aria-hidden="true"
                      className={`shrink-0 text-gold-100/50 transition-transform sm:hidden ${abierto ? 'rotate-180' : ''}`}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  <p
                    id={`patron-${pattern.id}`}
                    className={`${abierto ? 'block' : 'hidden'} px-4 pb-4 text-xs leading-relaxed text-gold-100/60 sm:block sm:px-5 sm:pb-5`}
                  >
                    {pattern.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------------- Interpretación por posición ---------------- */}
      <section className="space-y-5">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
            Carta por carta
          </h2>
          <span className="hairline h-px flex-1 opacity-60" />
        </div>

        <div className="space-y-4">
          {positions.map((reading, index) => {
            const arcana = reading.card.arcanaId ? cardsById[reading.card.arcanaId] : undefined;
            const firstKeyword = reading.keywords[0];
            /* Sí/No: el del Rider-Waite, o el que el usuario escribió en su mazo. */
            const respuesta =
              system === 'rider-waite'
                ? arcana?.yesNo
                : system === 'custom-deck'
                  ? deckCardOf(reading.card, deck)?.yesNo
                  : undefined;
            const porQue =
              system === 'rider-waite'
                ? arcana?.yesNoReason
                : system === 'custom-deck'
                  ? deckCardOf(reading.card, deck)?.yesNoReason?.trim()
                  : undefined;
            return (
            <motion.article
              key={reading.position.id}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setFocused(index)}
              onMouseLeave={() => setFocused(null)}
              className={`panel group relative overflow-hidden p-5 transition-colors duration-300 sm:p-6 ${
                focused === index ? 'border-gold-400/40' : ''
              }`}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {/* Sello con el símbolo de la carta */}
                <div className="flex items-center gap-4 sm:flex-col sm:gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      system === 'rider-waite' &&
                      reading.card.arcanaId &&
                      setFicha({ id: reading.card.arcanaId, reversed: reading.card.reversed })
                    }
                    title={system === 'rider-waite' ? 'Ver ficha completa' : undefined}
                    className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold-300/30 bg-ink-950/70 shadow-inset transition-transform duration-300 ${
                      system === 'rider-waite' ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                    }`}
                  >
                    <span className="absolute inset-0 rounded-2xl bg-gold-400/10 blur-md" />
                    <span
                      className="relative text-3xl text-gold-gradient"
                      style={{ transform: reading.card.reversed ? 'rotate(180deg)' : undefined }}
                    >
                      <Glyph>{reading.glyph}</Glyph>
                    </span>
                  </button>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold-400/30 text-[0.65rem] text-gold-200/80">
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  {/* Posición + carta */}
                  <div className="mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="overline">{reading.position.name}</p>
                      {respuesta && YES_NO_BADGE[respuesta] && (
                        <span
                          title={porQue || undefined}
                          className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] ${YES_NO_BADGE[respuesta]}`}
                        >
                          {YES_NO_LABELS[respuesta]}
                          {firstKeyword ? ` · ${firstKeyword}` : ''}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 flex flex-wrap items-center gap-2 text-lg text-gold-100 sm:text-xl">
                      {reading.cardName}
                      {reading.card.reversed && (
                        <span className="rounded-full border border-rose-300/40 bg-rose-500/15 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-rose-100">
                          invertida
                        </span>
                      )}
                    </h3>
                    {reading.subtitle && (
                      <p className="mt-1 text-[0.68rem] uppercase tracking-[0.18em] text-gold-100/30">
                        {reading.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Palabras clave */}
                  {reading.keywords.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {reading.keywords.slice(0, 4).map((kw) => (
                        <span
                          key={kw}
                          className="rounded-full border border-gold-400/20 bg-gold-400/[0.06] px-2.5 py-1 text-[0.65rem] text-gold-200/75"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Texto interpretativo */}
                  <p className="text-sm leading-relaxed text-gold-100/70">{reading.text}</p>

                  {/* Consejo */}
                  {reading.advice && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-gold-400/15 bg-ink-950/50 px-4 py-3">
                      <span className="mt-0.5 text-xs text-gold-300/70">✧</span>
                      <p className="text-xs leading-relaxed text-gold-100/55">
                        <span className="font-display uppercase tracking-[0.16em] text-gold-200/70">
                          Consejo ·{' '}
                        </span>
                        {reading.advice}
                      </p>
                    </div>
                  )}

                  {/* Ficha de referencia (Sí/No, Pasado-Presente-Futuro, astrología) */}
                  {system === 'rider-waite' && reading.card.arcanaId && (
                    <button
                      type="button"
                      onClick={() =>
                        reading.card.arcanaId &&
                        setFicha({ id: reading.card.arcanaId, reversed: reading.card.reversed })
                      }
                      className="mt-3 font-display text-[0.62rem] uppercase tracking-[0.16em] text-gold-200/60 underline decoration-gold-400/30 underline-offset-4 transition-colors hover:text-gold-100"
                    >
                      ✧ Ver ficha completa
                    </button>
                  )}
                </div>
              </div>
            </motion.article>
            );
          })}
        </div>
      </section>

      {/* ---------------- Conclusión ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="panel gilded relative overflow-hidden p-6 sm:p-10"
      >
        {/* Halos decorativos */}
        <span className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-mystic-600/20 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-gold-600/15 blur-3xl" />

        <div className="relative">
          <div className="mb-6 text-center">
            <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold-300/40 bg-ink-950/60 text-xl text-gold-gradient">
              ☾
            </span>
            <h2 className="text-gold-gradient text-2xl sm:text-3xl">Conclusión integradora</h2>
          </div>

          <div className="mx-auto max-w-3xl space-y-4">
            {conclusion.map((paragraph, i) => (
              <p
                key={i}
                className={`leading-relaxed text-gold-100/75 ${
                  i === 0 ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                }`}
              >
                {paragraph}
              </p>
            ))}
          </div>

          <OrnateDivider className="mt-8" symbol="✦" />
        </div>
      </motion.section>

      {/* ---------------- Acciones ---------------- */}
      <section className="panel p-5 sm:p-6">
        {viewingReadingId ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-xs text-gold-100/45">
              Estás viendo una lectura guardada en tu historial.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => goTo('history')}>
                ← Historial
              </Button>
              <Button variant="ghost" onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar texto'}
              </Button>
              <Button onClick={restart}>Nueva tirada</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <AnimatePresence mode="wait">
              {saved ? (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-2"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-300/50 bg-gold-400/15 text-lg text-gold-200">
                    ✓
                  </span>
                  <p className="text-center text-sm text-gold-100/65">
                    Lectura guardada en tu historial.
                  </p>
                  <button
                    onClick={() => goTo('history')}
                    className="font-display text-[0.68rem] uppercase tracking-[0.2em] text-gold-200/80 underline decoration-gold-400/40 underline-offset-4 transition-colors hover:text-gold-100"
                  >
                    Ver historial
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="save-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título para guardar esta lectura (opcional)"
                    className="flex-1"
                  />
                  <Button onClick={() => void handleSave()} disabled={guardando} className="shrink-0">
                    {guardando ? 'Guardando…' : 'Guardar lectura'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="hairline h-px opacity-40" />

            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => goTo('input')}>
                ← Editar cartas
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar texto'}
              </Button>
              <Button variant="outline" size="sm" onClick={restart}>
                Nueva tirada
              </Button>
            </div>
          </div>
        )}
      </section>

      <CardFicha
        card={ficha ? (cardsById[ficha.id] ?? null) : null}
        reversed={ficha?.reversed}
        onClose={() => setFicha(null)}
      />
    </div>
  );
}
