import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Show } from '@clerk/react';
import { useReadingStore } from '../../store/useReadingStore';
import type { Screen } from '../../types';
import LimitBanner from '../plans/LimitBanner';
import UserMenu from './UserMenu';

/* ==========================================================================
   Estructura general de la app: cabecera fija, indicador de pasos, contenido
   y pie. El indicador refleja en qué punto del flujo está el usuario.
   ========================================================================== */

const BASE_STEPS: { id: Screen; label: string; glyph: string }[] = [
  { id: 'system', label: 'Sistema', glyph: '☾' },
  { id: 'spread', label: 'Tirada', glyph: '✦' },
  { id: 'input', label: 'Cartas', glyph: '✧' },
  { id: 'result', label: 'Lectura', glyph: '☉' },
];

/** Paso extra que sólo existe en el sistema de mazo propio. */
const DECK_STEP = { id: 'decks' as Screen, label: 'Mazo', glyph: '❋' };

export default function AppShell({ children }: { children: ReactNode }) {
  const screen = useReadingStore((s) => s.screen);
  const goTo = useReadingStore((s) => s.goTo);
  const restart = useReadingStore((s) => s.restart);
  const historyCount = useReadingStore((s) => s.history.length);
  const system = useReadingStore((s) => s.system);
  const spread = useReadingStore((s) => s.spread);
  const deck = useReadingStore((s) => s.deck);
  /* El acceso a administración vive en el menú de cuenta (UserMenu), no acá. */

  /* Con mazo propio el flujo tiene un paso más: elegir/crear el mazo. */
  const STEPS =
    system === 'custom-deck'
      ? [BASE_STEPS[0], DECK_STEP, ...BASE_STEPS.slice(1)]
      : BASE_STEPS;

  const activeIndex = STEPS.findIndex((s) => s.id === screen);

  /** Permite volver a un paso anterior sólo si ya se completó. */
  const canGo = (index: number) => {
    const step = STEPS[index];
    if (step.id === 'system') return true;
    if (step.id === 'decks') return Boolean(system);
    if (step.id === 'spread') return Boolean(system) && (system !== 'custom-deck' || Boolean(deck));
    if (step.id === 'input') return Boolean(system && spread);
    return false;
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ---------------- Cabecera ---------------- */}
      <header className="sticky top-0 z-40 border-b border-gold-400/10 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Marca. En móvil va sólo el ícono: con el texto completo la fila
              mide 459px y desborda los 375px de un iPhone SE. Medido con un
              modelo de ancho de texto: ícono 40px + "ARCANA" 103px + nav 235px
              + padding y gaps. Con sólo el ícono, 311px: entra incluso en
              pantallas de 320px. El texto vuelve desde `sm`. */}
          <button
            onClick={restart}
            className="group flex items-center gap-3 text-left"
            title="Volver al inicio"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold-400/40 bg-ink-900">
              <span className="absolute inset-0 rounded-full bg-gold-400/10 blur-md transition-opacity group-hover:opacity-100 sm:opacity-60" />
              <span className="relative text-lg text-gold-300">☾</span>
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block font-display text-lg tracking-[0.3em] text-gold-gradient">
                ARCANA
              </span>
              <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.28em] text-gold-100/35">
                Tarot &amp; Oráculo
              </span>
            </span>
          </button>

          {/* Acciones. El padding baja en móvil para que los tres botones más el
              ícono entren incluso en pantallas de 320px. */}
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              onClick={() => goTo('history')}
              className={`relative rounded-full px-2.5 py-2 font-display text-[0.65rem] uppercase tracking-[0.18em] transition-colors sm:px-4 sm:text-xs ${
                screen === 'history'
                  ? 'bg-gold-400/15 text-gold-200'
                  : 'text-gold-100/50 hover:bg-white/5 hover:text-gold-100'
              }`}
            >
              Historial
              {historyCount > 0 && (
                <span className="ml-1.5 rounded-full bg-gold-400/25 px-1.5 py-0.5 text-[0.6rem] text-gold-100">
                  {historyCount}
                </span>
              )}
            </button>
            <button
              onClick={() => goTo('rituals')}
              className={`rounded-full px-2.5 py-2 font-display text-[0.65rem] uppercase tracking-[0.18em] transition-colors sm:px-4 sm:text-xs ${
                screen === 'rituals'
                  ? 'bg-gold-400/15 text-gold-200'
                  : 'text-gold-100/50 hover:bg-white/5 hover:text-gold-100'
              }`}
            >
              Luna
            </button>
            <button
              onClick={restart}
              className="rounded-full border border-gold-400/25 px-2.5 py-2 font-display text-[0.65rem] uppercase tracking-[0.18em] text-gold-200/80 transition-colors hover:border-gold-300/60 hover:bg-gold-400/10 hover:text-gold-100 sm:px-4 sm:text-xs"
            >
              Nueva
            </button>

            {/* Menú de cuenta: sólo con sesión iniciada. */}
            <Show when="signed-in">
              <UserMenu />
            </Show>
          </nav>
        </div>

        {/* ---------------- Indicador de pasos ---------------- */}
        {['system', 'decks', 'spread', 'input', 'result'].includes(screen) && (
          <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
            <ol className="flex items-center gap-1 sm:gap-2">
              {STEPS.map((step, i) => {
                const isActive = i === activeIndex;
                const isDone = i < activeIndex;
                const clickable = canGo(i) && i < activeIndex;
                return (
                  <li key={step.id} className="flex flex-1 items-center gap-1 sm:gap-2">
                    <button
                      disabled={!clickable}
                      onClick={() => clickable && goTo(step.id)}
                      className={`flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors ${
                        clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.65rem] transition-all duration-500 ${
                          isActive
                            ? 'border-gold-300 bg-gold-sheen text-ink-900 shadow-glow'
                            : isDone
                              ? 'border-gold-400/50 bg-gold-400/15 text-gold-200'
                              : 'border-gold-400/15 text-gold-100/25'
                        }`}
                      >
                        {isDone ? '✓' : step.glyph}
                      </span>
                      <span
                        className={`hidden truncate font-display text-[0.6rem] uppercase tracking-[0.2em] transition-colors sm:block ${
                          isActive ? 'text-gold-200' : isDone ? 'text-gold-100/45' : 'text-gold-100/20'
                        }`}
                      >
                        {step.label}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <span className="relative h-px flex-1 overflow-hidden bg-gold-400/10">
                        <motion.span
                          className="absolute inset-y-0 left-0 bg-gold-300/60"
                          initial={false}
                          animate={{ width: i < activeIndex ? '100%' : '0%' }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </header>

      {/* Aviso de límite del plan. Va FUERA del <main> y después de la
          cabecera para que ocupe el ancho de la pantalla y se lea como un
          aviso del sistema, no como parte de la página. Sólo aparece cuando
          el usuario llegó a un tope, y se puede cerrar. */}
      <Show when="signed-in">
        <LimitBanner />
      </Show>

      {/* ---------------- Contenido ---------------- */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>

      {/* ---------------- Pie ---------------- */}
      <footer className="relative z-10 border-t border-gold-400/10 px-4 py-6 text-center">
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold-100/25">
          ✦ Las cartas sugieren · la decisión es tuya ✦
        </p>
      </footer>
    </div>
  );
}
