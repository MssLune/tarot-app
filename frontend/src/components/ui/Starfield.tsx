import { useMemo } from 'react';

/* ==========================================================================
   Fondo estelar decorativo.
   Genera estrellas con posiciones deterministas (memoizadas) para que no
   "salten" en cada render, más dos nebulosas suaves y un anillo zodiacal.
   ========================================================================== */

interface Star {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

/** PRNG simple con semilla: mismas estrellas en cada sesión. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export default function Starfield({ density = 70 }: { density?: number }) {
  const stars = useMemo<Star[]>(() => {
    const rand = seededRandom(20240517);
    return Array.from({ length: density }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      size: 1 + rand() * 2.2,
      delay: rand() * 6,
      duration: 3 + rand() * 5,
      opacity: 0.25 + rand() * 0.6,
    }));
  }, [density]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* Nebulosas suaves */}
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-mystic-600/20 blur-[120px] animate-pulse-glow" />
      <div className="absolute -right-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-gold-600/10 blur-[130px] animate-pulse-glow" />
      <div className="absolute bottom-0 left-1/4 h-[26rem] w-[26rem] rounded-full bg-mystic-700/20 blur-[140px]" />

      {/* Anillo zodiacal girando muy lento */}
      <div className="absolute left-1/2 top-1/2 hidden h-[52rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 animate-spin-slow sm:block">
        <div className="h-full w-full rounded-full border border-gold-400/[0.07]" />
        <div className="absolute inset-16 rounded-full border border-gold-400/[0.05]" />
        <div className="absolute inset-32 rounded-full border border-dashed border-gold-400/[0.04]" />
      </div>

      {/* Estrellas */}
      {stars.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-gold-100 animate-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
            boxShadow: '0 0 6px rgba(251, 243, 220, 0.8)',
          }}
        />
      ))}

      {/* Viñeta inferior para asentar el contenido */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}
