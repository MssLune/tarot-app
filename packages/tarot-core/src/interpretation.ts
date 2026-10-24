import { AXIS_LABELS, CATEGORY_PHRASE, ELEMENT_LABELS, ELEMENT_MEANING } from './labels';
import type {
  ArcanaCard,
  CardCombination,
  CustomCard,
  CustomDeck,
  DrawnCard,
  Element,
  Energy,
  Interpretation,
  Pattern,
  PositionReading,
  QuestionCategory,
  Spread,
  SystemId,
} from './types';

/** Cartas del Rider-Waite indexadas por id, tal como las sirve la API. */
type CardsById = Record<string, ArcanaCard>;

/** Campos por tema: los tiene el Rider-Waite y, si el usuario los escribió, el mazo propio. */
type ConTemas = Pick<ArcanaCard, 'loveHint' | 'workHint' | 'moneyHint' | 'healthHint'>;

/** Devuelve la frase corta de la carta para la categoría elegida, si existe. */
function hintForCategory(arcana: ConTemas, category: QuestionCategory): string | undefined {
  switch (category) {
    case 'amor':
      return arcana.loveHint;
    case 'trabajo':
      return arcana.workHint;
    case 'dinero':
      return arcana.moneyHint;
    case 'salud':
      return arcana.healthHint;
    default:
      return undefined;
  }
}

/* ==========================================================================
   Motor de interpretación.
   1) Interpreta cada posición cruzando el significado de la carta con el
      sentido que aporta la posición dentro de la tirada.
   2) Detecta patrones transversales (elementos, ejes, invertidas, repeticiones).
   3) Redacta una conclusión integradora que hila todo.
   ========================================================================== */

/** Conectores para que el texto por posición no suene repetitivo. */
const CONNECTORS = [
  'esta energía se dirige a',
  'el mensaje aterriza en',
  'la carta habla puntualmente de',
  'esa fuerza se aplica a',
  'lo que se ilumina aquí es',
  'el foco se posa sobre',
];

/** Palabras vacías para el análisis de repeticiones en mazos de oráculo. */
const STOPWORDS = new Set([
  'de','la','el','los','las','un','una','unos','unas','y','o','que','en','a','al','del','con','por',
  'para','se','su','sus','lo','le','mi','tu','es','ser','estar','como','más','mas','pero','si','no',
  'me','te','nos','muy','ya','sin','sobre','entre','cuando','donde','desde','hasta','este','esta',
  'ese','esa','todo','toda','todos','todas','hay','ha','han','vos','tú','ti','yo','él','ella',
  // Verbos y conectores frecuentes: no aportan como palabra clave.
  'está','esta','están','puede','pueden','tiene','tienen','hace','hacer','según','también',
  'porque','aunque','mientras','cada','otro','otra','otros','otras','algo','nada','algún','alguna',
  'ahora','luego','antes','después','siempre','nunca','bien','mal','poco','mucho','mucha',
]);

/** Lectura del tono general según la energía dominante. */
const ENERGY_MEANING: Record<Energy, string> = {
  activa:
    'El impulso está del lado de la acción: la tirada pide iniciativa, movimiento y decisiones concretas.',
  receptiva:
    'La tirada es receptiva: el mejor movimiento es escuchar, esperar el momento y dejar madurar en lugar de empujar.',
  transformadora:
    'Domina la energía de cambio: se está atravesando un umbral y el escenario no va a volver a ser el anterior.',
};

/** Une una lista en lenguaje natural: "a, b y c". */
function joinNatural(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Capitaliza la primera letra. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Corrige las contracciones del español que aparecen al concatenar frases con
 * el nombre de las posiciones ("se dirige a el corazón" → "se dirige al corazón").
 */
function fixContractions(text: string): string {
  return text
    .replace(/\ba el\b/g, 'al')
    .replace(/\bA el\b/g, 'Al')
    .replace(/\bde el\b/g, 'del')
    .replace(/\bDe el\b/g, 'Del');
}

/** Cuenta ocurrencias y devuelve el más frecuente. */
function topOf<T extends string>(values: T[]): { value: T; count: number } | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  let best: { value: T; count: number } | undefined;
  counts.forEach((count, value) => {
    if (!best || count > best.count) best = { value, count };
  });
  return best;
}

/** Busca la definición de la carta dentro del mazo personalizado. */
export function deckCardOf(
  card: DrawnCard,
  deck?: CustomDeck | null,
): CustomCard | undefined {
  if (!deck || !card.deckCardId) return undefined;
  return deck.cards.find((c) => c.id === card.deckCardId);
}

