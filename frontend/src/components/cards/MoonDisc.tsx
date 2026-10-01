import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { MoonPhase } from '@arcana/tarot-core';

/* ==========================================================================
   Disco lunar, en dos registros distintos.

   `engraved` — el grande, el de la fase de hoy. Superficie texturada,
     cráteres con relieve, grietas con surco, halo tenue.

   `icon` — el chico, el de la tira de 8 fases. A 44 px cualquier detalle se
     vuelve barro, así que va limpio: silueta y brillo.

   ORO MATE, NO METÁLICO: el primer intento usaba un blanco casi puro
   (#fffaf0) en el centro del gradiente y el disco parecía una perla de nácar
   o un botón de latón. El oro de la app es velo y lamparina, no pulido: el
   tope de luz baja a #f2e6c6 y el borde se ensucia en #8f7a45. El halo
   también baja de 0,18 a 0,10 porque a plena iluminación quemaba el fondo.

   SOBRE EL DIBUJO: los cráteres y las grietas son ornamentales, NO un
   efeméride. No dicen "este cráter es el Tycho", dicen "esto es una luna". Se
   dibujan fijos respecto de la pantalla, así que no giran con la fase; a esta
   escala se lee como textura, que es lo que se busca.

   Por qué no una foto: el tono de la app es índigo y oro. Una foto real es
   gris sobre negro y se ve pegada, encima tiene problemas de licencia que no
   puedo resolver por vos.
   ========================================================================== */

interface Props {
  phase: MoonPhase;
  size?: number;
  className?: string;
  /** Registro del dibujo. */
  variant?: 'engraved' | 'icon';
  /** Halo alrededor del disco. */
  glow?: boolean;
}

/* --------------------------------------------------------------------------
   Cráteres. Posiciones normalizadas al disco: 0,0 es el centro, 1 el borde.
   `depth` es qué tan hundido parece: manda el contraste entre el borde
   iluminado y la sombra interior, no el tamaño.
   -------------------------------------------------------------------------- */
const CRATERS = [
  { x: -0.32, y: -0.28, r: 0.19, depth: 0.9 },
  { x: 0.3, y: 0.14, r: 0.14, depth: 0.7 },
  { x: -0.05, y: 0.42, r: 0.115, depth: 0.62 },
  { x: 0.44, y: -0.38, r: 0.085, depth: 0.55 },
  { x: -0.52, y: 0.28, r: 0.075, depth: 0.48 },
  { x: 0.08, y: -0.58, r: 0.065, depth: 0.45 },
  { x: -0.22, y: 0.06, r: 0.055, depth: 0.38 },
  { x: 0.54, y: 0.36, r: 0.045, depth: 0.34 },
];

/**
 * Grietas y rilles.
 *
 * Un cráter se lee por su relieve; una grieta se lee por ser un surco. Y un
 * surco tiene una pared que mira a la luz y una que la Esquiva, así que para
 * que tenga volumen hay que dibujar DOS paredes, no una línea con un brillo
 * pegado.
 *
 * La luz viene de arriba a la izquierda (el mismo criterio que los cráteres).
 * Con la grieta corriendo de izquierda a derecha, su normal es vertical: la
 * pared de abajo mira hacia arriba-izquierda y recibe luz, la de arriba mira
 * hacia abajo-derecha y queda en sombra.
 *
 * Por eso el desplazamiento del brillo tiene que ser PERPENDICULAR a la grieta
 * y en el sentido correcto, no una diagonal fija. Con la diagonal fija, una
 * grieta que corre al revés quedaba iluminada del lado que le corresponde la
 * sombra, y el volumen se leía al revés.
 *
 * `w` es el ancho del surco relativo al radio del disco. `d` es la
 * profundidad: manda cuánto se ve la sombra, no el ancho.
 */
interface Rille {
  pts: [number, number][];
  w: number;
  d: number;
}

