/* ==========================================================================
   La Luna, como SVG. Función pura: sin React, sin estado, sin `useMemo`.

   Por qué separada del componente: porque así se puede renderizar fuera del
   browser. `herramientas/renderLuna.ts` genera los ocho discos y los convierte
   a PNG con sharp, y ahí se los MIRA. Es la única forma de verificar una
   decisión visual sin abrir la app, y sin esto cualquier cambio de color o de
   forma es un acto de fe.

   EL ESTILO
   ----------
   Las fotos de referencia tienen cuatro cosas que el vector anterior no:

   1. El lado en sombra es un DISCO, no medio disco. Se ve entero, con sus
      cráteres, apenas más apagado. Eso es lo que lo hace leer como una luna y
      no como un semicírculo pintado. Antes el lado en sombra era un relleno
      plano y vacío.

   2. Los cráteres son manchas orgánicas, con lóbulos. Círculos perfectos se
      leen como hoyos de patrón, no como cráteres.

   3. Sin brillo. Ni halo, ni degradado fuerte, ni grietas. Plano.

   4. Poco contraste. La diferencia entre la parte iluminada y la en sombra la
      hace la transparencia de un velo oscuro encima, no un borde duro.

   Eso último va en contra de "grabado", pero el proyecto pidió en su momento
   oro mate y "más opaco": menos brillo es justo lo que se pidió. Se conserva
   el material, se cambia el brillo.
   ========================================================================== */

/** Paleta. Oro mate, con el lado en sombra tirado al índigo de la app. */
export const PALETA = {
  /** Borde exterior de la parte iluminada: el dorado más apagado. */
  oroBorde: '#c9b078',
  /** Centro de la parte iluminada: crema, sin blanco. */
  oroCentro: '#eee2bd',
  /** Cráteres y mares sobre la parte iluminada: un gris dorado. */
  crater: '#a08c5e',
  /** Velo que baja la parte en sombra. */
  sombra: '#191230',
  /**
   * Qué tan fuerte baja la sombra.
   *
   * A 0,80 el lado en sombra quedaba liso: los cráteres disappearían. En la
   * foto de referencia se ven, tenue pero presentes, que es lo que hace que
   * el lado oscuro siga siendo una luna y no un recorte. 0,64 los deja
   * apenas y todavía separa bien los dos lados.
   */
  fuerzaSombra: 0.64,
} as const;

export interface MoonSvgOptions {
  /** Lado del cuadrado, en píxeles. */
  size: number;
  /** Ángulo dentro del ciclo, de 0 a 2π. 0 es Luna Nueva. */
  angle: number;
  /** Fracción iluminada, de 0 a 1. */
  illumination: number;
  /**
   * Detalle fino. El registro grande lo prende; el del calendario, no: a
   * 20 px un cráter de lóbulos es ruido y sólo se ve el bouncing.
   */
  detail?: boolean;
  /** Halo alrededor del disco. */
  glow?: boolean;
  /** Prefijo de los ids, para que dos svg en la misma página no choquen. */
  uid?: string;
}

/* --------------------------------------------------------------------------
   Geometría del terminador
   -------------------------------------------------------------------------- */

/**
 * `k` es el semieje menor del terminador, con signo, y el signo dice de qué
 * lado queda lo iluminado.
 *
 * Con signo el área iluminada es exactamente (1 − k)/2, la misma magnitud que
 * la iluminación astronómica: con `k = cos(elongación)` no hace falta calcular
 * una cosa y aparte la otra, ni pueden discrepar.
 *
 * El terminador se traza como la elipse REAL muestreada, no como una Bézier.
 * Una Bézier de una sola curva clavaba el área en el cuarto de luna y se
 * iba al 11% en la Luna Nueva, midiendo el área real con el teorema de
 * Green. La elipse muestreada con 48 puntos da 0,04%.
 *
 * El limbo NO se muestrea: el comando `A` de SVG lo dibuja como el arco
 * exacto. Muestreado con 24 pasos quedaba un polígono, y un polígono regular
 * de 24 lados tiene 0,14% menos de área que el círculo, por lo que el cuarto
 * exacto daba 49,86% en vez de 50%.
 */
export const MUESTRAS_TERMINADOR = 48;

