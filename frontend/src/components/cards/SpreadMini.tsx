import type { SpreadPosition } from '../../types';

/* ==========================================================================
   Mini-diagrama de una tirada: rectángulos dorados en las coordenadas reales.
   Usa siempre un marco de proporción fija (16/10) para que todas las tarjetas
   de selección tengan la misma altura, sin importar la forma de la tirada.
   ========================================================================== */

/** Ancho de cada carta del diagrama, en % del marco, según cantidad. */
function miniCardWidth(count: number): number {
  if (count === 1) return 16;
  if (count <= 3) return 13;
  if (count <= 6) return 11;
  if (count <= 9) return 9;
  return 8;
}

export default function SpreadMini({
  positions,
  className = '',
}: {
  positions: SpreadPosition[];
  className?: string;
}) {
  const width = miniCardWidth(positions.length);

  return (
    <div
      className={`relative w-full ${className}`}
      style={{ aspectRatio: '16 / 10' }}
      aria-hidden="true"
    >
      {positions.map((pos, i) => (
        <span
          key={pos.id}
          className="absolute rounded-[2px] border border-gold-300/60 bg-gold-300/15 transition-all duration-500 group-hover:border-gold-200 group-hover:bg-gold-200/30 group-hover:shadow-[0_0_10px_rgba(232,205,138,0.5)]"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            width: `${width}%`,
            aspectRatio: '2 / 3',
            transform: `translate(-50%, -50%) rotate(${pos.rotate ?? 0}deg)`,
            transitionDelay: `${i * 35}ms`,
          }}
        />
      ))}
    </div>
  );
}