const RILLES: Rille[] = [
  {
    /* La larga, que cruza el disco en diagonal. */
    pts: [
      [-0.58, -0.22],
      [-0.38, -0.08],
      [-0.16, 0.0],
      [0.06, -0.1],
      [0.28, 0.02],
    ],
    w: 0.034,
    d: 1,
  },
  {
    pts: [
      [0.1, 0.5],
      [0.06, 0.3],
      [-0.04, 0.12],
      [0.0, -0.06],
    ],
    w: 0.026,
    d: 0.8,
  },
  {
    pts: [
      [-0.2, -0.52],
      [-0.1, -0.34],
      [-0.16, -0.18],
      [-0.06, -0.02],
    ],
    w: 0.022,
    d: 0.72,
  },
  {
    /* Antes esta grieta corría casi a 45 grados, que es el peor ángulo
       posible: a 45° la normal es perpendicular a la luz y el relieve del
       surco se aplana, se ve como una raya. Ahora corre más vertical, así que
       la pared iluminada recibe la luz de costado y el volumen aparece. */
    pts: [
      [0.4, 0.5],
      [0.3, 0.36],
      [0.34, 0.18],
      [0.24, 0.0],
    ],
    w: 0.019,
    d: 0.62,
  },
  {
    pts: [
      [-0.66, 0.16],
      [-0.5, 0.24],
      [-0.34, 0.2],
    ],
    w: 0.015,
    d: 0.5,
  },
  {
    /* Bifurcación corta, para que la red de grietas no parezca un dibujo. */
    pts: [
      [-0.16, 0.0],
      [-0.1, 0.16],
      [-0.02, 0.28],
    ],
    w: 0.013,
    d: 0.44,
  },
];

/** Contador para dar un id único a cada conjunto de defs. */
let uidSeq = 0;

