import { useState } from 'react';
import { motion } from 'framer-motion';
import { moonDiscSvg, PALETA } from './moonDiscSvg';

/* ==========================================================================
   Disco lunar.

   ENVUELVE, NO DIBUJA. Toda la geometría y el markup viven en `moonDiscSvg`,
   que es una función pura y devuelve un string. Acá no se calcula nada.

   Por qué un string y no elementos de React: hay una herramienta que
   rasteriza ese mismo string a PNG para poder mirarlo
   (`herramientas/renderLuna.ts`). Si el componente dibujara con JSX aparte,
   habría dos implementations y la herramienta podría estar mostrando una
   cosa y la pantalla otra, sin que nada se quejara. Con un solo origen no hay
   forma de que divergan.

   `dangerouslySetInnerHTML` suena peor de lo que es acá: el string lo genera
   este mismo módulo, sin nada que venga del usuario. No hay entrada externa
   que pueda inyectar.

   CADA INSTANCIA NECESITA SU `uid`: los ids de los `<defs>` (`url(#luna-oro)`)
   son globales al documento. Con dos discos en la misma pantalla, sin
   distinguishse, el segundo usaría el degradado del primero — y si uno está
   en Luna Nueva y el otro en Llena, se vería el disco entero del color que
   tocara.
   ========================================================================== */

/**
 * Lo mínimo que el disco necesita para dibujarse.
 *
 * Antes era `MoonPhase` entera, pero el calendario pinta la Luna de un día
 * suelto y no tiene (ni necesita) un id de fase ni una nota: sólo el ángulo y
 * la fracción iluminada. Tiparlo como `MoonPhase` obligaba a fabricar un
 * objeto entero con datos inventados para poder pintar una celda.
 */
export interface MoonLook {
  /** Ángulo dentro del ciclo, de 0 a 2π. 0 es Luna Nueva. */
  angle: number;
  /** Fracción iluminada, de 0 a 1. */
  illumination: number;
  /** Nombre, sólo para el `aria-label`. */
  name?: string;
}

interface Props {
  phase: MoonLook;
  size?: number;
  className?: string;
  /**
   * Registro del dibujo. Ya no hay dos registros dibujados: el detalle de los
   * cráteres se apaga solo en los tamaños chicos, que es donde estorba.
   */
  variant?: 'engraved' | 'icon';
  /** Halo alrededor del disco. */
  glow?: boolean;
  /**
   * Animar la entrada.
   *
   * `false` en el calendario, y no por pereza: la grilla pone entre 35 y 42
   * celdas, o sea 42 animaciones simultáneas de opacidad y escala cada vez que
   * se entra a la pantalla. Sube por la boca y se ve como un fogonazo. La
   * página ya tiene su propia transición; los 42 discos girando además son
   * ruido.
   */
  animate?: boolean;
}

/** Contador para dar un id único a cada conjunto de defs. */
let uidSeq = 0;

export default function MoonDisc({
  phase,
  size = 88,
  className = '',
  variant = 'engraved',
  glow = false,
  animate = true,
}: Props) {
  const [uid] = useState(() => `luna${(uidSeq += 1)}`);

  /* El detalle se corta por tamaño, no por `variant`. La razón es que la
     banda de "cráter invisible" depende de los píxeles, no de la intención:
     los mismos cráteres que a 168 px se leen como superficie, a 20 px son
     manchas grises que ensucian el disco. Medido mirando la hoja de
     contacto: con detalle a 20 px la Luna Creciente es un borrón. */
  const detalle = variant === 'engraved' || size >= 44;

  const svg = moonDiscSvg({
    size,
    angle: phase.angle,
    illumination: phase.illumination,
    detail: detalle,
    glow,
    uid,
  });

  const etiqueta = phase.name
    ? `${phase.name}, ${Math.round(phase.illumination * 100)}% iluminada`
    : `Luna ${Math.round(phase.illumination * 100)}% iluminada`;

  return (
    <motion.span
      className={`inline-flex ${className}`}
      /* `initial={false}` cuando no anima. Con `initial` posto, un elemento
         sin animación queda en opacidad 0 si la animación no corre nunca, que
         es justo el modo de fallo que se estaba viendo. */
      initial={animate ? { opacity: 0 } : false}
      animate={animate ? { opacity: 1 } : undefined}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ width: size, height: size, color: PALETA.oroCentro }}
      role="img"
      aria-label={etiqueta}
    >
      <span className="block h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </motion.span>
  );
}