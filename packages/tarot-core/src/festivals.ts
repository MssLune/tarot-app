/* ==========================================================================
   Festividades del año de la tradición de las brujas.

   Responde a la pregunta "¿esto hay que actualizarlo cada año?" con un no.

   Casi todo son fechas fijas: el 1 de febrero va a ser el 1 de febrero en
   2031 igual que en 2026. Lo único que se mueve son los equinoccios y los
   solsticios, y eso sale de `seasonsOf`. O sea que el calendario se calcula y
   no hay tabla que mantener: no hay nada que actualizar en enero, ni ahora ni
   nunca.

   De las cuatro Hogueras, además, sólo Imbolc coincide con una estación. Las
   otras tres están, por tradición, en el 1º del mes. Se puede discutir si
   esa fecha o el cálculo del equinoccio es lo correcto, y está escrito abajo,
   en `notaSobreFechasDeLasHogueras`, para que quien lo lea sepa qué se está
   eligiendo y por qué.

   SOBRE LAS FUENTES: los textos son redacción propia, sin citar ningún libro.
   Es la misma regla que los significados de las cartas: nada de atribuir a un
   autor que no se leyó. Cuando un relato es más reciente de lo que aparenta,
   se dice en el texto en vez de dejarlo parecer antiguo.
   ========================================================================== */

import { seasonsOf, type Season, type SeasonId } from './solar';

export interface Festival {
  id: string;
  /** Nombre principal. */
  name: string;
  /** Otros nombres por los que también se la conoce. */
  altNames?: string[];
  /** Fecha de la festividad. Para las solares, con la hora del evento. */
  date: Date;
  /** `true` si la fecha la fija el calendario; `false` si sale del Sol. */
  fixed: boolean;
  /** `true` para las cuatro grandes Hogueras. */
  granHoguera?: boolean;
  /** Una línea, para la lista. */
  resumen: string;
  /** El texto largo, que se despliega al hacer click. */
  detalle: string;
}

/**
 * Fecha fija de una festividad, en hora local del servidor.
 *
 * A mediodía local y no en UTC, a propósito: la fecha de una fiesta es un día
 * del calendario civil de quien la celebra, no un instante. Si se hiciera en
 * UTC, el 1 de febrero sería el 31 de enero para cualquiera al oeste de
 * Greenwich, que es exactamente el error que hay que evitar.
 *
 * Mediodía y no medianoche porque un `new Date(anio, mes-1, dia)` cae a las
 * 00:00 y, según el huso del servidor, el mismo número puede describir dos
 * días distintos según de dónde se mire. El mediodía es el instante más
 * seguro del día para nombrar un día.
 */
function fija(anio: number, mes: number, dia: number): Date {
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
}

/**
 * Las festividades de un año, ordenadas por fecha.
 *
 * `mes` va de 1 a 12 en los argumentos de `fija`.
 */
