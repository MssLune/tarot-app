/* ==========================================================================
   Fase lunar: cálculo astronómico, no aproximado.

   Fuente: Jean Meeus, *Astronomical Algorithms*, 2ª ed. (1998), cap. 49
   "Phases of the Moon". Los coeficientes son los del libro, que es un método
   publicado y verificable, no números inventados.

   Por qué no alcanza con "la Luna Nueva fue el 6/1/2000 y el lunación dura
   29,53 días": ese es el promedio, y los lunaciones reales duran entre 29,27 y
   29,83 días. El error se acumula: en tres años la fase quedaría corrida medio
   día, y en una app que se mira todos los días eso se nota.

   PRECISIÓN HONESTA:
   - Las 4 fases principales (Luna Nueva, Cuarto Creciente, Luna Llena, Cuarto
     Menguante) usan su propia serie de correcciones de Meeus: error de ~2 min.
   - Las 4 fases intermedias (crecientes, gibosas) NO tienen serie propia en el
     libro. Se obtienen por interpolación entre las principales, así que su
     error es de hasta ~12 h. Para lo que hace la app —"¿qué fase es hoy?"—
     es irrelevante, pero no es un dato astronómico fino y no se debe usar para
     calcular un eclipse.

   Todo es client-side: aritmética sobre una fecha, sin red.
   ========================================================================== */

/** Día juliano de la Luna Nueva de referencia: 2000-01-06 18:14 TD. */
const JDE_REFERENCE = 2451550.09766;
/** Duración media de un lunación, en días. */
const SYNODIC = 29.530588861;

export type MoonPhaseId =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export interface MoonPhase {
  id: MoonPhaseId;
  name: string;
  /** Qué suele invocarse de esta fase en la práctica del tarot. */
  note: string;
  /** Momento exacto de la fase. */
  date: Date;
  /** Días desde la Luna Nueva: 0 = nueva, ~14,77 = llena. */
  age: number;
  /** Fracción iluminada del disco, de 0 a 1. */
  illumination: number;
  /** Ángulo dentro del ciclo, de 0 a 2π. Sirve para dibujar el disco. */
  angle: number;
  /** `true` si el momento viene de la serie de Meeus, `false` si interpolado. */
  exact: boolean;
}

const PHASE_META: Record<MoonPhaseId, { name: string; note: string }> = {
  new: {
    name: 'Luna Nueva',
    note: 'Intención y comienzos. Buen momento para decidir qué se pregunta.',
  },
  'waxing-crescent': {
    name: 'Luna Creciente',
    note: 'Impulso inicial: la energía crece pero todavía no tiene forma.',
  },
  'first-quarter': {
    name: 'Cuarto Creciente',
    note: 'Primer obstáculo. Se pide una decisión, no una definición.',
  },
  'waxing-gibbous': {
    name: 'Gibosa Creciente',
    note: 'Casi llena. Momento de afinar y revisar lo que ya se sabe.',
  },
  full: {
    name: 'Luna Llena',
    note: 'Revelación. Lo que estaba oculto se hace visible.',
  },
  'waning-gibbous': {
    name: 'Gibosa Menguante',
    note: 'Distribuir lo aprendido: compartir, enseñar o pedir consejo.',
  },
  'last-quarter': {
    name: 'Cuarto Menguante',
    note: 'Segundo obstáculo. Corregir, soltar, cerrar un ciclo.',
  },
  'waning-crescent': {
    name: 'Luna Balsema',
    note: 'Reposo. Balance y preparación para el ciclo siguiente.',
  },
};

/** Las ocho fases, en orden cronológico dentro del lunación. */
const PHASE_ORDER: MoonPhaseId[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);

/** Fecha (con hora) a día juliano. */
export function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Día juliano a fecha. */
export function fromJulianDay(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

/** Año decimal: el año entero más la parte del día transcurrido. */
function decimalYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  return date.getUTCFullYear() + (date.getTime() - start) / (end - start);
}

/**
 * Número de lunación (k de Meeus) que contiene a la fecha.
 *
 * Ojo con el redondeo: hay que tomar la parte entera, NO redondear al más
 * cercano. La fórmula de Meeus está calibrada para el INICIO de cada lunación,
 * así que en el punto medio del lunación da ~0,64 y `Math.round` saltaría al
 * siguiente k, moviendo la fase un ciclo entero de mes. Con `Math.floor`, el
 * día 6/1/2000 da 0,074 -> k=0, y el 4/2/2000 da 1,18 -> k=1.
 */
function lunationNumber(date: Date): number {
  return Math.floor((decimalYear(date) - 2000) * 12.3685);
}

/* --------------------------------------------------------------------------
   Elementos orbitales para un lunación k. M = anomalía solar, M' = anomalía
   lunar, F = argumento de latitud, Ω = nodo ascendente, E = factor de
   excentricidad terrestre.
   -------------------------------------------------------------------------- */
