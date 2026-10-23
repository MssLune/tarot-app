import { AnimatePresence, motion } from 'framer-motion';
import { SYSTEM_GLYPHS, SYSTEM_LABELS } from '../../lib/systems';
import { useContentStore } from '../../store/useContentStore';
import { useReadingStore } from '../../store/useReadingStore';
import type { Spread } from '../../types';
import SpreadMini from '../cards/SpreadMini';
import Button from '../ui/Button';
import OrnateDivider from '../ui/OrnateDivider';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Pantalla 2 — Elección de la tirada.
   Incluye tiradas predefinidas, las personalizadas guardadas y el acceso al
   creador de tiradas.
   ========================================================================== */

/** Tarjeta reutilizable para una tirada (predefinida o personalizada). */
function SpreadCard({
  spread,
  index,
  onUse,
  onEdit,
  onDelete,
}: {
  spread: Spread;
  index: number;
  onUse: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ delay: Math.min(index * 0.07, 0.5), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5 }}
      className="panel gilded group relative flex flex-col overflow-hidden p-5"
    >
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-mystic-500/10 blur-3xl transition-colors duration-700 group-hover:bg-gold-400/15" />

      {/* Mini-diagrama del layout */}
      <button onClick={onUse} className="relative mb-4 block w-full text-left" title={`Usar ${spread.name}`}>
        <div className="rounded-2xl border border-gold-400/10 bg-ink-950/60 p-3">
          <SpreadMini positions={spread.positions} />
        </div>
      </button>

      <div className="relative flex flex-1 flex-col">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="text-base leading-snug text-gold-100 sm:text-lg">{spread.name}</h3>
          <span className="mt-0.5 shrink-0 rounded-full border border-gold-400/25 px-2 py-0.5 text-[0.6rem] font-medium tracking-wider text-gold-200/80">
            {spread.positions.length} {spread.positions.length === 1 ? 'carta' : 'cartas'}
          </span>
        </div>

        <p className="flex-1 text-xs leading-relaxed text-gold-100/45">{spread.description}</p>

        <div className="mt-5 flex items-center gap-2">
          <Button size="sm" onClick={onUse} className="flex-1">
            Usar
          </Button>
          {onEdit && (
            <Button size="sm" variant="ghost" onClick={onEdit} title="Editar tirada">
              Editar
            </Button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Eliminar tirada"
              className="rounded-full px-2 py-2 text-xs text-rose-300/50 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function SpreadScreen() {
  const system = useReadingStore((s) => s.system);
  const deck = useReadingStore((s) => s.deck);
  const customSpreads = useReadingStore((s) => s.customSpreads);
  const chooseSpread = useReadingStore((s) => s.chooseSpread);
  const startNewSpread = useReadingStore((s) => s.startNewSpread);
  const editSpread = useReadingStore((s) => s.editSpread);
  const deleteCustomSpread = useReadingStore((s) => s.deleteCustomSpread);
  const goTo = useReadingStore((s) => s.goTo);
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  const presetSpreads = useContentStore((s) => s.spreads);

  const systemLabel = system ? SYSTEM_LABELS[system] : 'Sistema';
  const isDeck = system === 'custom-deck';

  return (
    <div className="space-y-10">
      {/* ---------------- Encabezado ---------------- */}
      <div className="space-y-5">
        <div className="flex justify-center">
          <button
            onClick={() => goTo(isDeck ? 'decks' : 'system')}
            className="group flex items-center gap-2 rounded-full border border-gold-400/20 bg-ink-900/50 px-4 py-2 text-[0.65rem] uppercase tracking-[0.2em] text-gold-200/70 transition-colors hover:border-gold-300/50 hover:text-gold-100"
          >
            <span className="text-gold-300">{system ? SYSTEM_GLYPHS[system] : '✦'}</span>
            {isDeck && deck ? deck.name : systemLabel}
            <span className="text-gold-100/30 transition-colors group-hover:text-gold-200">
              · cambiar
            </span>
          </button>
        </div>

        <SectionHeading
          overline={isDeck ? 'Paso 3 de 5' : 'Paso 2 de 4'}
          title="Elige la tirada"
          subtitle="Usa una tirada clásica, reutiliza una que hayas creado, o diseña una nueva desde cero con tus propias posiciones."
        />
      </div>

      {/* ---------------- Crear tirada ---------------- */}
      <motion.button
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.995 }}
        onClick={startNewSpread}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-dashed border-gold-400/30 bg-gradient-to-r from-mystic-700/20 via-ink-800/40 to-gold-700/10 p-5 text-left transition-colors hover:border-gold-300/60 sm:gap-6 sm:p-6"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-300/40 bg-ink-950/70 text-2xl text-gold-gradient transition-transform duration-500 group-hover:rotate-90">
          ✛
        </span>
        <span className="min-w-0">
          <span className="block font-display text-base uppercase tracking-[0.18em] text-gold-100 sm:text-lg">
            Crear tirada personalizada
            {!isAuthenticated && (
              <span className="ml-2 align-middle rounded-full border border-gold-400/25 bg-gold-400/[0.08] px-2 py-0.5 font-body text-[0.6rem] normal-case tracking-normal text-gold-200/80">
                Con cuenta
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-gold-100/45 sm:text-sm">
            Nombre, cantidad de posiciones, nombre de cada una y layout a elección —o arrastrando las
            cartas donde quieras.
          </span>
        </span>
        <span className="ml-auto hidden shrink-0 font-display text-xs uppercase tracking-[0.2em] text-gold-200 transition-all group-hover:translate-x-1 sm:block">
          Diseñar →
        </span>
      </motion.button>

      {/* ---------------- Tiradas personalizadas ---------------- */}
      {customSpreads.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center gap-4">
            <h3 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
              Mis tiradas · {customSpreads.length}
            </h3>
            <span className="hairline h-px flex-1 opacity-60" />
          </div>

          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {customSpreads.map((spread, i) => (
                <SpreadCard
                  key={spread.id}
                  spread={spread}
                  index={i}
                  onUse={() => chooseSpread(spread)}
                  onEdit={() => editSpread(spread)}
                  onDelete={() => deleteCustomSpread(spread.id)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      <OrnateDivider symbol="☾" />

      {/* ---------------- Tiradas predefinidas ---------------- */}
      <section className="space-y-5">
        <div className="flex items-center gap-4">
          <h3 className="shrink-0 font-display text-xs uppercase tracking-[0.28em] text-gold-200/80">
            Tiradas clásicas
          </h3>
          <span className="hairline h-px flex-1 opacity-60" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {presetSpreads.map((spread, i) => (
            <SpreadCard
              key={spread.id}
              spread={spread}
              index={i}
              onUse={() => chooseSpread(spread)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