/**
 * Camino de la región iluminada.
 *
 * `waxing` hace falta y no es un detalle. El abombamiento del terminador
 * depende de `k = cos(elongación)`, y el coseno es SIMÉTRICO: la creciente
 * fina y la balsema fina tienen el mismo `k` y darían la misma figura. Sólo
 * `k` no alcanza, y la Luna Menguante salía idéntica a la Creciente.
 *
 * El lado iluminado lo decide `sin(elongación)`: positivo entre la Luna Nueva
 * y la Llena (derecha, en el hemisferio norte), negativo después (izquierda).
 *
 * Reflejar es cambiar las dos cosas a la vez: el signo del semieje Y el del
 * arco. Cambiar sólo una deja la figura con el área correcta pero del lado
 * equivocado, que es el peor error posible: se ve "casi bien" y no es nada.
 *
 *   creciente  → semieje +k, arco sweep 1  (derecha)
 *   menguante  → semieje −k, arco sweep 0  (izquierda)
 *
 * Las dos combinaciones se midieron rasterizando el path y contando píxeles.
 */
export function caminoIluminado(
  centre: number,
  r: number,
  k: number,
  waxing = true,
): string {
  const signo = waxing ? 1 : -1;
  const sweep = waxing ? 1 : 0;

  const puntos: string[] = [];
  for (let i = 0; i <= MUESTRAS_TERMINADOR; i += 1) {
    const t = -Math.PI / 2 + (Math.PI * i) / MUESTRAS_TERMINADOR;
    puntos.push(`${centre + signo * k * r * Math.cos(t)} ${centre + r * Math.sin(t)}`);
  }
  /* El arco de vuelta va por el lado ILUMINADO, y para la Luna Creciente
     ese lado es el derecho.
     sweep = 0, no 1. En SVG la y baja, así que sweep = 1 es sentido horario:
     del punto inferior (0, r) al superior (0, −r) pasando por la IZQUIERDA,
     porque de las seis se gira a las nueve. Con sweep = 1 el lado iluminado
     queda del lado equivocado y la Luna Nueva muestra un arco dorado en
     lugar de estar oscura: un disco lleno más un velo que no tapa el resto.
     Con sweep = 0 el arco pasa por la derecha y, en Luna Nueva (k = 1), el
     terminador y el arco recorren la misma mitad y el área da cero. */
  return [
    `M ${puntos[0]}`,
    `A ${r} ${r} 0 0 ${sweep} ${puntos[MUESTRAS_TERMINADOR]}`,
    `L ${puntos.slice(0, MUESTRAS_TERMINADOR).reverse().join(' L ')}`,
    'Z',
  ].join(' ');
}

/* --------------------------------------------------------------------------
   Cráteres: manchas orgánicas
   -------------------------------------------------------------------------- */

/**
 * Número "aleatorio" determinista en [0, 1) a partir de dos enteros.
 *
 * Determinista a propósito: los cráteres tienen que ser los mismos en cada
 * render. Un `Math.random` haría que la Luna cambiara de forma cada vez que
 * se abre la pantalla, y entre dos celdas del calendario dos lunas iguales
 * tendrían crateras distintos.
 */