/** Nombre visible de la carta según el sistema. */
export function cardDisplayName(
  card: DrawnCard,
  system: SystemId,
  cardsById: CardsById,
  deck?: CustomDeck | null,
): string {
  if (system === 'rider-waite' && card.arcanaId) {
    return cardsById[card.arcanaId]?.name ?? 'Carta';
  }
  if (system === 'custom-deck') {
    // Si el mazo cambió y la carta ya no existe, cae al nombre guardado.
    return deckCardOf(card, deck)?.name || card.customName?.trim() || 'Carta sin nombre';
  }
  return card.customName?.trim() || 'Carta sin nombre';
}

/** Símbolo a dibujar en el frente de la carta. */
export function cardGlyph(
  card: DrawnCard,
  system: SystemId,
  index: number,
  cardsById: CardsById,
  deck?: CustomDeck | null,
): string {
  if (system === 'rider-waite' && card.arcanaId) {
    return cardsById[card.arcanaId]?.glyph ?? '✦';
  }
  // Símbolos neutros, estables por índice de posición.
  const genericGlyphs = ['✦', '☾', '☉', '❋', '⚚', '✧', '♁', '❂', '⟡', '✷', '❈', '✵'];
  if (system === 'custom-deck') {
    const own = deckCardOf(card, deck)?.glyph?.trim();
    if (own) return own;
  }
  return genericGlyphs[index % genericGlyphs.length];
}

/** Largo máximo de la dirección de una imagen de carta. */
export const MAX_LARGO_URL_IMAGEN = 2048;

/**
 * ¿Sirve como imagen de una carta de mazo propio?
 *
 * Sólo `https://`: la app se publica con https y una imagen `http://` el
 * navegador la bloquea o la avisa como insegura. Tampoco se aceptan `data:`
 * (una foto entera pegada en el JSON llenaría la base) ni espacios o comillas,
 * que delatan algo que no es una dirección.
 */
