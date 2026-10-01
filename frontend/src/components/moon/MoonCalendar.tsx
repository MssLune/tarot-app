import { useMemo, useState } from 'react';
import { calendarMonth, festivalsOf, type CalendarDay } from '@arcana/tarot-core';
import MoonDisc from '../cards/MoonDisc';

/* ==========================================================================
   La Luna mes a mes: un calendario de verdad, con la Luna de cada día.

   Venía una tira de ocho fichas: las ocho fases del lunación. Es la
   información correcta pero no se lee como un calendario —no dice en qué día
   cae la Luna Llena de este mes, ni cuántos días faltan— y con una ficha por
   fase no hay forma de ver el ciclo entero developing.

   Con una celda por día se ve todo de un vistazo: la hilera de discos cuenta
   la historia del mes sin que haya que leer nada. El 25 crece hacia el 26, y
   se ve.

   Cada celda lleva SU disco, no el de la ficha. Si se pintara el mismo ocho
   veces, no se notaría la diferencia; al pintar 31, cualquier error de fase
   se ve enseguida.
   ========================================================================== */

const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Fecha de hoy a medianoche local, para comparar días y no horas. */
const hoyClave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function MoonCalendar() {
  const hoy = useMemo(() => new Date(), []);
  /* Mes y año visibles. Arranca en el de hoy, que es lo que se mira. */
  const [cursor, setCursor] = useState(() => ({ anio: hoy.getFullYear(), mes: hoy.getMonth() }));

  const celdas = useMemo(
    () => calendarMonth(cursor.anio, cursor.mes, festivalsOf(cursor.anio)),
    [cursor],
  );

  const hoyISO = hoyClave(hoy);

  const mover = (delta: number) =>
    setCursor(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });

  const irAMesActual = () => setCursor({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const esMesActual = cursor.anio === hoy.getFullYear() && cursor.mes === hoy.getMonth();

  /* Fases principales que caen en este mes, para la línea de arriba. */
  const fasesDelMes = useMemo(() => {
    const vistas = new Set<string>();
    const salida: { dia: number; nombre: string }[] = [];
    for (const c of celdas) {
      if (c.enMes && c.fase && !vistas.has(c.fase.id)) {
        vistas.add(c.fase.id);
        salida.push({ dia: c.date.getDate(), nombre: c.fase.name });
      }
    }
    return salida;
  }, [celdas]);

  return (
    <section className="panel gilded p-4 sm:p-5">
      {/* ---------------- Cabecera ---------------- */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Mes anterior"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-400/20 text-gold-200/70 transition-colors hover:border-gold-300/60 hover:text-gold-100"
        >
          ‹
        </button>

        <div className="min-w-0 text-center">
          <h3 className="font-display text-base text-gold-gradient">
            {MESES[cursor.mes]} {cursor.anio}
          </h3>
          {!esMesActual && (
            <button
              type="button"
              onClick={irAMesActual}
              className="mt-0.5 text-[0.58rem] uppercase tracking-[0.16em] text-gold-200/60 underline decoration-gold-400/30 underline-offset-4 hover:text-gold-100"
            >
              ir a hoy
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-400/20 text-gold-200/70 transition-colors hover:border-gold-300/60 hover:text-gold-100"
        >
          ›
        </button>
      </div>

      {/* ---------------- Cabecera de los días de la semana ---------------- */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[0.6rem] tracking-[0.1em] ${
              i === 0 || i === 6 ? 'text-rose-200/40' : 'text-gold-100/35'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ---------------- La rejilla ---------------- */}
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((c) => (
          <Celda key={hoyClave(c.date)} dia={c} esHoy={hoyISO === hoyClave(c.date)} />
        ))}
      </div>

      {/* ---------------- Leyenda ---------------- */}
      <p className="mt-3 text-[0.6rem] leading-relaxed text-gold-100/30">
        Cada disco es la Luna de ese día. La hora de cada fase está calculada al
        minuto; el día es el que le toca por zona horaria.
      </p>

      {fasesDelMes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {fasesDelMes.map((f) => (
            <li key={f.nombre} className="text-[0.62rem] text-gold-100/45">
              <span className="text-gold-200">{f.dia}</span> {f.nombre}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Una celda
   -------------------------------------------------------------------------- */

function Celda({ dia, esHoy }: { dia: CalendarDay; esHoy: boolean }) {
  const luna = useMemo(
    () => ({ angle: dia.angle, illumination: dia.illumination }),
    [dia.angle, dia.illumination],
  );

  /* La Luna Nueva es un disco negro sobre fondo negro: sin el aro, la celda
     parecería vacía y se pensaría que falta algo. */
  const casiOscura = dia.illumination < 0.06;

  return (
    <div
      className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border transition-colors ${
        esHoy
          ? 'border-gold-300/60 bg-gold-400/[0.13]'
          : dia.enMes
            ? 'border-gold-400/10 bg-ink-950/35'
            : 'border-transparent bg-transparent'
      }`}
    >
      <span
        className={`absolute left-1 top-0.5 text-[0.55rem] leading-none ${
          esHoy ? 'text-gold-200' : dia.enMes ? 'text-gold-100/45' : 'text-gold-100/15'
        }`}
      >
        {dia.date.getDate()}
      </span>

      {/* El disco va abajo para que el número no quede encima de él. */}
      <div className="mt-1.5">
        {casiOscura ? (
          <span
            className="block h-5 w-5 rounded-full border border-dashed border-gold-300/25"
            title="Luna Nueva"
          />
        ) : (
          <MoonDisc phase={luna} size={20} variant="icon" />
        )}
      </div>

      {/* Punto de festividad. Sin texto: no entra, y el nombre ya está en la
          lista de abajo. */}
      {dia.festividad && (
        <span
          className={`absolute bottom-1 h-1 w-1 rounded-full ${
            dia.festividad.granHoguera ? 'bg-gold-200' : 'bg-gold-100/35'
          }`}
          title={dia.festividad.name}
        />
      )}
    </div>
  );
}