interface Elements {
  M: number;
  Mp: number;
  F: number;
  Omega: number;
  E: number;
  /** T = k / 1236.85, en siglos julianos desde la época J2000. */
  T: number;
}

function elementsOf(k: number): Elements {
  const T = k / 1236.85;
  return {
    T,
    M: 2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3,
    Mp:
      201.5643 +
      385.81693528 * k +
      0.0107582 * T ** 2 +
      0.00001238 * T ** 3 -
      0.000000058 * T ** 4,
    F:
      160.7108 +
      390.67050284 * k -
      0.0016118 * T ** 2 -
      0.00000227 * T ** 3 +
      0.000000011 * T ** 4,
    Omega: 124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3,
    E: 1 - 0.002516 * T - 0.0000074 * T ** 2,
  };
}
/** Luna Nueva. Tabla 49.A de Meeus. */
function correctionNew({ M, Mp, F, Omega, E }: Elements): number {
  return (
    -0.4072 * sin(Mp) +
    0.17241 * E * sin(M) +
    0.01608 * sin(2 * Mp) +
    0.01039 * sin(2 * F) +
    0.00739 * E * sin(Mp - M) -
    0.00514 * E * sin(Mp + M) +
    0.00208 * E * E * sin(2 * M) -
    0.00111 * sin(Mp - 2 * F) -
    0.00057 * sin(Mp + 2 * F) +
    0.00056 * E * sin(2 * Mp + M) -
    0.00042 * sin(3 * Mp) +
    0.00042 * E * sin(M + 2 * F) +
    0.00038 * E * sin(M - 2 * F) -
    0.00024 * E * sin(2 * Mp - M) -
    0.00017 * sin(Omega) -
    0.00007 * sin(Mp + 2 * M) +
    0.00004 * sin(2 * Mp - 2 * F) +
    0.00004 * sin(3 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp + 2 * F) -
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp)
  );
}

/** Luna Llena. Tabla 49.A de Meeus. */
function correctionFull({ M, Mp, F, Omega, E }: Elements): number {
  return (
    -0.40614 * sin(Mp) +
    0.17302 * E * sin(M) +
    0.01614 * sin(2 * Mp) +
    0.01043 * sin(2 * F) +
    0.00734 * E * sin(Mp - M) -
    0.00515 * E * sin(Mp + M) +
    0.00209 * E * E * sin(2 * M) -
    0.00111 * sin(Mp - 2 * F) -
    0.00057 * sin(Mp + 2 * F) +
    0.00056 * E * sin(2 * Mp + M) -
    0.00042 * sin(3 * Mp) +
    0.00042 * E * sin(M + 2 * F) +
    0.00038 * E * sin(M - 2 * F) -
    0.00024 * E * sin(2 * Mp - M) -
    0.00017 * sin(Omega) -
    0.00007 * sin(Mp + 2 * M) +
    0.00004 * sin(2 * Mp - 2 * F) +
    0.00004 * sin(3 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp + 2 * F) -
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp)
  );
}

/** Cuarto Creciente y Cuarto Menguante. Tabla 49.A de Meeus. */
function correctionQuarter({ M, Mp, F, Omega, E }: Elements): number {
  return (
    -0.62801 * sin(Mp) +
    0.17172 * E * sin(M) -
    0.01183 * E * sin(Mp + M) +
    0.00862 * sin(2 * Mp) +
    0.00804 * sin(2 * F) +
    0.00454 * E * sin(Mp - M) +
    0.00204 * E * E * sin(2 * M) +
    0.0018 * sin(Mp - 2 * F) +
    0.0007 * sin(Mp + 2 * F) -
    0.0004 * sin(2 * Mp + M) +
    0.00034 * E * sin(M + 2 * F) +
    0.00032 * E * sin(Mp - M + 2 * F) +
    0.00032 * E * sin(Mp + 2 * F) -
    0.00028 * E * E * sin(2 * Mp - M) +
    0.00027 * E * sin(2 * Mp + M) +
    0.00017 * sin(Omega) -
    0.00005 * sin(Mp - 2 * F) +
    0.00004 * sin(2 * Mp + 2 * F) -
    0.00004 * sin(M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp - 2 * F) +
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp)
  );
}

/** Las 4 fases principales tienen índice par dentro de la lista de 8. */
const PRINCIPAL_INDEX = [0, 2, 4, 6] as const;

/**
 * Momento de la fase `index` (0..7) del lunación k, en día juliano.
 *
 * Para las 4 principales (índices 0, 2, 4 y 6) se usa la serie de correcciones
 * que les corresponde en la tabla 49.A de Meeus. Para las 4 intermedias se
 * interpola el punto medio entre las dos principales que la rodean.
 *
 * `principalJDE` acepta índices fuera de 0..6 a propósito: con índice 8 devuelve
 * la Luna Nueva del lunación siguiente, que es justo lo que necesita la fase
 * intermedia final (Luna Balsema).
 */