export function esUrlDeImagenValida(url: unknown): boolean {
  return (
    typeof url === 'string' &&
    url.trim().length <= MAX_LARGO_URL_IMAGEN &&
    /^https:\/\/[^\s"'<>]+$/i.test(url.trim())
  );
}

/**
 * Convierte los enlaces «para compartir» de los servicios más usados en el
 * enlace directo a la imagen, que es lo único que un <img> puede mostrar:
 *
 * - Google Drive (`drive.google.com/file/d/ID/view`, `open?id=ID`, `uc?id=ID`)
 *   → la miniatura pública del archivo. El archivo tiene que estar compartido
 *   como «Cualquier persona con el enlace».
 * - Dropbox (`?dl=0`) → `?raw=1`, que entrega el archivo en vez de la página.
 * - Imgur (`imgur.com/ID`) → `i.imgur.com/ID.jpg`.
 *
 * Cualquier otra dirección se devuelve igual.
 */
export function urlDirectaDeImagen(url: string): string {
  const u = url.trim();
  const drive = u.match(
    /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/i,
  );
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1000`;
  if (/^https:\/\/(?:www\.)?dropbox\.com\//i.test(u)) {
    if (/[?&]raw=1/.test(u)) return u;
    if (/[?&]dl=[01]/.test(u)) return u.replace(/([?&])dl=[01]/, '$1raw=1');
    return `${u}${u.includes('?') ? '&' : '?'}raw=1`;
  }
  const imgur = u.match(/^https:\/\/(?:www\.|m\.)?imgur\.com\/([A-Za-z0-9]{5,8})\/?$/i);
  if (imgur) return `https://i.imgur.com/${imgur[1]}.jpg`;
  return u;
}

/**
 * URL de la imagen de la carta, si tiene.
 *
 * Va al lado de `cardDisplayName` y no dentro por dos razones. Una: la imagen
 * es opcional y se resuelve por el mismo camino que el nombre, así que la
 * lógica queda junta. Dos: devolver `undefined` es un caso NORMAL y no un
 * error —el mazo funciona entero sin imágenes, con el glifo—, y conviene que
 * el que llama lo sepa sin adivinar.
 *
 * El Rider-Waite usa los 78 archivos del servidor (ruta relativa). Un mazo
 * propio usa la dirección que el usuario puso en la carta (`imageUrl`), si es
 * válida. El Oráculo libre no tiene imágenes.
 */
export function cardImageUrl(
  card: DrawnCard,
  system: SystemId,
  cardsById: CardsById,
  deck?: CustomDeck | null,
): string | undefined {
  if (system === 'custom-deck') {
    const url = deckCardOf(card, deck)?.imageUrl?.trim();
    return url && esUrlDeImagenValida(url) ? urlDirectaDeImagen(url) : undefined;
  }
  if (system !== 'rider-waite' || !card.arcanaId) return undefined;
  return cardsById[card.arcanaId]?.imageUrl;
}

/* --------------------------------------------------------------------------
   Interpretación por posición
   -------------------------------------------------------------------------- */

function readRiderWaitePosition(
  card: DrawnCard,
  positionName: string,
  prompt: string,
  index: number,
  cardsById: CardsById,
  category: QuestionCategory,
): { text: string; keywords: string[]; subtitle: string; advice: string } {
  const arcana = cardsById[card.arcanaId ?? ''];
  if (!arcana) {
    return { text: 'Carta no reconocida.', keywords: [], subtitle: '', advice: '' };
  }

  const base = card.reversed ? arcana.reversed : arcana.upright;
  const keywords = card.reversed ? arcana.reversedKeywords : arcana.keywords;
  const connector = CONNECTORS[index % CONNECTORS.length];
  const orientation = card.reversed ? 'en posición invertida' : 'en posición derecha';

  const bridge = `Al caer en «${positionName}» ${orientation}, ${connector} ${prompt}: ${joinNatural(
    keywords.slice(0, 3),
  )}.`;

  /* Frase focalizada según el tema elegido para la pregunta (amor/trabajo/dinero/salud). */
  const hint = hintForCategory(arcana, category);
  const categoryPhrase = hint ? ` En el plano de ${CATEGORY_PHRASE[category]}: ${hint}` : '';

  const own = card.customMeaning?.trim()
    ? ` Tu lectura personal para esta carta: ${card.customMeaning.trim()}`
    : '';

  return {
    text: fixContractions(`${base} ${bridge}${categoryPhrase}${own}`),
    keywords,
    subtitle: `${arcana.number} · ${arcana.correspondence}`,
    advice: arcana.advice,
  };
}

function readOraclePosition(
  card: DrawnCard,
  positionName: string,
  prompt: string,
): { text: string; keywords: string[]; subtitle: string; advice: string } {
  const name = card.customName?.trim() || 'Carta sin nombre';
  const meaning = card.customMeaning?.trim();

  const orientationNote = card.reversed
    ? ` Al salir invertida, su mensaje se lee en falta o en exceso: la cualidad de «${name}» está pidiendo espacio, o se está manifestando desbordada.`
    : '';

  const base = meaning
    ? `${capitalize(meaning)}${meaning.endsWith('.') ? '' : '.'}`
    : `«${name}» llega sin un significado cargado, así que se lee por su imagen y por la primera sensación que despierta. Anota qué te evoca: en los mazos de oráculo, esa respuesta inmediata es la interpretación.`;

  const bridge = ` En «${positionName}» este mensaje se aplica a ${prompt}.`;

  return {
    text: fixContractions(`${base}${orientationNote}${bridge}`),
    keywords: meaning ? extractKeywords(meaning).slice(0, 3) : [],
    subtitle: card.reversed ? 'Oráculo · invertida' : 'Oráculo',
    advice: '',
  };
}

/** Extrae palabras significativas de un texto libre. */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Lectura con mazo personalizado. Usa los significados que el usuario escribió
 * para la orientación correspondiente y, si faltan, recurre al otro sentido
 * aclarando la inversión, igual que haría una lectora con su propio mazo.
 */
function readCustomDeckPosition(
  card: DrawnCard,
  deckCard: CustomCard | undefined,
  positionName: string,
  prompt: string,
  index: number,
  category: QuestionCategory = 'general',
): { text: string; keywords: string[]; subtitle: string; advice: string } {
  const name = deckCard?.name?.trim() || card.customName?.trim() || 'Carta sin nombre';

  if (!deckCard) {
    return {
      text: fixContractions(
        `«${name}» ya no está en el mazo actual, así que se lee sólo por su lugar en la tirada: la posición «${positionName}» apunta a ${prompt}.`,
      ),
      keywords: [],
      subtitle: 'Mazo propio',
      advice: '',
    };
  }

  const upright = deckCard.upright?.trim();
  const reversedText = deckCard.reversed?.trim();
  const ownKeywords = (card.reversed ? deckCard.reversedKeywords : deckCard.keywords) ?? [];
  const fallbackKeywords = (card.reversed ? deckCard.keywords : deckCard.reversedKeywords) ?? [];

  /* Texto base según la orientación, con degradación elegante. */
  let base: string;
  let note = '';
  /** false cuando el texto es un relleno nuestro y no palabras del usuario. */
  let hasOwnText = true;
  if (card.reversed) {
    if (reversedText) {
      base = `${capitalize(reversedText)}${reversedText.endsWith('.') ? '' : '.'}`;
    } else if (upright) {
      base = `${capitalize(upright)}${upright.endsWith('.') ? '' : '.'}`;
      note = ` Como no cargaste un sentido invertido para «${name}», esa misma energía se lee aquí en falta o en exceso: está pidiendo espacio, o se manifiesta desbordada.`;
    } else {
      base = `«${name}» sale invertida y todavía no tiene significado escrito en tu mazo: se lee por su imagen y por lo que despierta al verla del revés.`;
      hasOwnText = false;
    }
  } else {
    if (upright) {
      base = `${capitalize(upright)}${upright.endsWith('.') ? '' : '.'}`;
    } else if (reversedText) {
      base = `Todavía no escribiste el sentido derecho de «${name}». Como referencia, invertida significa: ${reversedText.replace(/\.$/, '')}. Al derecho, léelo como esa misma fuerza ya integrada.`;
    } else {
      base = `«${name}» aún no tiene significado escrito en tu mazo: se lee por su imagen y por la primera sensación que despierta. Lo que anotes ahora puedes guardarlo después en la carta.`;
      hasOwnText = false;
    }
  }

  /* Puente con la posición, con las palabras clave del usuario si existen. */
  const kw = (ownKeywords.length ? ownKeywords : fallbackKeywords).slice(0, 3);
  const connector = CONNECTORS[index % CONNECTORS.length];
  const orientation = card.reversed ? 'invertida' : 'al derecho';
  const bridge = kw.length
    ? ` Al caer ${orientation} en «${positionName}», ${connector} ${prompt}: ${joinNatural(kw)}.`
    : ` Al caer ${orientation} en «${positionName}», ${connector} ${prompt}.`;

  /* Nota puntual que el usuario haya escrito para esta lectura. */
  const own = card.customMeaning?.trim() ? ` Tu nota para esta tirada: ${card.customMeaning.trim()}` : '';

  /* Lo que la carta dice sobre el tema de la pregunta, si el usuario lo escribió. */
  const hint = hintForCategory(deckCard, category)?.trim();
  const categoryPhrase = hint
    ? ` En el plano de ${CATEGORY_PHRASE[category]}: ${capitalize(hint)}${/[.!?…]$/.test(hint) ? '' : '.'}`
    : '';

  const subtitleParts = [deckCard.subtitle?.trim(), card.reversed ? 'invertida' : undefined].filter(
    Boolean,
  ) as string[];

  return {
    text: fixContractions(`${base}${note}${bridge}${categoryPhrase}${own}`),
    // Sólo mostramos palabras clave si salen del mazo o de un texto propio.
    keywords: kw.length ? kw : hasOwnText ? extractKeywords(base).slice(0, 3) : [],
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : 'Mazo propio',
    advice: deckCard.advice?.trim() ?? '',
  };
}

/* --------------------------------------------------------------------------
   Detección de patrones
   -------------------------------------------------------------------------- */

function detectPatterns(
  cards: DrawnCard[],
  system: SystemId,
  stats: Interpretation['stats'],
  cardsById: CardsById,
  combinations: CardCombination[],
  deck?: CustomDeck | null,
): Pattern[] {
  const patterns: Pattern[] = [];
  const total = stats.total;
  if (total === 0) return patterns;

  /* --- 0. Combinaciones curadas de cartas (van primero: son más específicas
     que cualquier patrón estadístico). Sólo aplica a Rider-Waite, porque las
     combinaciones se definen por id de arcano. --- */
  if (system === 'rider-waite') {
    const drawnIds = new Set(cards.map((c) => c.arcanaId).filter((id): id is string => Boolean(id)));
    combinations.forEach((combo) => {
      if (combo.cardIds.every((id) => drawnIds.has(id))) {
        patterns.push({
          id: `combo-${combo.id}`,
          label: combo.name,
          detail: combo.meaning,
          tone: combo.tone,
        });
      }
    });
  }

  /* --- 1. Orientación de las cartas --- */
  const ratio = stats.reversed / total;
  if (stats.reversed === 0 && total > 1) {
    patterns.push({
      id: 'all-upright',
      label: 'Todas derechas',
      detail:
        'La energía circula sin trabas: lo que se mueve tiene vía libre y el proceso avanza hacia afuera. Es un momento para actuar, no para esperar.',
      tone: 'gold',
    });
  } else if (ratio >= 0.6) {
    patterns.push({
      id: 'mostly-reversed',
      label: `Mayoría invertidas (${stats.reversed}/${total})`,
      detail:
        'El foco está adentro. Predominan procesos internos, demoras y energías que todavía no encontraron su forma de expresarse. No es un bloqueo definitivo: es trabajo de raíz que aún no se ve.',
      tone: 'rose',
    });
  } else if (ratio >= 0.34) {
    patterns.push({
      id: 'some-reversed',
      label: `Varias invertidas (${stats.reversed}/${total})`,
      detail:
        'Hay resistencias puntuales conviviendo con partes que ya fluyen. Las posiciones invertidas marcan exactamente dónde falta destrabar algo.',
      tone: 'amber',
    });
  }

  if (system === 'rider-waite') {
    const arcanas = cards
      .map((c) => cardsById[c.arcanaId ?? ''])
      .filter((a): a is NonNullable<typeof a> => Boolean(a));

    /* --- 2. Elemento dominante --- */
    if (stats.dominantElement && stats.dominantElement.count >= 2 && stats.dominantElement.count / total >= 0.4) {
      const el = stats.dominantElement.element;
      patterns.push({
        id: `element-${el}`,
        label: `Predominio de ${ELEMENT_LABELS[el]}`,
        detail: `${stats.dominantElement.count} de ${total} cartas comparten el elemento ${ELEMENT_LABELS[el]}: la tirada se juega en el terreno de ${ELEMENT_MEANING[el]}.`,
        tone: 'violet',
      });
    }

    /* --- 3. Eje arquetípico repetido --- */
    const axisTop = topOf(arcanas.map((a) => a.axis));
    if (axisTop && axisTop.count >= 2) {
      patterns.push({
        id: `axis-${axisTop.value}`,
        label: `Eje repetido: ${AXIS_LABELS[axisTop.value]}`,
        detail: `Varias cartas insisten con el mismo tema (${AXIS_LABELS[axisTop.value]}). Cuando un eje se repite, el mazo está subrayando: ahí está el verdadero asunto, aunque la pregunta apuntara a otra parte.`,
        tone: 'gold',
      });
    }

    /* --- 4. Cartas de gran transformación --- */
    const heavy = arcanas.filter((a) =>
      ['la-muerte', 'la-torre', 'el-diablo', 'la-luna', 'el-juicio'].includes(a.id),
    );
    if (heavy.length >= 2) {
      patterns.push({
        id: 'heavy-transit',
        label: 'Tránsito intenso',
        detail: `Aparecen ${joinNatural(
          heavy.map((h) => h.name),
        )}. Es un pasaje de alta temperatura: algo se derrumba o se transforma sin pedir permiso. No conviene resistir, conviene acompañar.`,
        tone: 'rose',
      });
    }

    /* --- 5. Energía dominante --- */
    if (stats.dominantEnergy && stats.dominantEnergy.count >= 2 && total >= 3) {
      patterns.push({
        id: `energy-${stats.dominantEnergy.energy}`,
        label: `Tono ${stats.dominantEnergy.energy}`,
        detail: ENERGY_MEANING[stats.dominantEnergy.energy],
        tone: 'violet',
      });
    }

    /* --- 6. Altura de los arcanos (etapa del recorrido) ---
       Sólo tiene sentido sobre los Arcanos Mayores presentes: `number` ahora
       también identifica Menores (22-77), que siempre darían "alto" si no
       se filtran aquí. */
    const majorArcanas = arcanas.filter((a) => a.arcanaType === 'mayor');
    if (majorArcanas.length >= 3) {
      const high = majorArcanas.filter((a) => a.number >= 15).length;
      const low = majorArcanas.filter((a) => a.number <= 7).length;
      if (high / majorArcanas.length >= 0.5) {
        patterns.push({
          id: 'high-arcana',
          label: 'Arcanos altos',
          detail:
            'La mitad o más de los Arcanos Mayores de la tirada pertenecen al último tramo del recorrido: los hechos exceden la voluntad personal y trabajan a escala de destino. Lo que se decida aquí deja marca.',
          tone: 'gold',
        });
      } else if (low / majorArcanas.length >= 0.5) {
        patterns.push({
          id: 'low-arcana',
          label: 'Arcanos iniciales',
          detail:
            'Predominan los primeros Arcanos Mayores: se está en el comienzo de un ciclo, con más potencial que resultado. Todavía hay mucho margen para dar forma a lo que viene.',
          tone: 'amber',
        });
      }
    }

    /* --- 7. Palabras clave repetidas --- */
    const kwPool = cards.flatMap((c) => {
      const a = cardsById[c.arcanaId ?? ''];
      if (!a) return [];
      return c.reversed ? a.reversedKeywords : a.keywords;
    });
    const kwTop = topOf(kwPool);
    if (kwTop && kwTop.count >= 2) {
      patterns.push({
        id: `kw-${kwTop.value}`,
        label: `Eco: "${kwTop.value}"`,
        detail: `La idea de ${kwTop.value} aparece en más de una carta. Las repeticiones funcionan como subrayado del mazo: es el hilo conductor de la lectura.`,
        tone: 'gold',
      });
    }
  } else if (system === 'custom-deck') {
    /* --- Mazo propio: se usan los datos que el usuario haya cargado --- */
    const deckCards = cards
      .map((c) => deckCardOf(c, deck))
      .filter((c): c is CustomCard => Boolean(c));

    /* Elemento dominante (sólo si etiquetó elementos). */
    if (
      stats.dominantElement &&
      stats.dominantElement.count >= 2 &&
      stats.dominantElement.count / total >= 0.4
    ) {
      const el = stats.dominantElement.element;
      patterns.push({
        id: `element-${el}`,
        label: `Predominio de ${ELEMENT_LABELS[el]}`,
        detail: `${stats.dominantElement.count} de ${total} cartas de tu mazo comparten el elemento ${ELEMENT_LABELS[el]}: la tirada se juega en el terreno de ${ELEMENT_MEANING[el]}.`,
        tone: 'violet',
      });
    }

    /* Eje repetido (si etiquetó ejes). */
    const axisTop = topOf(
      deckCards.map((c) => c.axis).filter((a): a is NonNullable<CustomCard['axis']> => Boolean(a)),
    );
    if (axisTop && axisTop.count >= 2) {
      patterns.push({
        id: `axis-${axisTop.value}`,
        label: `Eje repetido: ${AXIS_LABELS[axisTop.value]}`,
        detail: `Varias cartas de tu mazo insisten con el mismo tema (${AXIS_LABELS[axisTop.value]}). Cuando un eje se repite, ahí está el verdadero asunto de la consulta.`,
        tone: 'gold',
      });
    }

    /* Energía dominante. */
    if (stats.dominantEnergy && stats.dominantEnergy.count >= 2 && total >= 3) {
      patterns.push({
        id: `energy-${stats.dominantEnergy.energy}`,
        label: `Tono ${stats.dominantEnergy.energy}`,
        detail: ENERGY_MEANING[stats.dominantEnergy.energy],
        tone: 'violet',
      });
    }

    /* Eco entre las palabras clave que escribió el usuario. */
    const kwPool = cards.flatMap((c) => {
      const dc = deckCardOf(c, deck);
      if (!dc) return [];
      const list = (c.reversed ? dc.reversedKeywords : dc.keywords) ?? [];
      return list.map((k) => k.trim().toLowerCase()).filter(Boolean);
    });
    const kwTop = topOf(kwPool);
    if (kwTop && kwTop.count >= 2) {
      patterns.push({
        id: `kw-${kwTop.value}`,
        label: `Eco: "${kwTop.value}"`,
        detail: `La idea de ${kwTop.value} aparece en más de una carta. Las repeticiones funcionan como subrayado del mazo: es el hilo conductor de la lectura.`,
        tone: 'gold',
      });
    }

    /* Cartas sin significado cargado: aviso útil, no un patrón místico. */
    const incomplete = cards.filter((c) => {
      const dc = deckCardOf(c, deck);
      if (!dc) return true;
      return c.reversed ? !dc.reversed?.trim() : !dc.upright?.trim();
    }).length;
    if (incomplete > 0) {
      patterns.push({
        id: 'deck-incomplete',
        label: `${incomplete} ${incomplete === 1 ? 'carta' : 'cartas'} sin significado`,
        detail:
          'Todavía falta escribir el sentido de algunas cartas de tu mazo para la orientación en que salieron. Puedes completarlo desde «Mis mazos» y la próxima lectura va a salir más rica.',
        tone: 'amber',
      });
    }
  } else {
    /* --- Oráculo: repeticiones sobre el texto que cargó el usuario --- */
    const pool = cards.flatMap((c) =>
      extractKeywords(`${c.customName ?? ''} ${c.customMeaning ?? ''}`),
    );
    const seenPerCard = cards.map((c) =>
      new Set(extractKeywords(`${c.customName ?? ''} ${c.customMeaning ?? ''}`)),
    );
    const counts = new Map<string, number>();
    pool.forEach((w) => {
      const inCards = seenPerCard.filter((s) => s.has(w)).length;
      counts.set(w, inCards);
    });
    const repeated = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    repeated.forEach(([word, n]) => {
      patterns.push({
        id: `oracle-kw-${word}`,
        label: `Eco: "${word}"`,
        detail: `La palabra «${word}» aparece en ${n} cartas distintas. En los mazos de oráculo la repetición es la señal más clara: el mensaje insiste ahí.`,
        tone: 'gold',
      });
    });

    if (total >= 5) {
      patterns.push({
        id: 'oracle-wide',
        label: 'Lectura extensa',
        detail:
          'Con esta cantidad de cartas conviene leer primero el conjunto —el clima general— y sólo después el detalle de cada posición. La forma completa dice más que la suma de partes.',
        tone: 'violet',
      });
    }
  }

  return patterns;
}

/* --------------------------------------------------------------------------
   Conclusión integradora
   -------------------------------------------------------------------------- */

function buildConclusion(
  positions: PositionReading[],
  patterns: Pattern[],
  stats: Interpretation['stats'],
  spread: Spread,
  system: SystemId,
  cards: DrawnCard[],
  cardsById: CardsById,
  question?: string,
  deck?: CustomDeck | null,
): string[] {
  const paragraphs: string[] = [];
  const total = stats.total;
  const first = positions[0];
  const last = positions[positions.length - 1];

  /* --- Párrafo 1: encuadre general --- */
  const climate =
    stats.reversed === 0
      ? 'un clima despejado, donde la energía tiene por dónde salir'
      : stats.reversed >= total * 0.6
        ? 'un clima interno y contenido, con más proceso que resultado visible'
        : 'un clima mixto, con partes que ya avanzan y otras que todavía piden trabajo';

  const opening = question?.trim()
    ? `Sobre lo que preguntaste —"${question.trim()}"— la tirada «${spread.name}» responde con ${total} ${
        total === 1 ? 'carta' : 'cartas'
      } y ${climate}.`
    : `La tirada «${spread.name}» se despliega en ${total} ${
        total === 1 ? 'posición' : 'posiciones'
      } y presenta ${climate}.`;

  const elementPhrase =
    system !== 'oracle' && stats.dominantElement && stats.dominantElement.count >= 2
      ? ` El terreno dominante es ${ELEMENT_LABELS[stats.dominantElement.element]}, así que lo central es ${
          ELEMENT_MEANING[stats.dominantElement.element]
        }.`
      : '';

  paragraphs.push(opening + elementPhrase);

  /* --- Párrafo 2: recorrido de la tirada --- */
  if (total === 1 && first) {
    paragraphs.push(
      `Todo el peso está en una sola imagen: ${first.cardName}. Cuando la respuesta llega en una única carta, no hay matices que la diluyan; conviene leerla literal y aplicarla sin traducirla demasiado. ${
        first.keywords.length ? `Quédate con ${joinNatural(first.keywords.slice(0, 2))}.` : ''
      }`,
    );
  } else if (first && last) {
    paragraphs.push(
      `El recorrido va desde «${first.position.name}», donde aparece ${first.cardName}, hasta «${last.position.name}», con ${last.cardName}. Ese arco marca el movimiento de la lectura: lo que se plantea al inicio encuentra su respuesta —o su consecuencia— al final. Leer esas dos cartas juntas, sin las del medio, suele revelar la trama principal de un tirón.`,
    );
  }

  /* --- Párrafo 3: patrones --- */
  if (patterns.length > 0) {
    const labels = patterns.slice(0, 3).map((p) => p.label.toLowerCase());
    paragraphs.push(
      `Los patrones detectados (${joinNatural(labels)}) no son adornos estadísticos: son la voz del conjunto. ${
        patterns[0].detail
      }`,
    );
  }

  /* --- Párrafo 4: síntesis y consejo --- */
  if (system === 'rider-waite') {
    const advices = cards
      .map((c) => cardsById[c.arcanaId ?? '']?.advice)
      .filter((a): a is string => Boolean(a));
    const unique = [...new Set(advices)].slice(0, 2);
    if (unique.length > 0) {
      paragraphs.push(
        `Como síntesis práctica, las cartas coinciden en dos movimientos concretos: ${joinNatural(
          unique.map((a) => a.replace(/\.$/, '').toLowerCase()),
        )}. Si tuvieras que quedarte con una sola cosa de esta lectura, que sea eso: no la predicción, sino el gesto que está a tu alcance ahora.`,
      );
    }
  } else if (system === 'custom-deck') {
    const advices = cards
      .map((c) => deckCardOf(c, deck)?.advice?.trim())
      .filter((a): a is string => Boolean(a));
    const unique = [...new Set(advices)].slice(0, 2);
    if (unique.length > 0) {
      paragraphs.push(
        `Como síntesis práctica, tu mazo coincide en ${
          unique.length === 1 ? 'un movimiento concreto' : 'dos movimientos concretos'
        }: ${joinNatural(
          unique.map((a) => a.replace(/\.$/, '').toLowerCase()),
        )}. Es tu propio lenguaje devuelto en forma de consejo: si algo te suena obvio al leerlo, es justamente por eso.`,
      );
    } else {
      paragraphs.push(
        `Como cierre, relee las cartas en el orden en que salieron: al ser tu mazo, los significados ya están escritos con tus palabras, y la lectura funciona mejor si confías en esa primera formulación. Lo que hoy te falte decir de una carta, agrégalo a «${
          deck?.name?.trim() || 'tu mazo'
        }» y la próxima tirada va a hablar más claro.`,
      );
    }
  } else {
    paragraphs.push(
      'Como cierre, relee las cartas en el orden en que las cargaste y quédate con la frase que se te repitió mentalmente al escribirlas. En los mazos de oráculo, la interpretación válida es la que te resuena en el cuerpo: el mazo da la imagen, tú das el sentido.',
    );
  }

  return paragraphs.map(fixContractions);
}

/* --------------------------------------------------------------------------
   API pública
   -------------------------------------------------------------------------- */

/**
 * Construye la interpretación completa de una lectura.
 * @param spread       tirada usada (define posiciones y orden)
 * @param cardsMap     cartas cargadas, indexadas por id de posición
 * @param system       sistema de lectura
 * @param cardsById    cartas del Rider-Waite (traídas de la API), indexadas por id
 * @param combinations combinaciones curadas (traídas de la API)
 * @param category     tema elegido para la pregunta (amor/trabajo/dinero/salud/general)
 * @param question     pregunta opcional del consultante
 * @param deck         mazo personalizado, cuando el sistema es "custom-deck"
 */
export function interpret(
  spread: Spread,
  cardsMap: Record<string, DrawnCard>,
  system: SystemId,
  cardsById: CardsById,
  combinations: CardCombination[],
  category: QuestionCategory,
  question?: string,
  deck?: CustomDeck | null,
): Interpretation {
  const cards = spread.positions
    .map((pos) => cardsMap[pos.id])
    .filter((c): c is DrawnCard => Boolean(c));

  /* --- Estadísticas base --- */
  const total = cards.length;
  const reversed = cards.filter((c) => c.reversed).length;

  let dominantElement: Interpretation['stats']['dominantElement'];
  let dominantEnergy: Interpretation['stats']['dominantEnergy'];

  if (system === 'rider-waite') {
    const arcanas = cards
      .map((c) => cardsById[c.arcanaId ?? ''])
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    const el = topOf(arcanas.map((a) => a.element as Element));
    const en = topOf(arcanas.map((a) => a.energy as Energy));
    if (el) dominantElement = { element: el.value, count: el.count };
    if (en) dominantEnergy = { energy: en.value, count: en.count };
  } else if (system === 'custom-deck') {
    // Sólo si el usuario etiquetó elemento/energía en sus cartas.
    const deckCards = cards
      .map((c) => deckCardOf(c, deck))
      .filter((c): c is CustomCard => Boolean(c));
    const el = topOf(deckCards.map((c) => c.element).filter((e): e is Element => Boolean(e)));
    const en = topOf(deckCards.map((c) => c.energy).filter((e): e is Energy => Boolean(e)));
    if (el) dominantElement = { element: el.value, count: el.count };
    if (en) dominantEnergy = { energy: en.value, count: en.count };
  }

  const stats: Interpretation['stats'] = { total, reversed, dominantElement, dominantEnergy };

  /* --- Lectura por posición --- */
  const positions: PositionReading[] = spread.positions.map((pos, index) => {
    const card = cardsMap[pos.id] ?? { positionId: pos.id, reversed: false };
    const prompt = pos.prompt?.trim() || 'lo que esta posición representa en tu consulta';

    const read =
      system === 'rider-waite'
        ? readRiderWaitePosition(card, pos.name, prompt, index, cardsById, category)
        : system === 'custom-deck'
          ? readCustomDeckPosition(card, deckCardOf(card, deck), pos.name, prompt, index, category)
          : readOraclePosition(card, pos.name, prompt);

    return {
      position: pos,
      card,
      cardName: cardDisplayName(card, system, cardsById, deck),
      glyph: cardGlyph(card, system, index, cardsById, deck),
      subtitle: read.subtitle,
      keywords: read.keywords,
      text: read.text,
      advice: read.advice || undefined,
    };
  });

  const patterns = detectPatterns(cards, system, stats, cardsById, combinations, deck);
  const conclusion = buildConclusion(
    positions,
    patterns,
    stats,
    spread,
    system,
    cards,
    cardsById,
    question,
    deck,
  );

  return { positions, patterns, conclusion, stats };
}
