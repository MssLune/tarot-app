/* ==========================================================================
   Estaciones del año: equinoccios y solsticios.

   Hace falta porque de las cuatro Hogueras sólo Imbolc coincide con un
   solsticio; las otras tres se definen como "la mitad entre tal y cual", y los
   equinoccios se corren un día cada tanto. Si uno los pone en fecha fija, cada
   pocos años la app le dice al usuario que una festividad cayó en el día
   equivocado.

   Se calculan, no se consultan. Es la diferencia entre una app que hay que
   abrir en enero para meterle los datos de 2027 y una que no hay que tocar
   nunca. La respuesta a "¿esto hay que actualizarlo cada año?" es: no.

   Método de Meeus, "Astronomical Algorithms" cap. 25 (baja precisión), por
   Newcomb. Longitud solar aparente con los términos periódicos principales.

   PRECISIÓN: ~0,01° en longitud, que son unos 15 minutos de tiempo. Para
   decidir la FECHA de un solsticio sobra de largo —el error sólo podría
   cruzar la medianoche, y eso no pasa—. Para decir la hora exacta del
   equinoccio, no: no usar para eso.
   ========================================================================== */

/** Longitud solar aparente, en grados, para una fecha juliana. */
function longitudAparente(jde: number): number {
  const t = (jde - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * (Math.PI / 180);

  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);

  const omega = (125.04 - 1934.136 * t) * (Math.PI / 180);
  return L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
}

/**
 * Grados que le faltan a la longitud del Sol para llegar al objetivo, con
 * signo y en (-180, 180].
 *
 * Positivo significa "avanzar", que es como lo usa el paso de Newton. Es
 * importance orden: al revés el iterador no converge nunca, porque camina en
 * dirección contraria a la que le falta y se aleja del evento.
 *
 * Con signo, aunque el sol siempre avance y eso parezca raro: el iterador
 * necesita poder corregir una sobrepasada. Si la longitud quedó en 0,005° y el
 * objetivo es 0°, la diferencia "siempre hacia adelante" vale 359,995° —casi un
 * año entero— y el método se dispara. Con signo vale 0,005°, que es el ajuste
 * que hace falta.
 */
function faltanGrados(longitud: number, objetivo: number): number {
  return ((((objetivo - longitud) % 360) + 540) % 360) - 180;
}

export type SeasonId = 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice';

export interface Season {
  id: SeasonId;
  /** Nombre en español. */
  name: string;
  /** Fecha, con la hora del evento. */
  date: Date;
  /** `true` si es solsticio, `false` si es equinoccio. */
  solstice: boolean;
}

/**
 * Fecha de una estación, por Newton sobre la longitud solar.
 *
 * Se parte de una fecha aproximada y se itera: si faltan `d` grados para el
 * objetivo, y el sol avanza 0,9856° por día, faltan `d / 0,9856` días.
 *
 * El paso se limita a 2 días por vuelta. Con las fechas iniciales de abajo, que
 * están a menos de dos días del evento, no hace falta: alcanza con una vuelta.
 * El tope está para el caso de que alguien llame a esta función con una fecha
 * inicial absurda. Sin tope, un error de un año no se corrige nunca, porque cada
 * paso afina el objetivo equivocado y el método se queda clavado ahí.
 */
function seasonDate(year: number, objetivo: number, mes: number, dia: number): Date {
  let jde = Date.UTC(year, mes, dia) / 86400000 + 2440587.5;
  for (let i = 0; i < 24; i += 1) {
    const d = faltanGrados(longitudAparente(jde), objetivo);
    if (Math.abs(d) < 1e-7) break;
    jde += Math.max(-2, Math.min(2, d / 0.9856));
  }
  return new Date((jde - 2440587.5) * 86400000);
}

/**
 * Las cuatro estaciones de un año, en orden.
 *
 * Las fechas son en UTC. La festividad es un día entero, así que el desfase
 * con la zona horaria del usuario no cambia casi nunca la fecha que ve; y donde
 * sí podría, es información correcta: el solsticio de 2026 es a las 08:24 UTC,
 * que en Buenos Aires es de madrugada.
 */
export function seasonsOf(year: number): Season[] {
  return [
    { id: 'march-equinox', name: 'Equinoccio de primavera', date: seasonDate(year, 0, 2, 20), solstice: false },
    { id: 'june-solstice', name: 'Solsticio de verano', date: seasonDate(year, 90, 5, 21), solstice: true },
    { id: 'september-equinox', name: 'Equinoccio de otoño', date: seasonDate(year, 180, 8, 22), solstice: false },
    { id: 'december-solstice', name: 'Solsticio de invierno', date: seasonDate(year, 270, 11, 21), solstice: true },
  ];
}