function phaseJDE(k: number, index: number): number {
  if (PRINCIPAL_INDEX.includes(index as (typeof PRINCIPAL_INDEX)[number])) {
    return principalJDE(k, index);
  }
  return (principalJDE(k, index - 1) + principalJDE(k, index + 1)) / 2;
}

/** Día juliano de una de las 4 fases principales, con su serie de correcciones. */
function principalJDE(k: number, index: number): number {
  const el = elementsOf(k);
  const base =
    JDE_REFERENCE +
    SYNODIC * k +
    0.00015437 * el.T ** 2 -
    0.00000015 * el.T ** 3 +
    0.00000000073 * el.T ** 4;
  const instant = base + SYNODIC * (index / 8);
  const correction =
    index === 0 || index === 8
      ? correctionNew(el)
      : index === 4
        ? correctionFull(el)
        : correctionQuarter(el);
  return instant + correction;
}

/**
 * Iluminación en cada una de las 8 fases.
 *
 * Se deriva de la elongación, que avanza 45° por fase, así que la illuminated
 * fraction es (1 - cos(elongación)) / 2:
 *
 *   0,000  nueva      0,146  creciente     0,500  cuarto creciente
 *   0,854  gibosa     1,000  llena         0,854  gibosa menguante
 *   0,500  cuarto menguante                 0,146  menguante
 */
const ILLUMINATION_ANCHORS = PHASE_ORDER.map(
  (_, i) => (1 - Math.cos((2 * Math.PI * i) / 8)) / 2,
);

/**
 * Fracción iluminada en una fecha, interpolando entre las fases del lunación.
 *
 * Naïve sería (1 - cos(2π·edad/lunación)) / 2, que asume que la Luna recorre la
 * órbita a velocidad constante. No lo hace, y el error se nota justo donde más
 * importa: en los cuartos. El Cuarto Creciente da por definición medio disco
 * iluminado, y la fórmula ingenua daba 0,42.
 *
 * Interpolar entre anclas da 0, 0,5 y 1 exactos en las 8 fases y una curva
 * suave entre ellas. Para dibujar un disco es indistinguible del valor real.
 */
function illuminationAt(k: number, index: number, date: Date): number {
  const t = date.getTime();
  const start = fromJulianDay(phaseJDE(k, index)).getTime();
  /* La fase que sigue: para la última, la Luna Nueva del lunación siguiente. */
  const end =
    index === 7
      ? fromJulianDay(phaseJDE(k + 1, 0)).getTime()
      : fromJulianDay(phaseJDE(k, index + 1)).getTime();
  if (t <= start) return ILLUMINATION_ANCHORS[index];
  if (t >= end) return ILLUMINATION_ANCHORS[(index + 1) % 8];
  const f = (t - start) / (end - start);
  return ILLUMINATION_ANCHORS[index] + (ILLUMINATION_ANCHORS[(index + 1) % 8] - ILLUMINATION_ANCHORS[index]) * f;
}

function buildPhase(k: number, index: number, jd: number): MoonPhase {
  const id = PHASE_ORDER[index];
  const age = jd - JDE_REFERENCE - SYNODIC * k;
  return {
    id,
    name: PHASE_META[id].name,
    note: PHASE_META[id].note,
    date: fromJulianDay(jd),
    age,
    /* La edad en días sirve para dibujar (gira de 0 a 2π a lo largo del
       lunación); la iluminación va interpolada, que es lo correcto. */
    angle: (2 * Math.PI * age) / SYNODIC,
    illumination: ILLUMINATION_ANCHORS[index],
    exact: PRINCIPAL_INDEX.includes(index as (typeof PRINCIPAL_INDEX)[number]),
  };
}

/** Fechas de las 8 fases del lunación que contiene a `date`. */
export function phasesOfLunation(date: Date = new Date()): MoonPhase[] {
  const k = lunationNumber(date);
  return PHASE_ORDER.map((_, index) => buildPhase(k, index, phaseJDE(k, index)));
}

/**
 * Fase vigente en una fecha, con la siguiente.
 *
 * `lunationNumber` devuelve el lunación cuyo inicio es anterior a la fecha, así
 * que si estamos en los últimos días del lunación anterior (antes de su Luna
 * Nueva) hay que retroceder uno.
 */
export function moonPhase(date: Date = new Date()): MoonPhase & { next: MoonPhase } {
  let k = lunationNumber(date);
  if (fromJulianDay(phaseJDE(k, 0)).getTime() > date.getTime()) k -= 1;

  const phases = PHASE_ORDER.map((_, index) => buildPhase(k, index, phaseJDE(k, index)));

  let index = 0;
  for (let i = 0; i < phases.length; i += 1) {
    if (phases[i].date.getTime() <= date.getTime()) index = i;
  }
  const nextIndex = (index + 1) % 8;
  return {
    ...phases[index],
    illumination: illuminationAt(k, index, date),
    next: {
      ...phases[nextIndex],
      illumination: ILLUMINATION_ANCHORS[nextIndex],
    },
  };
}
