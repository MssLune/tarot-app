import type { DrawnCard, SpreadPosition, SystemId } from '../../types';
import type { ArcanaCard } from '@arcana/tarot-core';
import { urlDeArchivo } from '../../services/api';

/* ==========================================================================
   Mini-diagrama de una tirada: las cartas en las coordenadas reales.

   Antes dibujaba rectángulos dorados vacíos, porque no sabía qué carta había
   en cada posición. Con las imágenes cargadas conviene mostrar la miniatura de
   cada una: en el historial es lo que permite reconocer una lectura de un
   vistazo, sin abrirla.

   Se mantiene el marco de proporción fija (16/10) para que todas las miniaturas
   tengan la misma altura, sin importar la forma de la tirada. Sin esto, una
   tirada de 3 posiciones y otra de 10 se ven con cartas de tamaños distintos.
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
  /** Las cartas ya colocadas, si las hay. Sin esto salen los marcos vacíos. */
  cards,
  cardsById,
  system = 'rider-waite',
  className = '',
}: {
  positions: SpreadPosition[];
  cards?: DrawnCard[];
  cardsById?: Record<string, ArcanaCard>;
  system?: SystemId;
  className?: string;
}) {
  const width = miniCardWidth(positions.length);

  const imagenDe = (pos: SpreadPosition): string | null => {
    if (!cards || !cardsById) return null;
    /* Sólo el mazo del Rider-Waite tiene imágenes servidas por el backend. Un
       mazo propio vuelve a los marcos: no hay de dónde sacar el archivo, aunque
       por un error de datos quede un `arcanaId` puesto. */
    if (system !== 'rider-waite') return null;
    const puesta = cards.find((c) => c.positionId === pos.id);
    if (!puesta?.arcanaId) return null;
    /* La URL viene del backend como ruta relativa. Sin volverla absoluta, el
       navegador la pide al servidor de la PÁGINA y da 404. */
    return urlDeArchivo(cardsById[puesta.arcanaId]?.imageUrl) ?? null;
  };

  return (
    <div
      className={`relative w-full ${className}`}
      style={{ aspectRatio: '16 / 10' }}
      aria-hidden="true"
    >
      {positions.map((pos, i) => {
        const imagen = imagenDe(pos);
        const invertida = cards?.find((c) => c.positionId === pos.id)?.reversed ?? false;
        return (
          <span
            key={pos.id}
            className="absolute overflow-hidden rounded-[2px] border border-gold-300/60 bg-gold-300/15 transition-all duration-500 group-hover:border-gold-200 group-hover:shadow-[0_0_10px_rgba(232,205,138,0.5)]"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: `${width}%`,
              aspectRatio: '2 / 3',
              transform: `translate(-50%, -50%) rotate(${pos.rotate ?? 0}deg)`,
              transitionDelay: `${i * 35}ms`,
            }}
          >
            {imagen ? (
              <img
                src={imagen}
                alt=""
                loading="lazy"
                draggable={false}
                /* La invertida se gira en la miniatura también, como en la
                   carta y en el PDF: es la misma convención en todos lados. */
                style={{ transform: invertida ? 'rotate(180deg)' : undefined }}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="block h-full w-full bg-gold-300/15 group-hover:bg-gold-200/30" />
            )}
          </span>
        );
      })}
    </div>
  );
}