export function festivalsOf(anio: number): Festival[] {
  const estaciones = new Map<SeasonId, Season>(seasonsOf(anio).map((s) => [s.id, s]));
  const de = (id: SeasonId): Date => estaciones.get(id)!.date;

  const fijas: Festival[] = [
    {
      id: 'imbolc',
      name: 'Imbolc',
      altNames: ['Fiesta de las Luces'],
      date: fija(anio, 2, 1),
      fixed: true,
      granHoguera: true,
      resumen: 'Primera de las cuatro Hogueras: la luz empieza a volver.',
      detalle:
        'Cae a mitad de camino entre el solsticio de invierno y el equinoccio de primavera, que es justo cuando en el hemisferio norte los días se alargan a ojos vistas. La costumbre era encender hogueras en las alturas, no en el valle: el humo subiendo hacia el cielo era la petición, y lo que se pedía era que el sol tuviera fuerza para volver a crecer. En la ofrenda iban las últimas cosas de la cosecha anterior, la última panocha de trigo o el último trozo de miel, como quien saluda a lo que se terminó antes de sembrar lo nuevo. Es una fiesta del principio, no del final: Imbolc marca el momento en que la tierra empieza a germinar bajo la tierra aunque arriba todavía haya nieve.',
    },
    {
      id: 'walpurgis',
      name: 'Walpurgis',
      altNames: ['Noche de Walpurgis'],
      date: fija(anio, 4, 30),
      fixed: true,
      resumen: 'La noche antes de Beltane. Se encienden las hogueras.',
      detalle:
        'La víspera de Beltane, y en eso se parece a una prefiesta. La tradición la celebra sobre todo en el centro y el norte de Europa, con hogueras que se encienden al anochecer y se apagan al amanecer. La noche tiene su fama propia: en el relato que se le atribuyó, las brujas vuelan en escoba y se juntan en la montaña de Brocken para saludar a la primavera. Ese detalle es del siglo XVIII en adelante, y forma parte de la difusión que hizo el Romanticismo alemán con la brujería; el fuego en la colina es mucho más antiguo que la escoba. Si te interesa la práctica y no el cuento, esto es lo que hay: una noche de fuego al aire libre, en la última helada del año.',
    },
    {
      id: 'beltane',
      name: 'Beltane',
      altNames: ['Beltane Fires', '1 de Mayo'],
      date: fija(anio, 5, 1),
      fixed: true,
      granHoguera: true,
      resumen: 'Pasaje a la luz larga: la primera de las dos Hogueras de verano.',
      detalle:
        'La mitad entre el equinoccio de primavera y el solsticio de verano, y el momento en que el sol ya tiene la fuerza suficiente para que la tierra crezca de verdad. Las hogueras se hacían en las alturas y el ganado se pasaba por el humo, como quien pide que no se male un año malo. La fiesta era también el momento de las parejas, y en las highlands escocesas todavía se eligen ese día los que cantan las canciones nupciales. Desde acá hasta Lughnasadh el sol está en su mejor momento: los días largos y el calor útil para la cosecha.',
    },
    {
      id: 'san-juan',
      name: 'Noche de San Juan',
      altNames: ['San Juan Bautista', 'Vigilia de San Juan'],
      date: fija(anio, 6, 24),
      fixed: true,
      resumen: 'La noche más corta, la más cercana al solsticio.',
      detalle:
        'Es la fiesta del calendario popular superpuesto sobre el solsticio de verano, que cae cerca: el 21 o el 22, tres días antes. El 24 de junio es el día de San Juan Bautista en el calendario religioso, y la gente lo celebra igual porque venía de antes. La costumbre es el fuego y el agua: se encienden las hogueras de la noche larga y al amanecer se «bautiza» con el rocío, que se guardaba para curar. También es la noche de adivinar, y en el norte de la península se leía el futuro en la sombra de las brasas. El detalle astronómico que está detrás: la Luna llena más cercana al solsticio cae por aquí, y por eso esa noche hay luna casi siempre.',
    },
    {
      id: 'lughnasadh',
      name: 'Lughnasadh',
      altNames: ['Lammas', 'Lugnasadh'],
      date: fija(anio, 8, 1),
      fixed: true,
      granHoguera: true,
      resumen: 'Primera cosecha. La luz empieza a aflojar.',
      detalle:
        'La mitad entre el solsticio de verano y el equinoccio de otoño, y la primera de las cosechas: el grano está maduro y lo que se corta ahora tiene un valor distinto al que se corta en septiembre. Lammas viene de «loaf-mass», la misa del pan: se hacía un pan grande con el primer trigo y se partía entre todos. Lughnasadh lleva el nombre de Lugh, y la tradición lo celebra con juegos de destreza y no con ofrendas, porque es una fiesta de lo que uno gana, no de lo que se da. Desde este día los días se acortan de forma que se nota: al mediodía la sombra crece más que nunca.',
    },
    {
      id: 'samhain',
      name: 'Samhain',
      altNames: ['Halloween', 'Noche de Todos los Santos'],
      date: fija(anio, 10, 31),
      fixed: true,
      granHoguera: true,
      resumen: 'El velo más fino del año: la noche en que se adivina.',
      detalle:
        'Cae a mitad de camino entre el equinoccio de otoño y el solsticio de invierno, y es la noche más larga del año, la más oscura. Las hogueras se encendían y se dejaban para que nadie las apagara, y se ponía comida en la ventana o en el umbral para los que volvían, que no eran los vivos. En el relato que se armó alrededor, es la noche en que el velo entre los dos mundos es más fino, y por eso es la noche de las adivinaciones. Ese velo es la parte menos antigua: el Halloween que conocemos es del siglo XX, con la bruja de la vela y la calabaza, pero Samhain es mucho más viejo y es lo que le da el nombre. También es el comienzo del invierno.',
    },
  ];

  const solares: Festival[] = [
    {
      id: 'equinoccio-primavera',
      name: 'Equinoccio de primavera',
      altNames: ['Ostara', 'Primavera'],
      date: de('march-equinox'),
      fixed: false,
      resumen: 'Tan largo el día como la noche. La tierra se equilibra.',
      detalle:
        'El sol cruza el ecuador y en teoría el día y la noche duran lo mismo. En la práctica no: la atmósfera refracta la luz y el disco del sol tiene tamaño, así que el día dura siempre un poco más que la noche, aunque después de registrar el crepúsculo de amanecer y ocaso. A partir de acá los días se alargan hasta el solsticio. También es el momento del equinoccio de otoño en el hemisferio sur, donde es al revés, y por eso en Argentina y en Chile el año empieza a oscurecerse en vez de alargarse.',
    },
    {
      id: 'solsticio-verano',
      name: 'Solsticio de verano',
      altNames: ['Solsticio boreal'],
      date: de('june-solstice'),
      fixed: false,
      resumen: 'El día más largo del año. La luz en su punto máximo.',
      detalle:
        'El día más largo del año, y el momento en que el sol está más alto en el cielo a mediodía. Digo «solsticio» y no «el día más largo» a propósito, porque el día más largo de verdad es el que termina unas horas más tarde: el sol sigue bajando un rato después del solsticio. La sombra más corta del año no es, entonces, la de ese día, sino la de los días previos. Es la puerta de entrada al verano y la fecha en la que se encienden las hogueras más grandes.',
    },
    {
      id: 'equinoccio-otono',
      name: 'Equinoccio de otoño',
      altNames: ['Mabón', 'Otoño'],
      date: de('september-equinox'),
      fixed: false,
      resumen: 'El equilibrio otra vez. Y desde acá, la luz baja.',
      detalle:
        'La segunda vez que el día y la noche se emparejan, y la que sí es el principio del descenso: desde este día hasta el solsticio de invierno se pierden casi dos minutos de luz por día, que es la razón por la que la sombra del mediodía crece tan rápido en esta estación. Es también la fiesta de la cosecha en casi todas las tradiciones de las que tenemos registro escrito, con el mismo nombre o con otros: Mabón, Mabon, y en la India la Purnima del mes de ashwin. Lo que se celebra no es que termine el ciclo, sino que lo que se sembró esté a punto de recogerse.',
    },
    {
      id: 'solsticio-invierno',
      name: 'Solsticio de invierno',
      altNames: ['Yule', 'Navidad del Sol'],
      date: de('december-solstice'),
      fixed: false,
      resumen: 'La noche más larga. Y desde acá, la luz crece.',
      detalle:
        'La noche más corta del año y el punto más bajo del sol. Es el momento bisagra del calendario solar: después de esta fecha, todos los días tienen un poco más de luz que el anterior, hasta el verano siguiente. El nombre Yule viene del nórdico «jol», que se usaba en la expresión «jólablang», la noche de Yule, y que aparece en inglés antiguo como «yule» —y de ahí saltó a la Navidad, que es la misma fiesta con otro nombre. Encender fuego en la noche más larga era la forma de fingir que la luz ya estaba.',
    },
  ];

  return [...fijas, ...solares].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Festividad más próxima a una fecha, sea hacia adelante o hacia atrás.
 *
 * Por qué no sólo "la siguiente": al abrir la pantalla el 1 de febrero, Imbolc
 * es la festividad de HOY y no la próxima. Si sólo se mirara hacia adelante, la
 * app arrancaría mostrando Beltane y ocultando lo que está pasando.
 */
export function nearestFestival(
  date: Date,
  anio = date.getFullYear(),
): { festival: Festival; days: number } | null {
  const lista = festivalsOf(anio);
  if (lista.length === 0) return null;

  const hoy = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  let mejor: { festival: Festival; days: number } | null = null;

  for (const f of lista) {
    // Comparar en UTC el día-civil: si no, una festividad solar queda a un día
    // de distancia según la hora en que se mire, y el error se nota justo en
    // el día de la fiesta, que es cuando importa.
    const dias = Math.round(
      (Date.UTC(f.date.getFullYear(), f.date.getMonth(), f.date.getDate()) - hoy) / 86400000,
    );
    if (Math.abs(dias) < Math.abs(mejor?.days ?? Infinity)) mejor = { festival: f, days: dias };
  }
  return mejor;
}

/**
 * Por qué las cuatro Hogueras están en su fecha de calendario y no en la mitad
 * exacta entre dos estaciones.
 *
 * Imbolc, Beltane, Lughnasadh y Samhain están, por lo que cuentan los textos,
 * en el 1º de febrero, 1º de mayo, 1º de agosto y 31 de octubre. Se los pone
 * ahí a propósito, aunque la definición astronómica los sitúe en la mitad
 * exacta entre dos estaciones, que puede caer un día antes o después.
 *
 * La razón es que «la mitad entre tal y cual» es una reconstrucción del siglo
 * XX, hecha para que las cuatro fechas quedaran simétricas, y no una costumbre
 * antigua. Lo que se demuestra con la práctica es lo otro: el 1º de mayo y el 31 de
 * octubre se han celebrado en esas fechas durante siglos. Moverlos un día para
 * cuadrar una simetría geométrica sería falsear lo que la gente efectivamente
 * hizo.
 */
export const notaSobreFechasDeLasHogueras =
  'Imbolc, Beltane, Lughnasadh y Samhain están en su fecha tradicional, no en la mitad exacta entre dos estaciones. La definición geométrica es una reconstrucción moderna; las fechas son las que la gente celebra hace siglos.';