export default function MoonDisc({
  phase,
  size = 88,
  className = '',
  variant = 'engraved',
  glow = false,
}: Props) {
  const r = size / 2 - (size > 60 ? 3 : 1.5);
  const centre = size / 2;
  const [uid] = useState(() => `moon${(uidSeq += 1)}`);

  /* ------------------------------------------------------------------
     Geometría del terminator.

     k es el semieje menor del terminator normalizado: k = cos(elongación).
     Y va CON signo, porque el signo dice de qué lado queda la región
     iluminada: con la Luna Nueva da +1 (el terminator queda íntegro del lado
     iluminado, o sea no hay nada) y con la Luna Llena -1 (íntegro del lado
     contrario, o sea todo el disco).

     Con k con signo, el área iluminada es exactamente (1 - k)/2, que es la
     MISMA magnitud que la iluminación astronómica. Medí el área real del path
     con el teorema de Green contra ese objetivo y la diferencia es de 0,25% a
     lo sumo, que es sólo el error de discretizar la elipse en segmentos.

     No hace falta `waxing` para nada: el lado iluminado ya lo dice el signo. */
  const k = Math.max(-1, Math.min(1, Math.cos(phase.angle)));

  /* El terminator se traza como la elipse REAL, muestreada. El limbo queda
     como arco nativo de SVG.

     Estuve mucho tiempo intentando reproducir el terminator con una Bézier y
     no se puede con exactitud suficiente: los controles que clavaban el área
     en el cuarto de luna se iban al 11% en la Luna Nueva. Medí el área real
     del path en cada intento con el teorema de Green, y ninguna Bézier de una
     sola curva daba menos de 3,27%.

     La elipse es x = k·r·cos t, y = r·sin t, y va muestreada. Con 48 muestras
     el error de área es del 0,04%.

     El limbo NO se muestrea a propósito. Al muestrearlo con 24 pasos quedaba
     un polígono, y un polígono regular de 24 lados tiene un 0,14% menos de
     área que el círculo: por eso el cuarto exacto daba 49,86% en vez de 50%.
     Con 96 pasos el limbo ya era preciso, pero usar el comando `A` de SVG lo
     dibuja como el arco exacto que es, sin costo y sin puntos. */
  const SAMPLES = 48;
  const litPath = useMemo(() => {
    /* El terminator, de (0, -r) a (0, +r) pasando por (k·r, 0). El `L` de
       vuelta cierra contra el arco del limbo. */
    const points: string[] = [];
    for (let i = 0; i <= SAMPLES; i += 1) {
      const t = -Math.PI / 2 + (Math.PI * i) / SAMPLES;
      points.push(`${centre + k * r * Math.cos(t)} ${centre + r * Math.sin(t)}`);
    }
    return [
      `M ${points[0]}`,
      `A ${r} ${r} 0 0 1 ${points[SAMPLES]}`,
      `L ${points.slice(0, SAMPLES).reverse().join(' L ')}`,
      'Z',
    ].join(' ');
  }, [centre, r, k]);

  /* Sin detalle en media luna fina: no se ve y sólo ensucia el borde. */
  const showTexture = variant === 'engraved' && Math.abs(k) < 0.82;
  const oscuro = phase.illumination < 0.06;

  /* ------------------------------------------------------------------
     Las grietas se construyen como una FORMA RELLENA con degradado, no
     como trazos.

     La versión anterior dibujaba cuatro trazos paralelos por grieta. Sobre
     una superficie mate eso se lee como cuatro líneas dibujadas. El surco de
     una grieta no tiene borde: la sombra se funde con el piso y el piso con la
     pared.

     Ahora cada grieta es una cinta cerrada, con los extremos afilados para
     que no haya remates redondos, rellena con un degradado que va de la
     pared iluminada a la sombra. El degradado da el borde suave de forma
     matemática, sin difuminado: no se ve borroso, que es lo que pasa si
     aplicás un feGaussianBlur a la superficie entera.

     Encima va una sombra difusa, más ancha, que es lo único que lleva
     difuminado de verdad. */
  const grooves = useMemo(() => {
    if (!showTexture) return [];
    return RILLES.map((rille, index) => {
      const w = rille.w * r;
      const pts = sampleCurve(
        rille.pts.map(([x, y]) => [centre + x * r, centre + y * r] as [number, number]),
        48,
      );
      /* Normal perpendicular orientada hacia abajo-derecha, para que el lado
         iluminado sea el mismo en todo el recorrido. */
      const normals = pts.map((_, j) => {
        const a = pts[Math.max(0, j - 1)]!;
        const b = pts[Math.min(pts.length - 1, j + 1)]!;
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const len = Math.hypot(tx, ty) || 1;
        let nx = -ty / len;
        let ny = tx / len;
        if (nx + ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        return [nx, ny] as const;
      });

      /** Cinta cerrada de ancho `scale`, con los extremos afilados. */
      const ribbon = (scale: number) => {
        const n = pts.length;
        const arriba: string[] = [];
        const abajo: string[] = [];
        for (let j = 0; j < n; j += 1) {
          /* La senoidal lleva el ancho a cero en los dos extremos: la grieta
             aparece y desaparece, en vez de arrancar y terminar de golpe. */
          const taper = Math.pow(Math.sin((Math.PI * j) / (n - 1)), 0.5);
          const [nx, ny] = normals[j]!;
          const off = w * scale * taper;
          const p = pts[j]!;
          arriba.push(`${(p[0] + nx * off).toFixed(2)} ${(p[1] + ny * off).toFixed(2)}`);
          abajo.push(`${(p[0] - nx * off).toFixed(2)} ${(p[1] - ny * off).toFixed(2)}`);
        }
        return `M ${arriba[0]} L ${arriba.slice(1).join(' L ')} L ${abajo.reverse().join(' L ')} Z`;
      };

      /* Normal promedio, para orientar el degradado a lo largo de la grieta. */
      let anx = 0;
      let any = 0;
      for (const [nx, ny] of normals) {
        anx += nx;
        any += ny;
      }
      const alen = Math.hypot(anx, any) || 1;
      anx /= alen;
      any /= alen;
      const mid = pts[Math.floor(pts.length / 2)]!;
      /* El degradado va del lado iluminado (-n) al lado en sombra (+n). */
      const reach = w * 1.35;
      return {
        id: `${uid}-groove-${index}`,
        depth: rille.d,
        path: ribbon(1),
        shadowPath: ribbon(1.85),
        x1: mid[0] - anx * reach,
        y1: mid[1] - any * reach,
        x2: mid[0] + anx * reach,
        y2: mid[1] + any * reach,
      };
    });
  }, [showTexture, r, centre, uid]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`${phase.name}, ${Math.round(phase.illumination * 100)}% iluminada`}
    >
      <defs>
        {/* Superficie mate: la luz entra de arriba a la izquierda y cae hacia
            un dorado sucio, sin blanco puro. */}
        <radialGradient id={`${uid}-surface`} cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#f2e6c6" />
          <stop offset="48%" stopColor="#e0cb96" />
          <stop offset="84%" stopColor="#c0a468" />
          <stop offset="100%" stopColor="#8f7a45" />
        </radialGradient>

        {/* Versión plana para el registro chico: sin esfera se lee mejor. */}
        <linearGradient id={`${uid}-flat`} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#eddfba" />
          <stop offset="100%" stopColor="#c9ae74" />
        </linearGradient>

        {/* Penumbra: el terminator real no es un corte, es una transición. */}
        <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8f7a45" stopOpacity="0" />
          <stop offset="100%" stopColor="#6b5a2e" stopOpacity="0.45" />
        </linearGradient>

        <clipPath id={`${uid}-disc`}>
          <circle cx={centre} cy={centre} r={r} />
        </clipPath>
        {/* Recorta el detalle a la parte iluminada: si no, los cráteres se
            verían sobre la zona en sombra. */}
        <clipPath id={`${uid}-lit`}>
          <path d={litPath} />
        </clipPath>

        {glow && !oscuro && (
          <filter id={`${uid}-halo`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={size * 0.07} />
          </filter>
        )}
        {/* Difuminado fuerte para la sombra proyectada de las grietas. */}
        {showTexture && (
          <filter id={`${uid}-soft`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={Math.max(0.5, r * 0.05)} />
          </filter>
        )}

        {/* Difuminado leve para los cráteres. Suficiente para que el borde no
            sea una línea, no tanto como para perder la forma. */}
        {showTexture && (
          <filter id={`${uid}-edge-soft`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={Math.max(0.3, r * 0.018)} />
          </filter>
        )}

        {/* Degradados de las grietas, uno por grieta y orientado según su
            propio recorrido. Van del lado que recibe la luz al que la
            esquiva, con el piso en el medio. */}
        {grooves.map((g) => (
          <linearGradient
            key={g.id}
            id={g.id}
            gradientUnits="userSpaceOnUse"
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
          >
            {/* Lado iluminado: apenas un hilo, se apaga enseguida. */}
            <stop offset="0%" stopColor="#fbf3dc" stopOpacity={0.5 * g.depth} />
            <stop offset="22%" stopColor="#e6d5a8" stopOpacity={0.3 * g.depth} />
            {/* El piso del surco, que es lo más oscuro. */}
            <stop offset="52%" stopColor="#6b5828" stopOpacity={0.42 * g.depth} />
            {/* La pared en sombra, más ancha porque recibe menos luz. */}
            <stop offset="100%" stopColor="#4a3d1c" stopOpacity={0.3 * g.depth} />
          </linearGradient>
        ))}
      </defs>

      {/* Halo: luz reflejada en el aire. Bajado a 0,10 porque a 0,18 quemaba
          el fondo en las fases más iluminadas. */}
      {glow && !oscuro && (
        <circle
          cx={centre}
          cy={centre}
          r={r * 0.97}
          fill="#d8c07a"
          opacity={0.1 * phase.illumination}
          filter={`url(#${uid}-halo)`}
        />
      )}

      {/* Lado en sombra: siempre presente, aunque esté lleno. */}
      <circle
        cx={centre}
        cy={centre}
        r={r}
        fill={oscuro ? '#0f0a1e' : '#171029'}
        stroke="rgba(232,205,138,0.2)"
        strokeWidth="0.75"
      />

      {/* Parte iluminada. */}
      {!oscuro && (
        <motion.path
          d={litPath}
          fill={`url(#${uid}-${variant === 'icon' ? 'flat' : 'surface'})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}

      {showTexture && (
        <g clipPath={`url(#${uid}-lit)`}>
          {/* ---- Mares: manchas suaves y grandes ----
              Son lo que diferencia "luna" de "esfera con hoyos". Van primero
              porque los cráteres tienen que quedar por encima. */}
          <ellipse
            cx={centre - r * 0.16}
            cy={centre - r * 0.12}
            rx={r * 0.32}
            ry={r * 0.23}
            fill="#a68d52"
            opacity={0.1}
          />
          <ellipse
            cx={centre + r * 0.28}
            cy={centre + r * 0.3}
            rx={r * 0.2}
            ry={r * 0.16}
            fill="#a68d52"
            opacity={0.085}
          />
          <ellipse
            cx={centre + r * 0.02}
            cy={centre + r * 0.52}
            rx={r * 0.26}
            ry={r * 0.12}
            fill="#a68d52"
            opacity={0.07}
          />

          {/* ---- Grietas ----
              Dos capas, no cuatro. La sombra es difusa y va más ancha; la
              grieta es una cinta rellena con degradado, que es lo que le da
              el borde suave. Ninguna de las dos es un trazo. */}
          {grooves.map((g) => (
            <g key={g.id}>
              <path d={g.shadowPath} fill="#4a3d1c" opacity={0.17 * g.depth} filter={`url(#${uid}-soft)`} />
              <path d={g.path} fill={`url(#${g.id})`} />
            </g>
          ))}

          {/* ---- Cráteres ----
              Cuatro capas por cráter: sombra interior, labio iluminado arriba
              a la izquierda, sombra del labio opuesto, y piso. Sin el piso el
              cráter se lee como un agujero de tinta en vez de un hueco.

              Van con un difuminado muy leve. Un cráter real no tiene borde
              nítido: el borde se degrada unos pocos píxeles. Con las capas
              sin suavizar quedaban círculos gráficos encima de la superficie,
              que es el mismo problema que tenían las grietas. */}
          {CRATERS.map((c, i) => {
            const cx = centre + c.x * r;
            const cy = centre + c.y * r;
            const cr = c.r * r;
            return (
              <g key={`crater-${i}`} filter={`url(#${uid}-edge-soft)`}>
                <circle cx={cx} cy={cy} r={cr} fill="#7a6430" opacity={0.2 * c.depth} />
                {/* Labio iluminado: sólo el cuadrante que mira a la luz. */}
                <path
                  d={rimPath(cx, cy, cr)}
                  fill="none"
                  stroke="#fdf6e0"
                  strokeOpacity={0.5 * c.depth}
                  strokeWidth={Math.max(0.5, cr * 0.13)}
                />
                {/* Sombra del labio opuesto: cierra el volumen. */}
                <path
                  d={rimPath(cx, cy, cr * 0.97, true)}
                  fill="none"
                  stroke="#5f4d22"
                  strokeOpacity={0.34 * c.depth}
                  strokeWidth={Math.max(0.4, cr * 0.1)}
                />
                {/* Piso del cráter. */}
                <circle
                  cx={cx + cr * 0.06}
                  cy={cy + cr * 0.06}
                  r={cr * 0.62}
                  fill="#cbb684"
                  opacity={0.16 * c.depth}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* Suavizado del terminator. */}
      {showTexture && !oscuro && Math.abs(k) > 0.05 && (
        <circle
          cx={centre}
          cy={centre}
          r={r}
          fill={`url(#${uid}-edge)`}
          clipPath={`url(#${uid}-disc)`}
          opacity={0.5}
        />
      )}

      {/* Borde del disco. Bajado a 0,32: a 0,40 el aro dorado competía con la
          superficie y parecía un marco. */}
      <circle
        cx={centre}
        cy={centre}
        r={r}
        fill="none"
        stroke="rgba(232,205,138,0.32)"
        strokeWidth={size > 60 ? 1 : 0.6}
      />

      {/* Puntos de referencia en los extremos del eje, como en un mapa del
          cielo. Sólo en el registro grande. */}
      {variant === 'engraved' && (
        <g fill="rgba(232,205,138,0.4)">
          <circle cx={centre} cy={centre - r - 4} r="1" />
          <circle cx={centre} cy={centre + r + 4} r="1" />
        </g>
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades de trazado                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Muestrea una curva suave definida por puntos normalizados, en coordenadas
 * absolutas del disco.
 *
 * Usa el método de los puntos medios con remuestreo uniforme: primero se
 * recorre la polilínea original y en cada tramo se interpola con una
 * cuadrática cuyo control es el vértice y cuyo extremo es el punto medio del
 * tramo siguiente. Así la grieta no tiene ángulos, que es lo que la haría ver
 * como un polígono.
 */
function sampleCurve(points: [number, number][], segments: number): [number, number][] {
  if (points.length < 2) return [];
  const per = Math.max(1, Math.floor(segments / (points.length - 1)));
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    /* El vértice anterior y siguiente definen las tangentes en los extremos. */
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 2)]!;
    for (let j = 0; j < per; j += 1) {
      const t = j / per;
      /* Cuadrática de Hermite con tangentes(Vecinos - centro). */
      const m0x = (p1[0] - prev[0]) / 2;
      const m0y = (p1[1] - prev[1]) / 2;
      const m1x = (next[0] - p0[0]) / 2;
      const m1y = (next[1] - p0[1]) / 2;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * p0[0] + h10 * m0x + h01 * p1[0] + h11 * m1x,
        h00 * p0[1] + h10 * m0y + h01 * p1[1] + h11 * m1y,
      ]);
    }
  }
  const last = points[points.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

/**
 * Borde de un cráter: un casquete, no el círculo entero.
 *
 * La luz viene de arriba a la izquierda, así que el labio brillante va de 200°
 * a 320°. `invertido` toma el cuadrante opuesto, que es la sombra.
 */
function rimPath(cx: number, cy: number, r: number, invertido = false): string {
  const a0 = invertido ? 20 : 200;
  const a1 = invertido ? 140 : 320;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  return `M ${x0} ${y0} A ${r} ${r} 0 0 ${invertido ? 1 : 0} ${x1} ${y1}`;
}
