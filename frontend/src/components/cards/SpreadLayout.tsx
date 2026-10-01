import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { layoutMetrics } from '../../lib/layout';
import type { SpreadPosition } from '../../types';
import TarotCard from './TarotCard';

/* ==========================================================================
   Lienzo de la tirada.
   Dibuja las cartas en las coordenadas reales del layout (en %), manteniendo
   proporciones en cualquier pantalla. En celular el lienzo conserva un ancho
   mínimo y se puede desplazar en horizontal para no deformar el diseño.
   ========================================================================== */

export interface LayoutEntry {
  position: SpreadPosition;
  name: string;
  glyph: string;
  subtitle?: string;
  /** URL de la imagen, si la carta tiene. Opcional a propósito. */
  imageUrl?: string;
  reversed?: boolean;
  empty?: boolean;
}

interface SpreadLayoutProps {
  entries: LayoutEntry[];
  /** Muestra el frente de las cartas (con aparición escalonada). */
  revealed?: boolean;
  /** Muestra el nombre de la posición debajo de cada carta. */
  showLabels?: boolean;
  /** Número de orden sobre cada carta. */
  showNumbers?: boolean;
  onCardClick?: (index: number) => void;
  /** Índice resaltado (por ejemplo, la posición enfocada en el resultado). */
  highlightIndex?: number | null;
  /** Ajusta el lienzo al ancho disponible (sin scroll horizontal): útil en la
   *  vista previa lateral, donde el espacio es acotado. */
  fit?: boolean;
  className?: string;
}

export default function SpreadLayout({
  entries,
  revealed = true,
  showLabels = true,
  showNumbers = true,
  onCardClick,
  highlightIndex = null,
  fit = false,
  className = '',
}: SpreadLayoutProps) {
  const positions = entries.map((e) => e.position);
  const { aspect, cardWidth, minWidth } = layoutMetrics(positions);
  const density = cardWidth >= 30 ? 'lg' : cardWidth >= 18 ? 'md' : 'sm';

  /* Se mide el ancho real del lienzo para saber cuántos píxeles ocupa cada
     carta: en celular las tiradas densas quedan muy chicas y en ese caso se
     muestra sólo el símbolo (el nombre completo está en el detalle de abajo). */
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardPx = (canvasWidth * cardWidth) / 100;
  const hideName = canvasWidth > 0 && cardPx < 54;

  return (
    <div className={`no-scrollbar w-full overflow-x-auto px-1 pb-9 pt-3 ${className}`}>
      <div
        ref={canvasRef}
        className="relative mx-auto w-full"
        style={{
          aspectRatio: `${aspect}`,
          // En pantallas angostas el lienzo se ajusta al ancho disponible en
          // lugar de forzar scroll horizontal: la tirada se ve completa.
          minWidth: fit ? undefined : `min(${minWidth}px, 100%)`,
          maxWidth: '860px',
        }}
      >
        {/* Retícula astral sutil de fondo */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.10) 0%, transparent 65%)',
          }}
        />

        {entries.map((entry, index) => {
          const isDimmed = highlightIndex !== null && highlightIndex !== index;
          return (
            <motion.div
              key={entry.position.id}
              className="absolute"
              // x / y se declaran como transformaciones de Framer Motion: si se
              // usara `transform: translate(-50%,-50%)` en el style, la propia
              // animación de escala lo sobreescribiría y las cartas quedarían
              // ancladas por su esquina superior izquierda.
              style={{
                left: `${entry.position.x}%`,
                top: `${entry.position.y}%`,
                width: `${cardWidth}%`,
                x: '-50%',
                y: '-50%',
                zIndex: entry.position.rotate ? 20 : 10,
              }}
              animate={{ opacity: isDimmed ? 0.32 : 1, scale: highlightIndex === index ? 1.07 : 1 }}
              transition={{ duration: 0.35 }}
            >
              <div style={{ transform: entry.position.rotate ? `rotate(${entry.position.rotate}deg)` : undefined }}>
                <TarotCard
                  name={entry.name}
                  glyph={entry.glyph}
                  subtitle={entry.subtitle}
                  imageUrl={entry.imageUrl}
                  reversed={entry.reversed}
                  revealed={revealed}
                  empty={entry.empty}
                  density={density}
                  hideName={hideName}
                  delay={index * 0.13}
                  onClick={onCardClick ? () => onCardClick(index) : undefined}
                />
              </div>

              {/* Número de orden */}
              {showNumbers && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.13 + 0.25 }}
                  className="absolute -left-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-gold-300/50 bg-ink-950/90 text-[0.6rem] font-semibold text-gold-200 shadow"
                >
                  {index + 1}
                </motion.span>
              )}

              {/* Nombre de la posición. Con cartas muy chicas (celular + tiradas
                  densas) se omite: quedarían textos amontonados y la referencia
                  la dan los números junto al detalle de cada carta. */}
              {showLabels && !hideName && (
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.13 + 0.35 }}
                  style={{
                    left: '50%',
                    // x como transformación de Framer: el translate de Tailwind
                    // sería sobreescrito por la animación.
                    x: '-50%',
                    top: entry.position.rotate
                      ? 'calc(100% + 1.5rem)'
                      : 'calc(100% + 0.35rem)',
                  }}
                  className="absolute w-[135%] text-center font-display text-[0.55rem] uppercase leading-tight tracking-[0.14em] text-gold-200/70 sm:text-[0.62rem]"
                >
                  {entry.position.name}
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