function ruido(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Mancha cerrada con lóbulos, como un cráter real.
 *
 * Un cráter no es un círculo: tiene el borde deformado, y las deformaciones
 * vienen en escalas grandes. Tres armónicos alcanzan: uno de 3 lóbulos, uno
 * de 5 y uno de 7. Con uno solo se ve el "trilobulado" regular y se reconoce
 * como fórmula.
 *
 * `seed` fija la forma. Los dos armónicos de frequencies altas están
 * deliberately chicos (0,10 y 0,07) porque si no, a 20 px el borde se vuelve
 * serruchoso y un cráter chico termina siendo una mancha irreconocible.
 */
export function caminoMancha(
  cx: number,
  cy: number,
  R: number,
  seed: number,
  puntos = 26,
): string {
  const partes: string[] = [];
  for (let i = 0; i <= puntos; i += 1) {
    const a = (i / puntos) * Math.PI * 2;
    const r =
      R *
      (1 +
        0.17 * Math.sin(3 * a + ruido(seed, 1) * 6.28) +
        0.11 * Math.sin(5 * a + ruido(seed, 2) * 6.28) +
        0.07 * Math.sin(7 * a + ruido(seed, 3) * 6.28));
    partes.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${partes[0]} L ${partes.slice(1).join(' L ')} Z`;
}

interface Crater {
  /** Posición relativa al centro, de -1 a 1. */
  x: number;
  y: number;
  /** Radio relativo al disco. */
  r: number;
  /** Opacidad: los mares pesan más que un cráterito. */
  o: number;
  seed: number;
}

/**
 * Los cráteres y mares de un disco.
 *
 * Las posiciones y tamaños están puestos a ojo mirando la Luna Llena: los
 * mares (los manchones grandes y oscuros) ocupan el hemisferio visible, que
 * es el que la cámara lunar vio siempre, y por eso del lado que mira a la
 * Tierra. No es un efeméride: es una composición que se lee como "luna".
 *
 * La Y va positiva hacia abajo porque la de pantalla es así, y porque en las
 * fotos de referencia el hemisferio visible está más cerca de arriba.
 */
const CRATERES: Crater[] = [
  // Mares: manchas grandes y suaves. Son lo que diferencia "luna" de "bola".
  { x: -0.18, y: -0.1, r: 0.3, o: 0.34, seed: 11 },
  { x: 0.22, y: 0.24, r: 0.21, o: 0.3, seed: 23 },
  { x: 0.0, y: 0.46, r: 0.16, o: 0.26, seed: 37 },
  { x: 0.3, y: -0.34, r: 0.15, o: 0.24, seed: 41 },
  { x: -0.34, y: 0.3, r: 0.13, o: 0.22, seed: 53 },
  // Cráteres medianos.
  { x: -0.5, y: -0.36, r: 0.115, o: 0.5, seed: 61 },
  { x: 0.52, y: 0.02, r: 0.1, o: 0.48, seed: 67 },
  { x: -0.28, y: 0.02, r: 0.095, o: 0.46, seed: 71 },
  { x: 0.06, y: -0.3, r: 0.085, o: 0.44, seed: 79 },
  { x: -0.46, y: 0.44, r: 0.075, o: 0.4, seed: 83 },
  { x: 0.42, y: 0.48, r: 0.065, o: 0.38, seed: 89 },
  { x: -0.04, y: 0.14, r: 0.06, o: 0.36, seed: 97 },
  // Chiquitajos, que son los que hacen que la superficie tenga grano.
  { x: 0.14, y: -0.58, r: 0.045, o: 0.34, seed: 101 },
  { x: -0.62, y: 0.12, r: 0.04, o: 0.32, seed: 103 },
  { x: 0.62, y: 0.34, r: 0.038, o: 0.3, seed: 107 },
  { x: -0.14, y: -0.56, r: 0.034, o: 0.28, seed: 109 },
  { x: 0.36, y: -0.06, r: 0.032, o: 0.26, seed: 113 },
  { x: -0.3, y: 0.58, r: 0.03, o: 0.24, seed: 127 },
  { x: 0.66, y: -0.24, r: 0.028, o: 0.22, seed: 131 },
];

/* --------------------------------------------------------------------------
   El SVG
   -------------------------------------------------------------------------- */

/**
 * El disco lunar completo, como string SVG.
 *
 * ORDEN DE CAPAS, que es lo que hace que la Luna Nueva no sea un agujero:
 *
 *   1. disco entero en dorado          → no hay nada negro debajo
 *   2. cráteres y mares sobre el dorado
 *   3. velo oscuro, ENMASCARADO a la parte en sombra
 *   4. filo del terminador
 *
 * El velo va en 3 y no en 1 porque al ir encima apaga también los cráteres de
 * la parte en sombra, en vez de taparlos. Ahí está la diferencia con la foto:
 * en la foto el lado en sombra es un disco con cráteres apenas visibles, no un
 * semicírculo limpio.
 */
export function moonDiscSvg({
  size,
  angle,
  illumination,
  detail = true,
  glow = false,
  uid = 'luna',
}: MoonSvgOptions): string {
  const centre = size / 2;
  const r = size / 2 - (size > 60 ? 2 : 1);
  const k = Math.max(-1, Math.min(1, Math.cos(angle)));
  /* `sin(elongación)`: positivo del reloj a la Luna Nueva hasta la Llena.
     El `>= 0` deja la Luna Llena del lado creciente, que da el disco entero
     igual de las dos maneras. */
  const waxing = Math.sin(angle) >= 0;
  const lit = caminoIluminado(centre, r, k, waxing);

  /* Luna Llena o Luna Nueva: no hay terminador que dibujar.
     OJO: esto NO puede decidir si se dibuja el velo. La Luna Nueva es
     precisamente el caso donde el velo tiene que taparlo TODO, y saltarse el
     velo ahí dejaba el disco entero dorado — una Luna Llena donde debía
     Luna Nueva—. La máscara de más abajo ya resuelve los dos extremos sola:
     en Luna Nueva el path iluminado tiene área cero y no tapa nada. */
  const sinTerminador = illumination < 0.012 || illumination > 0.995;

  /* El halo se apaga en Luna Nueva: un resplandor alrededor de un disco
     invisible se lee como un brillo sin luna. */
  const conHalo = glow && illumination > 0.02;

  const crateres = detail
    ? CRATERES.map((c) =>
        `<path d="${caminoMancha(centre + c.x * r, centre + c.y * r, c.r * r, c.seed)}" fill="${PALETA.crater}" opacity="${c.o}"/>`,
      ).join('')
    : '';

  /* El velo de sombra. La máscara deja pasar todo el disco y tapa justo la
     parte iluminada, que es la forma de restar sin construir un camino
     complementario: el complemento del iluminado NO se puede hacer con un
     segundo `A`, porque en la Luna Llena ambos caminos dan el disco entero. */
  const velo =
    illumination > 0.995
      ? ''
      : `<circle cx="${centre}" cy="${centre}" r="${r}" fill="${PALETA.sombra}" opacity="${PALETA.fuerzaSombra}" mask="url(#${uid}-sombra)"/>`;

  /* El filo del terminador: una línea apenas más oscura que el dorado. Sin
     ella el corte queda como tijera; con ella, como borde. */
  const filo = sinTerminador
    ? ''
    /* Filo FINO y a bawah opacidad. Con 0,55 y un trazo de 5% del radio
       quedaba un contorno dorado marcado, como una pegatina, y el corte se
       leía como dibujo y no como terminador. */
    : `<g clip-path="url(#${uid}-disco)"><path d="${lit}" fill="none" stroke="${PALETA.oroBorde}" stroke-width="${Math.max(0.5, r * 0.025)}" opacity="0.3"/></g>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs>`,
    /* Degradado muy suave. La app pidió oro mate y "más opaco": el centro y el
       borde están a un solo paso, así que la esfera no se lee como perla. */
    `<radialGradient id="${uid}-oro" cx="38%" cy="30%" r="78%">`,
    `<stop offset="0%" stop-color="${PALETA.oroCentro}"/>`,
    `<stop offset="100%" stop-color="${PALETA.oroBorde}"/>`,
    `</radialGradient>`,
    /* El filtro va sólo si el halo se dibuja. Declarado sin usar ensucia el
       svg de cada celda del calendario, y hace que un test que busque "halo"
       por texto encuentre una coincidencia que no significa nada. */
    conHalo ? `<filter id="${uid}-halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(size * 0.06).toFixed(2)}"/></filter>` : '',
    `<clipPath id="${uid}-disco"><circle cx="${centre}" cy="${centre}" r="${r}"/></clipPath>`,
    `<mask id="${uid}-sombra">`,
    `<circle cx="${centre}" cy="${centre}" r="${r}" fill="#fff"/>`,
    `<path d="${lit}" fill="#000"/>`,
    `</mask>`,
    `</defs>`,
    conHalo
      ? `<circle cx="${centre}" cy="${centre}" r="${(r * 0.96).toFixed(2)}" fill="#d8c07a" opacity="${(0.09 * illumination).toFixed(3)}" filter="url(#${uid}-halo)"/>`
      : '',
    /* 1 y 2: el disco entero, dorado, con sus cráteres. */
    `<circle cx="${centre}" cy="${centre}" r="${r}" fill="url(#${uid}-oro)"/>`,
    `<g clip-path="url(#${uid}-disco)">${crateres}</g>`,
    /* 3: el velo. */
    velo,
    /* 4: el filo. */
    filo,
    `</svg>`,
  ].join('');
}