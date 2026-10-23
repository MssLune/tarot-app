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
     Menguante) usan su propia serie de correcciones de Meeus. La serie da el
     instante en Tiempo Terrestre (TT); se pasa a Tiempo Universal restando
     ΔT (ver `deltaT`). Error típico: 1 a 3 minutos. Por eso la interfaz
     muestra la hora al minuto y la presenta como aproximada, nunca segundos.
   - Las 4 fases intermedias (crecientes, gibosas) NO son instantes: son los
     tramos entre principales. `phasesOfLunation` les pone una fecha de
     referencia (el punto medio), que sirve para ordenar, no para publicar.
   - La fracción iluminada sale de la elongación real de la Luna (Meeus, cap.
     48, fórmula de baja precisión): error menor a 1 punto porcentual. La
     interfaz la redondea a un entero.

   CONVENCIÓN DEL NOMBRE DEL DÍA (`lunaDelDia`): una fase principal es un
   instante, así que su nombre se le da sólo al día local en que cae ese
   instante. Los demás días llevan el nombre del tramo (creciente, gibosa,
   etc.). Es la convención de los almanaques y calendarios lunares.

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
  /** Qué suele invocarse de esta fase en la práctica del tarot (simbólico). */
  note: string;
  /** Qué pasa en el cielo en esta fase (astronómico, no simbólico). */
  descripcion: string;
  /** Momento exacto de la fase. */
  date: Date;
  /** Días desde la Luna Nueva: 0 = nueva, ~14,77 = llena. */
  age: number;
  /**
   * Fracción iluminada del disco, de 0 a 1.
   *
   * En `phasesOfLunation` es el valor NOMINAL de la fase (0, 0,5, 1...). En
   * `moonPhase` es el real en el instante pedido.
   */
  illumination: number;
  /** Ángulo dentro del ciclo, de 0 a 2π. Sirve para dibujar el disco. */
  angle: number;
  /** `true` si el momento viene de la serie de Meeus, `false` si es el punto medio de un tramo. */
  exact: boolean;
}

