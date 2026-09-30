import { motion } from 'framer-motion';

/* ==========================================================================
   Interruptor "carta invertida".
   ========================================================================== */

export default function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 rounded-xl border border-gold-400/15 bg-ink-900/50 px-4 py-3 text-left transition hover:border-gold-400/35 hover:bg-ink-800/60"
    >
      <span className="min-w-0">
        <span
          className={`block font-display text-xs uppercase tracking-[0.18em] transition-colors ${
            checked ? 'text-gold-200' : 'text-gold-100/50'
          }`}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block truncate text-[0.7rem] text-gold-100/35">{hint}</span>}
      </span>

      <span
        className={`relative flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300 ${
          checked ? 'border-gold-300/70 bg-gold-400/30' : 'border-gold-400/20 bg-ink-950'
        }`}
      >
        {/* El centrado vertical se resuelve con flex (y no con translate) porque
            la animación de layout de Framer Motion sobreescribe el transform. */}
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`absolute h-4 w-4 rounded-full shadow ${
            checked ? 'right-1 bg-gold-sheen shadow-glow' : 'left-1 bg-gold-100/30'
          }`}
        />
      </span>
    </button>
  );
}
