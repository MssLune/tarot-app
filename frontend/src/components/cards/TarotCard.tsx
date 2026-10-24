import { useState } from 'react';
import { motion } from 'framer-motion';
import Glyph from '../ui/Glyph';

/* ==========================================================================
   Carta visual con efecto "revelar" (flip 3D + brillo).
   - `revealed = false` muestra el reverso ornamentado.
   - `revealed = true` gira la carta y muestra el frente con su símbolo.
   - `reversed` dibuja el contenido del frente rotado 180°, como una carta
     invertida real, con un badge indicándolo.
   ========================================================================== */

interface TarotCardProps {
  name: string;
  glyph: string;
  subtitle?: string;
  /**
   * URL de la imagen de la carta, si tiene.
   *
   * Opcional: sin imagen la carta se dibuja con el glifo, como siempre. Por eso
   * se pueden ir agregando imágenes sin cambiar nada de lo demás. Si la URL está
   * pero el archivo no carga, cae al glifo también: una carta con el dibujo
   * de siempre es mejor que una con un ícono de imagen rota.
   */
  imageUrl?: string;
  /** Se apaga mientras la imagen no cargó, para no partir de un í roto. */
  onImage?: (ok: boolean) => void;
  reversed?: boolean;
  revealed?: boolean;
  /** Retardo de aparición, para el efecto escalonado. */
  delay?: number;
  /** Placeholder cuando todavía no se cargó una carta. */
  empty?: boolean;
  onClick?: () => void;
  /** Escala tipográfica: en layouts densos conviene "sm". */
  density?: 'sm' | 'md' | 'lg';
  /** Oculta el nombre: para miniaturas donde el texto sería ilegible. */
  hideName?: boolean;
  className?: string;
}

const TEXT: Record<'sm' | 'md' | 'lg', { glyph: string; name: string; sub: string; pad: string }> = {
  sm: { glyph: 'text-2xl', name: 'text-[0.5rem]', sub: 'text-[0.4rem]', pad: 'p-1.5' },
  md: { glyph: 'text-4xl', name: 'text-[0.62rem]', sub: 'text-[0.5rem]', pad: 'p-2.5' },
  lg: { glyph: 'text-6xl', name: 'text-sm', sub: 'text-[0.6rem]', pad: 'p-4' },
};

export default function TarotCard({
  name,
  glyph,
  subtitle,
  imageUrl,
  onImage,
  reversed = false,
  revealed = true,
  delay = 0,
  empty = false,
  onClick,
  density = 'md',
  hideName = false,
  className = '',
}: TarotCardProps) {
  const t = TEXT[density];
  /* La dirección que no cargó. Si es la misma que la actual se dibuja el
     glifo; si el usuario cambia la imagen, se vuelve a intentar sola. */
  const [fallida, setFallida] = useState<string | null>(null);
  const imagen = imageUrl && fallida !== imageUrl ? imageUrl : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={onClick ? { scale: 1.06, y: -6 } : { scale: 1.03, y: -3 }}
      onClick={onClick}
      style={{ perspective: 1000 }}
      className={`group relative aspect-[2/3] w-full ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Halo dorado detrás de la carta */}
      <div
        className={`absolute -inset-2 rounded-2xl bg-gold-400/20 blur-xl transition-opacity duration-500 ${
          revealed && !empty ? 'opacity-70 group-hover:opacity-100' : 'opacity-0'
        }`}
      />

      <motion.div
        className="preserve-3d relative h-full w-full"
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ delay: delay + (revealed ? 0.12 : 0), duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ---------- Reverso ---------- */}
        <div className="backface-hidden card-back absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl border border-gold-400/40 shadow-card">
          <div className="absolute inset-1.5 rounded-lg border border-gold-400/25" />
          <div className="absolute inset-3 rounded-md border border-dashed border-gold-400/15" />
          <span className="relative text-gold-300/70" style={{ fontSize: '1.6em' }}>
            ☾
          </span>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* ---------- Frente ---------- */}
        <div
          className="backface-hidden card-face absolute inset-0 overflow-hidden rounded-xl border border-gold-300/50 shadow-card"
          style={{ transform: 'rotateY(180deg)' }}
        >
          {/* Marco interior dorado */}
          <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-gold-300/30" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold-200/[0.07] via-transparent to-mystic-700/25" />

          {/* Esquinas ornamentadas */}
          {['left-1.5 top-1.5', 'right-1.5 top-1.5', 'left-1.5 bottom-1.5', 'right-1.5 bottom-1.5'].map(
            (pos) => (
              <span
                key={pos}
                className={`absolute ${pos} h-2 w-2 rounded-full bg-gold-300/40`}
                aria-hidden="true"
              />
            ),
          )}

          {empty ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gold-100/25">
              <span className={t.glyph}>+</span>
              {!hideName && (
                <span className={`${t.sub} font-display uppercase tracking-[0.2em]`}>vacía</span>
              )}
            </div>
          ) : hideName ? (
            /* Miniatura: sólo el dibujo, centrado */
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ transform: reversed ? 'rotate(180deg)' : undefined }}
            >
              {imagen ? (
                <img
                  src={imagen}
                  referrerPolicy="no-referrer"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  draggable={false}
                  onLoad={() => onImage?.(true)}
                  onError={() => {
                    setFallida(imagen ?? null);
                    onImage?.(false);
                  }}
                  className="h-full w-full rounded object-contain"
                />
              ) : (
                <span
                  className={`${t.glyph} text-gold-gradient leading-none drop-shadow-[0_0_14px_rgba(232,205,138,0.4)]`}
                >
                  <Glyph>{glyph}</Glyph>
                </span>
              )}
            </div>
          ) : (
            <div
              className={`flex h-full w-full flex-col items-center justify-between ${t.pad} text-center`}
              style={{ transform: reversed ? 'rotate(180deg)' : undefined }}
            >
              <span className={`${t.sub} font-display uppercase tracking-[0.18em] text-gold-300/60`}>
                {subtitle ?? ''}
              </span>

              {imagen ? (
                <img
                  src={imagen}
                  referrerPolicy="no-referrer"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  draggable={false}
                  onLoad={() => onImage?.(true)}
                  onError={() => {
                    setFallida(imagen ?? null);
                    onImage?.(false);
                  }}
                  className="min-h-0 w-full flex-1 rounded object-contain"
                />
              ) : (
                <span
                  className={`${t.glyph} text-gold-gradient leading-none drop-shadow-[0_0_18px_rgba(232,205,138,0.45)]`}
                >
                  <Glyph>{glyph}</Glyph>
                </span>
              )}

              <span
                className={`${t.name} font-display uppercase leading-tight tracking-[0.1em] text-gold-100/90`}
              >
                {name}
              </span>
            </div>
          )}

          {/* Badge de carta invertida */}
          {reversed && !empty && (
            <span className="absolute right-1 top-1 rounded-full bg-rose-500/25 px-1.5 py-0.5 text-[0.5rem] font-semibold text-rose-100 ring-1 ring-rose-300/40">
              ↓
            </span>
          )}

          {/* Destello que barre la carta al revelarse */}
          {revealed && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ x: '-120%' }}
              animate={{ x: '120%' }}
              transition={{ delay: delay + 0.55, duration: 0.9, ease: 'easeOut' }}
              style={{
                background:
                  'linear-gradient(105deg, transparent 30%, rgba(251,243,220,0.45) 50%, transparent 70%)',
              }}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