const PHASE_META: Record<MoonPhaseId, { name: string; note: string; descripcion: string }> = {
  new: {
    name: 'Luna Nueva',
    note: 'Intención y comienzos. Buen momento para decidir qué se pregunta.',
    descripcion:
      'La Luna pasa entre la Tierra y el Sol. La cara que mira hacia aquí no recibe luz y sale y se pone casi junto con el Sol, así que no se ve.',
  },
  'waxing-crescent': {
    name: 'Luna Creciente',
    note: 'Impulso inicial: la energía crece pero todavía no tiene forma.',
    descripcion:
      'Un filo iluminado que crece cada noche. Se ve al anochecer, bajo hacia el oeste, poco después de la puesta del Sol.',
  },
  'first-quarter': {
    name: 'Cuarto Creciente',
    note: 'Primer obstáculo. Se pide una decisión, no una definición.',
    descripcion:
      'Media Luna iluminada. Sale hacia el mediodía, está alta al anochecer y se pone hacia la medianoche.',
  },
  'waxing-gibbous': {
    /* "Gibosa" es el termino tecnico correcto y casi nadie lo usa. "Casi
       llena" dice lo mismo y se entiende al primer vistazo. El nombre tecnico
       no se pierde: vive en el id ('waxing-gibbous') y en el PDF. */
    name: 'Casi Llena',
    note: 'Más de la mitad iluminada, todavía no llena. Momento de afinar y revisar lo que ya se sabe.',
    descripcion:
      'Más de la mitad iluminada y en aumento. Se ve desde la tarde y durante buena parte de la noche.',
  },
  full: {
    name: 'Luna Llena',
    note: 'Revelación. Lo que estaba oculto se hace visible.',
    descripcion:
      'La Tierra queda entre el Sol y la Luna y el disco se ve entero. Sale al atardecer, se pone al amanecer y está en el cielo toda la noche.',
  },
  'waning-gibbous': {
    /* Ninguno de los ocho nombres se repite ni se confunde con otro: aqui
       "menguante" es la gibosa, el cuarto menguante es el cuarto, y la ultima
       del ciclo es la balsámica. */
    name: 'Luna Menguante',
    note: 'La Luna ya pasó la llena y le empieza a bajar la luz. Momento de distribuir lo aprendido: compartir, enseñar o pedir consejo.',
    descripcion:
      'Más de la mitad iluminada y en disminución. Sale después del anochecer y se ve hasta la mañana.',
  },
  'last-quarter': {
    name: 'Cuarto Menguante',
    note: 'Segundo obstáculo. Corregir, soltar, cerrar un ciclo.',
    descripcion:
      'La otra media Luna iluminada. Sale hacia la medianoche y se ve alta al amanecer.',
  },
  'waning-crescent': {
    name: 'Luna Balsámica',
    note: 'Reposo. Balance y preparación para el ciclo siguiente.',
    descripcion:
      'Un filo cada vez más fino. Se ve de madrugada, hacia el este, antes de la salida del Sol.',
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

/**
 * ΔT = TT − UT, en segundos, para un año decimal.
 *
 * Polinomios de Espenak y Meeus (NASA, "Polynomial Expressions for Delta T"),
 * por tramos. La app sólo acepta años entre 1900 y 2100 (ver las rutas de la
 * Luna), así que sólo están esos tramos; fuera de ellos se usa el extremo.
 * Después de 2005 el polinomio es una extrapolación: en 2026 da ~75 s contra
 * ~69 s medidos. Seis segundos no cambian el minuto que se muestra.
 */
export function deltaT(anio: number): number {
  const y = Math.min(2150, Math.max(1900, anio));
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t ** 2 +
      0.0017275 * t ** 3 +
      0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    );
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  const u = (y - 1820) / 100;
  return -20 + 32 * u ** 2 - 0.5628 * (2150 - y);
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

/**
 * Movimientos medios, en grados por día.
 *
 * Se usan para desplazar los argumentos de cada fase hasta SU instante, y no
 * hasta el de la luna nueva del lunación. Ver `elementsOf`.
 */
const MEAN_MOTION = {
  /** Anomalía media del Sol. */
  M: 0.98560028,
  /** Anomalía media de la Luna. Es la que domina la corrección. */
  Mp: 13.0649929509,
  /** Argumento de latitud de la Luna. */
  F: 13.22935024,
  /** Nodo ascendente: retrocede. */
  Omega: -0.0529539,
} as const;

/**
 * Argumentos de la corrección para una fase.
 *
 * `k` da los valores en la LUNA NUEVA de ese lunación, y después se desplazan
 * por los días que faltan hasta la fase que se está calculando.
 *
 * El desplazamiento no es un detalle menor: es la diferencia entre acertar y
 * fallar por un día entero. El término dominante de la corrección es
 * `-0,406 · sin(M')`, y M' —la anomalía media de la Luna— avanza 13,065° por
 * día, o sea 192,9° a lo largo de medio lunación. Si se usara el M' de la luna
 * nueva para calcular la llena, el signo de la corrección saldría invertido:
 * la luna nueva acertaría (el desfase es cero) y las otras tres fases
 * fallarían, la llena por unas 16 horas.
 *
 * La Luna no recorre el lunación a velocidad constante: se acelera cerca del
 * perigeo. Por eso la fase real puede estar a más de medio día del punto medio
 * geométrico del lunación.
 */
function elementsOf(k: number, index: number): Elements {
  const T = k / 1236.85;
  /* Días desde la luna nueva hasta esta fase. */
  const offset = SYNODIC * (index / 8);

  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3;
  const Mp =
    201.5643 +
    385.81693528 * k +
    0.0107582 * T ** 2 +
    0.00001238 * T ** 3 -
    0.000000058 * T ** 4;
  const F =
    160.7108 +
    390.67050284 * k -
    0.0016118 * T ** 2 -
    0.00000227 * T ** 3 +
    0.000000011 * T ** 4;
  const Omega = 124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3;

  return {
    T,
    M: M + MEAN_MOTION.M * offset,
    Mp: Mp + MEAN_MOTION.Mp * offset,
    F: F + MEAN_MOTION.F * offset,
    Omega: Omega + MEAN_MOTION.Omega * offset,
    /* E depende sólo de la época, no de la fase. */
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

/**
 * Cuartos (creciente y menguante). Meeus, cap. 49: los dos cuartos comparten
 * la MISMA serie, y se distinguen por el término W, que se suma en el Cuarto
 * Creciente y se resta en el Menguante (ver `correctionW`).
 *
 * Antes cada cuarto tenía su serie, con signos cambiados en varios términos
 * y sin W: los cuartos salían entre 2 y 8 minutos antes de lo publicado.
 */
function correctionQuarter({ M, Mp, F, Omega, E }: Elements): number {
  return (
    -0.62801 * sin(Mp) +
    0.17172 * E * sin(M) -
    0.01183 * E * sin(Mp + M) +
    0.00862 * sin(2 * Mp) +
    0.00804 * sin(2 * F) +
    0.00454 * E * sin(Mp - M) +
    0.00204 * E * E * sin(2 * M) -
    0.0018 * sin(Mp - 2 * F) -
    0.0007 * sin(Mp + 2 * F) -
    0.0004 * sin(3 * Mp) -
    0.00034 * E * sin(2 * Mp - M) +
    0.00032 * E * sin(M + 2 * F) +
    0.00032 * E * sin(M - 2 * F) -
    0.00028 * E * E * sin(Mp + 2 * M) +
    0.00027 * E * sin(2 * Mp + M) -
    0.00017 * sin(Omega) -
    0.00005 * sin(Mp - M - 2 * F) +
    0.00004 * sin(2 * Mp + 2 * F) -
    0.00004 * sin(Mp + M + 2 * F) +
    0.00004 * sin(Mp - 2 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(3 * M) +
    0.00002 * sin(2 * Mp - 2 * F) +
    0.00002 * sin(Mp - M + 2 * F) -
    0.00002 * sin(3 * Mp + M)
  );
}

/** Término W de los cuartos: +W en el Creciente, −W en el Menguante. */
function correctionW({ M, Mp, F, E }: Elements): number {
  const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);
  return (
    0.00306 -
    0.00038 * E * cos(M) +
    0.00026 * cos(Mp) -
    0.00002 * cos(Mp - M) +
    0.00002 * cos(Mp + M) +
    0.00002 * cos(2 * F)
  );
}

/**
 * Correcciones adicionales (planetarias), comunes a las cuatro fases.
 * Meeus, cap. 49, argumentos A1 a A14. `k` es el fraccionario de la fase
 * (k + 0,25 para el Cuarto Creciente, etc.). Suman hasta ~1 minuto.
 */
const PLANETARIAS: [number, number, number][] = [
  [299.77, 0.107408, 0.000325],
  [251.88, 0.016321, 0.000165],
  [251.83, 26.651886, 0.000164],
  [349.42, 36.412478, 0.000126],
  [84.66, 18.206239, 0.00011],
  [141.74, 53.303771, 0.000062],
  [207.14, 2.453732, 0.00006],
  [154.84, 7.30686, 0.000056],
  [34.52, 27.261239, 0.000047],
  [207.19, 0.121824, 0.000042],
  [291.34, 1.844379, 0.00004],
  [161.72, 24.198154, 0.000037],
  [239.56, 25.513099, 0.000035],
  [331.55, 3.592518, 0.000023],
];

function correctionPlanetary(k: number, T: number): number {
  let total = 0;
  PLANETARIAS.forEach(([base, porK, coef], i) => {
    /* A1 lleva además un término en T². */
    const arg = base + porK * k - (i === 0 ? 0.009173 * T ** 2 : 0);
    total += coef * sin(arg);
  });
  return total;
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
 * intermedia final (Luna Balsámica).
 */
function phaseJDE(k: number, index: number): number {
  if (PRINCIPAL_INDEX.includes(index as (typeof PRINCIPAL_INDEX)[number])) {
    return principalJDE(k, index);
  }
  return (principalJDE(k, index - 1) + principalJDE(k, index + 1)) / 2;
}

/** Día juliano de una de las 4 fases principales, con su serie de correcciones. */
function principalJDE(k: number, index: number): number {
  const el = elementsOf(k, index);
  const base =
    JDE_REFERENCE +
    SYNODIC * k +
    0.00015437 * el.T ** 2 -
    0.00000015 * el.T ** 3 +
    0.00000000073 * el.T ** 4;
  const instant = base + SYNODIC * (index / 8);
  const correction =
    (index === 0 || index === 8
      ? correctionNew(el)
      : index === 4
        ? correctionFull(el)
        : index === 2
          ? correctionQuarter(el) + correctionW(el)
          : correctionQuarter(el) - correctionW(el)) + correctionPlanetary(k + index / 8, el.T);
  /* La serie da Tiempo Terrestre (TT). Los relojes marcan Tiempo Universal:
     la diferencia, ΔT, es de ~69 s en 2026. Sin restarla, todas las fases
     salían un minuto largo tarde. */
  return instant + correction - deltaT(2000 + k / 12.3685) / 86400;
}

/**
 * Iluminación NOMINAL de cada una de las 8 fases.
 *
 * Se deriva de la elongación, que avanza 45° por fase, así que la fracción
 * iluminada es (1 - cos(elongación)) / 2:
 *
 *   0,000  nueva      0,146  creciente     0,500  cuarto creciente
 *   0,854  gibosa     1,000  llena         0,854  gibosa menguante
 *   0,500  cuarto menguante                 0,146  menguante
 *
 * Es el valor que define a la fase, no el que tiene la Luna en un momento
 * dado: para eso está `iluminacionEn`.
 */
const ILLUMINATION_ANCHORS = PHASE_ORDER.map(
  (_, i) => (1 - Math.cos((2 * Math.PI * i) / 8)) / 2,
);

const DIA_MS = 86400000;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

/**
 * Elongación de la Luna respecto del Sol, en longitud, de 0 a 360°.
 *
 * 0° es Luna Nueva, 90° Cuarto Creciente, 180° Llena, 270° Cuarto Menguante.
 * Argumentos medios de Meeus cap. 47 (ec. 47.2 a 47.4) y las seis
 * correcciones principales de la ec. 48.4. Error típico: unas décimas de
 * grado, que en la fracción iluminada es menos de un punto porcentual.
 *
 * Antes la iluminación se interpolaba en línea recta entre las anclas de las
 * fases. Eso acertaba en los 8 puntos y se equivocaba entre ellos (hasta ~7
 * puntos a mitad de un tramo, porque la curva real es un coseno).
 */
export function elongacionLunar(date: Date): number {
  /* La serie va en Tiempo Terrestre: se suma ΔT al instante del reloj. */
  const jde = toJulianDay(date) + deltaT(decimalYear(date)) / 86400;
  const T = (jde - 2451545) / 36525;
  const D =
    297.8501921 + 445267.1114034 * T - 0.0018819 * T ** 2 + T ** 3 / 545868 - T ** 4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000;
  const Mp =
    134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000;
  return norm360(
    D +
      6.289 * sin(Mp) -
      2.1 * sin(M) +
      1.274 * sin(2 * D - Mp) +
      0.658 * sin(2 * D) +
      0.214 * sin(2 * Mp) +
      0.11 * sin(D),
  );
}

/** Fracción iluminada real y ángulo para dibujar el disco, en un instante. */
export function iluminacionEn(date: Date): { illumination: number; angle: number } {
  const e = (elongacionLunar(date) * Math.PI) / 180;
  return { illumination: (1 - Math.cos(e)) / 2, angle: e };
}

/** El tramo intermedio que corresponde a una elongación (en radianes). */
function tramoPorAngulo(angle: number): MoonPhaseId {
  const deg = norm360((angle * 180) / Math.PI);
  if (deg < 90) return 'waxing-crescent';
  if (deg < 180) return 'waxing-gibbous';
  if (deg < 270) return 'waning-gibbous';
  return 'waning-crescent';
}

function buildPhase(k: number, index: number, jd: number): MoonPhase {
  const id = PHASE_ORDER[index];
  return {
    id,
    name: PHASE_META[id].name,
    note: PHASE_META[id].note,
    descripcion: PHASE_META[id].descripcion,
    date: fromJulianDay(jd),
    /* Días reales desde la Luna Nueva de este lunación, no desde la media. */
    age: jd - phaseJDE(k, 0),
    angle: (2 * Math.PI * index) / 8,
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
 * Fase vigente en un INSTANTE, con la siguiente de las ocho.
 *
 * Es la vista "por tramos": la fase es la última de las 8 referencias que ya
 * pasó. Para el nombre que lleva un DÍA del calendario está `lunaDelDia`, que
 * sigue la convención de los almanaques. La usa el PDF de la lectura.
 *
 * La iluminación, el ángulo y la edad son los reales en `date`.
 */
export function moonPhase(date: Date = new Date()): MoonPhase & { next: MoonPhase } {
  let k = lunationNumber(date);
  if (fromJulianDay(phaseJDE(k, 0)).getTime() > date.getTime()) k -= 1;

  const phases = PHASE_ORDER.map((_, index) => buildPhase(k, index, phaseJDE(k, index)));

  let index = 0;
  for (let i = 0; i < phases.length; i += 1) {
    if (phases[i].date.getTime() <= date.getTime()) index = i;
  }
  /* Después de la Balsámica viene la Luna Nueva del lunación SIGUIENTE. Con
     `(index + 1) % 8` se devolvía la nueva de este, que ya había pasado. */
  const next = index === 7 ? buildPhase(k + 1, 0, phaseJDE(k + 1, 0)) : phases[index + 1];
  return {
    ...phases[index],
    ...iluminacionEn(date),
    age: (date.getTime() - phases[0].date.getTime()) / DIA_MS,
    next,
  };
}

/* --------------------------------------------------------------------------
   Fases principales como instantes
   -------------------------------------------------------------------------- */

export interface FasePrincipal {
  id: Extract<MoonPhaseId, 'new' | 'first-quarter' | 'full' | 'last-quarter'>;
  name: string;
  /** Instante de la fase (UTC dentro del Date; se muestra en hora local). */
  date: Date;
}

/**
 * Las fases principales cuyo instante cae en [desde, hasta).
 *
 * Recorre todos los lunaciones que pueden tocar el rango, con uno de margen a
 * cada lado, y filtra por instante. Es lo robusto: un mes puede tener cinco
 * fases principales (dos llenas, por ejemplo) o empezar justo antes de una
 * Luna Nueva, y tomar "el lunación del día 1 y el del último" no siempre las
 * agarraba todas.
 */
export function fasesPrincipalesEntre(desde: Date, hasta: Date): FasePrincipal[] {
  const salida: FasePrincipal[] = [];
  const t0 = desde.getTime();
  const t1 = hasta.getTime();
  for (let k = lunationNumber(desde) - 1; k <= lunationNumber(hasta) + 1; k += 1) {
    for (const index of PRINCIPAL_INDEX) {
      const date = fromJulianDay(principalJDE(k, index));
      const t = date.getTime();
      if (t >= t0 && t < t1) {
        const id = PHASE_ORDER[index] as FasePrincipal['id'];
        salida.push({ id, name: PHASE_META[id].name, date });
      }
    }
  }
  return salida.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** La próxima fase principal después de `desde`. Siempre hay una en 8 días. */
export function proximaFasePrincipal(desde: Date = new Date()): FasePrincipal {
  return fasesPrincipalesEntre(
    new Date(desde.getTime() + 1),
    new Date(desde.getTime() + 10 * DIA_MS),
  )[0];
}

/** Días transcurridos desde la última Luna Nueva hasta `date`. */
export function edadLunar(date: Date = new Date()): number {
  const nuevas = fasesPrincipalesEntre(
    new Date(date.getTime() - 31 * DIA_MS),
    new Date(date.getTime() + 1),
  ).filter((f) => f.id === 'new');
  const ultima = nuevas[nuevas.length - 1];
  return (date.getTime() - ultima.date.getTime()) / DIA_MS;
}

/* --------------------------------------------------------------------------
   La Luna de un día: para el calendario y la tarjeta de hoy
   -------------------------------------------------------------------------- */

export interface MoonDay {
  /** El día, a mediodía local. */
  date: Date;
  /** Fracción iluminada real a mediodía local. */
  illumination: number;
  /** Ángulo (elongación) a mediodía local, de 0 a 2π, para dibujar. */
  angle: number;
  /** Fase que lleva el día, según la convención de `lunaDelDia`. */
  id: MoonPhaseId;
  name: string;
  /** La fase principal cuyo instante cae ese día local, si hay. */
  principal?: FasePrincipal;
}

export interface LunaDelDia extends MoonDay {
  note: string;
  descripcion: string;
  /** Días desde la última Luna Nueva, a mediodía local. */
  age: number;
}

/** Los días [primero, primero + n) en hora local, con la fase de cada uno. */
function diasDesde(anio: number, mes: number, dia: number, n: number): MoonDay[] {
  const inicio = new Date(anio, mes, dia, 0, 0, 0, 0);
  const fin = new Date(anio, mes, dia + n, 0, 0, 0, 0);
  const principales = fasesPrincipalesEntre(inicio, fin);
  const porDia = new Map<string, FasePrincipal>();
  for (const f of principales) porDia.set(claveDia(f.date), f);

  const salida: MoonDay[] = [];
  for (let i = 0; i < n; i += 1) {
    /* Mediodía y no medianoche: es el centro del día local, y así el cambio
       de horario de verano (que pasa de madrugada) no mueve el día. */
    const fecha = new Date(anio, mes, dia + i, 12, 0, 0, 0);
    const principal = porDia.get(claveDia(fecha));
    const { illumination, angle } = iluminacionEn(fecha);
    const id = principal?.id ?? tramoPorAngulo(angle);
    salida.push({ date: fecha, illumination, angle, id, name: PHASE_META[id].name, principal });
  }
  return salida;
}

/**
 * La Luna de un día local, con la convención de los almanaques: si el
 * instante de una fase principal cae dentro de ese día (en la zona horaria
 * del dispositivo), el día lleva ese nombre; si no, el del tramo.
 */
export function lunaDelDia(fecha: Date = new Date()): LunaDelDia {
  const [dia] = diasDesde(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 1);
  return {
    ...dia,
    note: PHASE_META[dia.id].note,
    descripcion: PHASE_META[dia.id].descripcion,
    age: edadLunar(dia.date),
  };
}

/** Nota simbólica y descripción astronómica de una fase. */
export function infoDeFase(id: MoonPhaseId): { name: string; note: string; descripcion: string } {
  return PHASE_META[id];
}

/** Las ocho fases en orden, con su nombre. Para selectores y leyendas. */
export const FASES_LUNARES: { id: MoonPhaseId; name: string }[] = PHASE_ORDER.map((id) => ({
  id,
  name: PHASE_META[id].name,
}));

/**
 * La Luna de cada día de un mes, en orden.
 *
 * Las fases principales del rango se calculan una sola vez, no una por día.
 */
export function moonDaysInMonth(anio: number, mes: number): MoonDay[] {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  return diasDesde(anio, mes, 1, ultimo);
}

export interface CalendarDay extends MoonDay {
  /** 0 = domingo, 6 = sábado. */
  weekday: number;
  /** `true` si el día pertenece al mes pedido. Los de los bordes, no. */
  enMes: boolean;
  /** Festividad que cae ese día, si hay. */
  festividad?: { id: string; name: string; granHoguera?: boolean };
  /** Fase principal que cae EXACTO ese día (sólo en los días del mes). */
  fase?: { id: MoonPhaseId; name: string; instante: Date };
}

/**
 * El mes como lo ve un calendario: una semana por fila, con los días del mes
 * vecino que completan la primera y la última fila.
 *
 * Empieza en domingo porque es como lo tiene la mayoría. Cambiarlo sería meter
 * una opinión en un lugar donde no hace falta.
 */
export function calendarMonth(
  anio: number,
  mes: number,
  festividades: { id: string; name: string; date: Date; granHoguera?: boolean }[] = [],
): CalendarDay[] {
  const primero = new Date(anio, mes, 1, 12, 0, 0, 0);
  const ultimo = new Date(anio, mes + 1, 0, 12, 0, 0, 0);

  /* Cuántos días hay que poner delante para que el 1º caiga donde le toca. */
  const relleno = primero.getDay();
  const celdas = Math.ceil((relleno + ultimo.getDate()) / 7) * 7;

  const festPorDia = new Map<string, { id: string; name: string; granHoguera?: boolean }>();
  for (const f of festividades) {
    festPorDia.set(claveDia(f.date), { id: f.id, name: f.name, granHoguera: f.granHoguera });
  }

  return diasDesde(anio, mes, 1 - relleno, celdas).map((d) => {
    const enMes = d.date.getMonth() === mes;
    return {
      ...d,
      weekday: d.date.getDay(),
      enMes,
      festividad: enMes ? festPorDia.get(claveDia(d.date)) : undefined,
      fase:
        enMes && d.principal
          ? { id: d.principal.id, name: d.principal.name, instante: d.principal.date }
          : undefined,
    };
  });
}

/** Clave de un día local, para comparar fechas sin la hora. */
function claveDia(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
