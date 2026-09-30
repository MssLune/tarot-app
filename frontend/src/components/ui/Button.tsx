import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/* ==========================================================================
   Botón con microinteracciones.
   Variantes: primary (dorado sólido), outline (filo dorado), ghost (sutil),
   danger (para acciones destructivas discretas).
   ========================================================================== */

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  icon?: ReactNode;
  title?: string;
  fullWidth?: boolean;
}

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gold-sheen text-ink-900 font-semibold shadow-glow hover:shadow-glow-strong border border-gold-200/50',
  outline:
    'border border-gold-400/35 text-gold-200 hover:border-gold-300/70 hover:bg-gold-400/10 backdrop-blur-sm',
  ghost: 'text-gold-100/60 hover:text-gold-100 hover:bg-white/5',
  danger: 'border border-rose-400/30 text-rose-200/80 hover:bg-rose-500/10 hover:text-rose-100',
};

export default function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  icon,
  title,
  fullWidth = false,
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={[
        'relative inline-flex items-center justify-center gap-2 rounded-full',
        'font-display uppercase tracking-[0.16em] transition-colors duration-300',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300/70',
        SIZES[size],
        VARIANTS[variant],
        disabled ? 'cursor-not-allowed opacity-40 saturate-50' : 'cursor-pointer',
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {/* Brillo que barre el botón dorado al pasar el mouse */}
      {variant === 'primary' && !disabled && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -inset-y-2 -left-1/3 w-1/3 rotate-12 bg-white/40 blur-md opacity-0 transition-opacity duration-500 hover:opacity-100" />
        </span>
      )}
      {icon && <span className="text-base leading-none">{icon}</span>}
      <span className="relative">{children}</span>
    </motion.button>
  );
}
