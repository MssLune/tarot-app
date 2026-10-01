import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { YES_NO_LABELS } from '@arcana/tarot-core';
import type { ArcanaCard } from '../../types';
import Glyph from '../ui/Glyph';
import OrnateDivider from '../ui/OrnateDivider';

/* ==========================================================================
   Ficha de referencia de una carta.
   El resumen conceptual, el Sí/No y la astrología son cualidades fijas de la
   carta y no cambian con la orientación (así lo plantea la guía original).
   Pasado/Presente/Futuro sí tiene una variante invertida propia: la misma
   energía vivida bloqueada, demorada o hacia adentro, no una simple negación
   de la versión derecha.

   Se monta con un portal directo a `document.body`: las pantallas se envuelven
   en un `motion.div` animado (App.tsx) y cualquier ancestro con `transform`
   o `filter` — que Framer Motion aplica ahí incluso en reposo — rompe
   `position: fixed`, anclando este modal muy abajo en vez de centrarlo en el
   viewport real.
   ========================================================================== */

const YES_NO_TONE: Record<string, string> = {
  si: 'border-gold-400/40 bg-gold-400/[0.1] text-gold-100',
  no: 'border-rose-400/40 bg-rose-500/[0.1] text-rose-100',
  incierto: 'border-mystic-400/40 bg-mystic-500/[0.12] text-gold-100',
};

export default function CardFicha({
  card,
  reversed = false,
  onClose,
}: {
  card: ArcanaCard | null;
  /** Orientación en que salió la carta en la tirada actual. */
  reversed?: boolean;
  onClose: () => void;
}) {
  const pastText = reversed ? card?.pastTextReversed : card?.pastText;
  const presentText = reversed ? card?.presentTextReversed : card?.presentText;
  const futureText = reversed ? card?.futureTextReversed : card?.futureText;

  return createPortal(
    <AnimatePresence>
      {card && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="panel gilded relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl sm:p-8"
          >
            <button
              onClick={onClose}
              title="Cerrar"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-gold-400/25 text-gold-200/60 transition-colors hover:border-gold-300/60 hover:text-gold-100"
            >
              ✕
            </button>

            {/* ---------------- Encabezado ---------------- */}
            <div className="mb-5 text-center">
              <span className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full border border-gold-300/40 bg-ink-950/70 text-2xl text-gold-gradient shadow-inset">
                <Glyph>{card.glyph}</Glyph>
              </span>
              <h2 className="flex items-center justify-center gap-2 text-gold-gradient text-2xl">
                {card.name}
                {reversed && (
                  <span className="rounded-full border border-rose-300/40 bg-rose-500/15 px-2 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.12em] text-rose-100">
                    invertida
                  </span>
                )}
              </h2>
              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.2em] text-gold-100/40">
                {card.correspondence}
              </p>
            </div>

            {/* ---------------- Resumen conceptual ---------------- */}
            {card.conceptTags && card.conceptTags.length > 0 && (
              <div className="mb-5 flex flex-wrap justify-center gap-2">
                {card.conceptTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-gold-400/20 bg-gold-400/[0.06] px-3 py-1 text-[0.68rem] text-gold-200/80"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <OrnateDivider symbol="✧" className="mb-5" />

            {/* ---------------- Sí / No ---------------- */}
            {card.yesNo && (
              <div className={`mb-5 rounded-2xl border p-4 ${YES_NO_TONE[card.yesNo]}`}>
                <p className="overline mb-1.5">¿Sí o no? · {YES_NO_LABELS[card.yesNo]}</p>
                {card.yesNoReason && (
                  <p className="text-sm leading-relaxed text-gold-100/75">{card.yesNoReason}</p>
                )}
                <p className="mt-2 text-[0.62rem] text-gold-100/30">
                  No varía según la orientación: es una cualidad fija de la carta.
                </p>
              </div>
            )}

            {/* ---------------- Pasado · Presente · Futuro ---------------- */}
            {(pastText || presentText || futureText) && (
              <div className="mb-5 space-y-3">
                <h3 className="overline text-center">
                  Pasado · Presente · Futuro{reversed ? ' (invertida)' : ''}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Pasado', text: pastText },
                    { label: 'Presente', text: presentText },
                    { label: 'Futuro', text: futureText },
                  ].map(
                    (block) =>
                      block.text && (
                        <div key={block.label} className="rounded-xl border border-gold-400/12 bg-ink-950/40 p-3">
                          <p className="mb-1.5 font-display text-[0.65rem] uppercase tracking-[0.18em] text-gold-200/70">
                            {block.label}
                          </p>
                          <p className="text-xs leading-relaxed text-gold-100/60">{block.text}</p>
                        </div>
                      ),
                  )}
                </div>
              </div>
            )}

            {/* ---------------- Astrología ---------------- */}
            {card.astrology && (
              <div className="rounded-xl border border-gold-400/12 bg-ink-950/40 px-4 py-3 text-center">
                <p className="overline mb-1">Astrología y tiempos</p>
                <p className="text-xs text-gold-100/60">{card.astrology}</p>
              </div>
            )}

            <p className="mt-5 text-center text-[0.62rem] text-gold-100/25">
              El resumen, el Sí/No y la astrología son fijos de la carta. Pasado/Presente/Futuro sí
              se ajusta a cómo salió en tu tirada.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
