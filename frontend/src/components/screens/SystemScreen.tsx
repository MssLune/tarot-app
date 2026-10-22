import { motion } from 'framer-motion';
import { useContentStore } from '../../store/useContentStore';
import { useReadingStore } from '../../store/useReadingStore';
import type { SystemId } from '../../types';
import Glyph from '../ui/Glyph';
import OrnateDivider from '../ui/OrnateDivider';

/* ==========================================================================
   Pantalla 1 — Elección del sistema de lectura.
   ========================================================================== */

interface SystemOption {
  id: SystemId;
  glyph: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
}

const OPTIONS: SystemOption[] = [
  {
    id: 'rider-waite',
    glyph: '☉',
    name: 'Tarot clásico',
    tagline: 'Mazo completo de 78 cartas',
    description:
      'Los 78 Arcanos (22 Mayores + 56 Menores) con significado en posición derecha e invertida, ficha de referencia con Sí/No, Pasado-Presente-Futuro y astrología.',
    features: [
      '78 cartas: Mayores y Menores',
      'Lectura derecha e invertida',
      'Detección de patrones y combinaciones',
    ],
  },
  {
    id: 'oracle',
    glyph: '❋',
    name: 'Oráculo',
    tagline: 'Mazo libre, una sola vez',
    description:
      'Para cualquier mazo de oráculo. Cargás el nombre de cada carta y, si querés, su significado, sin tener que definir el mazo antes.',
    features: [
      'Compatible con cualquier mazo',
      'Significados propios por carta',
      'Detección de mensajes repetidos',
    ],
  },
  {
    id: 'custom-deck',
    glyph: '✧',
    name: 'Mazo propio',
    tagline: 'Tarot u oráculo personalizado',
    description:
      'Creá tu mazo una vez —cartas, símbolos y significados al derecho y al revés— y reutilizalo en todas tus lecturas. Podés partir de los 22 Arcanos y ampliarlos.',
    features: [
      'Tus cartas con derecho e invertida',
      'Plantillas: 22, 56 o 78 cartas',
      'Se combina con todas las tiradas',
    ],
  },
];

export default function SystemScreen() {
  const chooseSystem = useReadingStore((s) => s.chooseSystem);
  const deckCount = useReadingStore((s) => s.customDecks.length);
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  const cards = useContentStore((s) => s.cards);

  return (
    <div className="space-y-12">
      {/* ---------------- Hero ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="pt-4 text-center sm:pt-10"
      >
        <p className="overline mb-5">Lecturas de tarot y oráculo</p>
        <h1 className="text-gold-gradient text-4xl leading-[1.1] sm:text-6xl">
          El mazo ya habló.
          <br />
          <span className="text-gold-100/80">Acá se ordena el mensaje.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-gold-100/55 sm:text-base">
          Elegí el sistema, armá la tirada —predefinida o creada por vos—, cargá las cartas que
          salieron y recibí una interpretación posición por posición, con los patrones del conjunto y
          una conclusión integradora.
        </p>
        <OrnateDivider className="mt-8" symbol="✧" />
      </motion.section>

      {/* ---------------- Opciones ---------------- */}
      <section className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {OPTIONS.map((option, i) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6 }}
            onClick={() => chooseSystem(option.id)}
            className="panel gilded group relative overflow-hidden p-6 text-left transition-shadow duration-500 hover:shadow-glow sm:p-8"
          >
            {/* Resplandor de fondo al hover */}
            <span className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gold-400/10 blur-3xl transition-opacity duration-700 group-hover:bg-gold-300/20" />

            <div className="relative">
              <div className="mb-6 flex items-start justify-between gap-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold-300/30 bg-ink-900/80 text-3xl text-gold-gradient shadow-inset transition-transform duration-500 group-hover:scale-110">
                  <Glyph>{option.glyph}</Glyph>
                </span>
                <span className="overline mt-2 text-right">{option.tagline}</span>
              </div>

              <h3 className="text-xl text-gold-100 sm:text-2xl">{option.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gold-100/55">{option.description}</p>

              {/* Mazos propios ya guardados: atajo visible desde el inicio. */}
              {option.id === 'custom-deck' && deckCount > 0 && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/[0.08] px-3 py-1 text-[0.65rem] text-gold-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
                  {deckCount} {deckCount === 1 ? 'mazo guardado' : 'mazos guardados'}
                </p>
              )}

              {/* Sin cuenta: avisar antes del clic que el mazo propio se guarda
                  en la cuenta (al tocarlo, se pide iniciar sesión). */}
              {option.id === 'custom-deck' && !isAuthenticated && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/[0.08] px-3 py-1 text-[0.65rem] text-gold-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
                  Con cuenta
                </p>
              )}

              <ul className="mt-6 space-y-2">
                {option.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-gold-100/50">
                    <span className="mt-0.5 text-gold-300/70">✦</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <span className="mt-7 inline-flex items-center gap-2 font-display text-[0.7rem] uppercase tracking-[0.22em] text-gold-200 transition-all duration-300 group-hover:gap-4">
                {option.id === 'custom-deck' && deckCount > 0
                  ? 'Usar mi mazo'
                  : 'Elegir este sistema'}
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </motion.button>
        ))}
      </section>

      {/* ---------------- Muestra del mazo ---------------- */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="pt-2"
      >
        <p className="mb-5 text-center text-[0.65rem] uppercase tracking-[0.28em] text-gold-100/25">
          Arcanos incluidos
        </p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {cards.map((card, i) => (
            <motion.span
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.025 }}
              title={`${card.number} · ${card.name}`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gold-400/15 bg-ink-900/60 text-base text-gold-300/60 transition-all duration-300 hover:-translate-y-1 hover:border-gold-300/50 hover:text-gold-200"
            >
              <Glyph>{card.glyph}</Glyph>
            </motion.span>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
