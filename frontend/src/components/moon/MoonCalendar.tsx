import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { calendarMonth, festivalsOf, type CalendarDay } from '@arcana/tarot-core';
import MoonDisc from '../cards/MoonDisc';
import { retrogradosDelAnio, type RetrogradePeriod } from '../../services/api';

/* ==========================================================================
   La Luna mes a mes: un calendario de verdad, con la Luna de cada día.

   Venía una tira de ocho fichas: las ocho fases del lunación. Es la
   información correcta pero no se lee como un calendario —no dice en qué día
   cae la Luna Llena de este mes, ni cuántos días faltan— y con una ficha por
   fase no hay forma de ver el ciclo entero.

   Con una celda por día se ve todo de un vistazo: la hilera de discos cuenta
   la historia del mes sin que haya que leer nada.

   CADA CELDA LLEVA SU DISCO. Si se pintara el mismo ocho veces no se notaría
   la diferencia; al pintar 31, cualquier error de fase se ve enseguida.

   POR QUÉ PUNTOS Y NO TEXTO EN LA CELDA
   ------------------------------------
   En el teléfono una celda mide unos 45px de ancho. "Samhain" no entra, y si
   se pone el nombre la celda queda más alta que las de al lado y la grilla se
   rompe a simple vista.

   Entonces la celda lleva el día, el disco, y los puntos; y el detalle se lee
   tocando el día, que es lo que hace un calendario de verdad. El nombre de la
   festividad y el nombre del planeta retrógrado no se pierden: están a un
   toque, y en el detalle hay lugar para escribirlos enteros.
   ========================================================================== */

const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const FECHA_LARGA = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Fecha a medianoche local, para comparar días y no horas. */
const claveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** El día en formato `AAAA-MM-DD`, que es como vienen los retrógrados. */
const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MoonCalendar() {
  const hoy = useMemo(() => new Date(), []);
  /* Mes y año visibles. Arranca en el de hoy, que es lo que se mira. */
  const [cursor, setCursor] = useState(() => ({ anio: hoy.getFullYear(), mes: hoy.getMonth() }));
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [retrogrados, setRetrogrados] = useState<RetrogradePeriod[]>([]);

  const celdas = useMemo(() => calendarMonth(cursor.anio, cursor.mes, festivalsOf(cursor.anio)), [cursor]);

  /* Un request por año, y cacheado en el backend. Nunca tira: si falla, la
     lista queda vacía y el calendario sigue mostrando fases y festividades. */
  useEffect(() => {
    let vivo = true;
    void retrogradosDelAnio(cursor.anio).then((r) => {
      if (vivo) setRetrogrados(r);
    });
    return () => {
      vivo = false;
    };
  }, [cursor.anio]);

  /* Índices por día, para no buscar con `.find` en cada celda. Con 42 celdas
     y una lista de 14, son 588 comparaciones por render: no es mucho, pero
     tampoco hace falta. */
  const queEmpiezanAqui = useMemo(() => {
    const m = new Map<string, RetrogradePeriod[]>();
    for (const p of retrogrados) {
      const dia = p.desde.slice(0, 10);
      m.set(dia, [...(m.get(dia) ?? []), p]);
    }
    return m;
  }, [retrogrados]);

  /* Y los que están en curso ese día, para el detalle: el retrógrado no dura
     un día, así que al tocar el 12 de octubre hay que poder decir que Mercurio
     lleva dos semanas retrógrado, aunque empezó el 24 del mes pasado. */
  const enCursoPorDia = useMemo(() => {
    const m = new Map<string, RetrogradePeriod[]>();
    for (const celda of celdas) {
      const dia = isoDia(celda.date);
      const activas = retrogrados.filter(
        (p) => p.desde.slice(0, 10) <= dia && p.hasta.slice(0, 10) >= dia,
      );
      if (activas.length > 0) m.set(dia, activas);
    }
    return m;
  }, [celdas, retrogrados]);

  const hoyISO = claveDia(hoy);

  const mover = (delta: number) => {
    setCursor(({ anio, mes }) => {
      const d = new Date(anio, mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
    /* Al cambiar de mes, la selección del mes anterior ya no está en pantalla:
       dejarla highlighting una celda invisible sería un estado fantasma. */
    setSeleccion(null);
  };

  const irAMesActual = () => {
    setCursor({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
    setSeleccion(null);
  };
  const esMesActual = cursor.anio === hoy.getFullYear() && cursor.mes === hoy.getMonth();

  const celdaSeleccionada = seleccion ? celdas.find((c) => claveDia(c.date) === seleccion) : undefined;

  /* Fases principales que caen en este mes, para la línea de abajo. */
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
        {celdas.map((c) => {
          const dia = isoDia(c.date);
          return (
            <Celda
              key={claveDia(c.date)}
              dia={c}
              esHoy={hoyISO === claveDia(c.date)}
              seleccionada={seleccion === claveDia(c.date)}
              retrogradosQueEmpiezan={queEmpiezanAqui.get(dia)?.length ?? 0}
              onSelect={() => setSeleccion(seleccion === claveDia(c.date) ? null : claveDia(c.date))}
            />
          );
        })}
      </div>

      {/* ---------------- Detalle del día ---------------- */}
      <AnimatePresence initial={false}>
        {celdaSeleccionada && (
          <motion.div
            key="detalle"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <DetalleDia
              dia={celdaSeleccionada}
              empiezan={queEmpiezanAqui.get(isoDia(celdaSeleccionada.date)) ?? []}
              enCurso={enCursoPorDia.get(isoDia(celdaSeleccionada.date)) ?? []}
              onCerrar={() => setSeleccion(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- Leyenda ---------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.58rem] text-gold-100/35">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-200" />
          Festividad
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-300" />
          Empieza retrógrado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-100/40" />
          Fase principal
        </span>
      </div>

      {fasesDelMes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {fasesDelMes.map((f) => (
            <li key={f.nombre} className="text-[0.62rem] text-gold-100/45">
              <span className="text-gold-200">{f.dia}</span> {f.nombre}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[0.58rem] leading-relaxed text-gold-100/25">
        Tocá un día para ver su detalle. La hora de cada fase está calculada al
        minuto; el día es el que le toca por zona horaria.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------------------
   Una celda
   -------------------------------------------------------------------------- */

function Celda({
  dia,
  esHoy,
  seleccionada,
  retrogradosQueEmpiezan,
  onSelect,
}: {
  dia: CalendarDay;
  esHoy: boolean;
  seleccionada: boolean;
  retrogradosQueEmpiezan: number;
  onSelect: () => void;
}) {
  const luna = useMemo(() => ({ angle: dia.angle, illumination: dia.illumination }), [dia.angle, dia.illumination]);

  /* La Luna Nueva es un disco negro sobre fondo negro: sin el aro, la celda
     parecería vacía y se pensaría que falta algo. */
  const casiOscura = dia.illumination < 0.06;

  const puntos: { clave: string; clase: string; titulo: string }[] = [];
  if (dia.festividad) {
    puntos.push({
      clave: 'fest',
      clase: 'bg-gold-200',
      titulo: dia.festividad.granHoguera ? `Hoguera: ${dia.festividad.name}` : dia.festividad.name,
    });
  }
  if (retrogradosQueEmpiezan > 0) {
    puntos.push({ clave: 'ret', clase: 'bg-rose-300', titulo: 'Empieza un retrógrado' });
  }
  if (dia.fase) {
    puntos.push({ clave: 'fase', clase: 'bg-gold-100/40', titulo: dia.fase.name });
  }

  /* Las celdas del mes vecino no son interactivas: si se pudieran tocar,
     abriría un detalle de un día que no está en el mes que se está mirando. */
  if (!dia.enMes) {
    return (
      <div className="relative flex aspect-square items-center justify-center">
        <span className="absolute left-1 top-0.5 text-[0.55rem] leading-none text-gold-100/15">
          {dia.date.getDate()}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Día ${dia.date.getDate()}${puntos.length ? `, con ${puntos.length} evento` : ''}`}
      aria-pressed={seleccionada}
      className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border transition-colors ${
        seleccionada
          ? 'border-gold-200/80 bg-gold-400/[0.18]'
          : esHoy
            ? 'border-gold-300/60 bg-gold-400/[0.13]'
            : 'border-gold-400/10 bg-ink-950/35 hover:border-gold-400/35 hover:bg-ink-950/60'
      }`}
    >
      <span
        className={`absolute left-1 top-0.5 text-[0.55rem] leading-none ${
          esHoy ? 'text-gold-200' : 'text-gold-100/45'
        }`}
      >
        {dia.date.getDate()}
      </span>

      {/* El disco va abajo para que el número no quede encima de él. */}
      <div className="mt-1.5">
        {casiOscura ? (
          <span className="block h-5 w-5 rounded-full border border-dashed border-gold-300/25" />
        ) : (
          <MoonDisc phase={luna} size={20} variant="icon" animate={false} />
        )}
      </div>

      {/* Los puntos. Con `flex-wrap` y un ancho máximo, para que un día con
          tres eventos no desborde la celda ni la haga más alta que las
          vecinas: es el motivo por el que la festividad no va escrita aquí. */}
      {puntos.length > 0 && (
        <span className="mt-1 flex max-w-[80%] flex-wrap justify-center gap-0.5">
          {puntos.map((p) => (
            <span key={p.clave} className={`inline-block h-1 w-1 rounded-full ${p.clase}`} title={p.titulo} />
          ))}
        </span>
      )}
    </button>
  );
}

/* --------------------------------------------------------------------------
   El detalle del día
   -------------------------------------------------------------------------- */

function DetalleDia({
  dia,
  empiezan,
  enCurso,
  onCerrar,
}: {
  dia: CalendarDay;
  empiezan: RetrogradePeriod[];
  enCurso: RetrogradePeriod[];
  onCerrar: () => void;
}) {
  /* Lo que ya empezó antes y no termina hoy no se vuelve a anunciar: se dice
     "en curso desde el ..." para no repetir la fecha de inicio dos veces en la
     misma línea. */
  const continuados = enCurso.filter((p) => !empiezan.some((e) => e.planeta === p.planeta));

  const linea = (p: RetrogradePeriod) => `${p.nombre} retrógrado`;

  return (
    <div className="mt-3 rounded-xl border border-gold-400/20 bg-ink-950/50 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-sm capitalize text-gold-100">{FECHA_LARGA.format(dia.date)}</p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar detalle"
          className="shrink-0 text-gold-100/30 transition-colors hover:text-gold-100"
        >
          ✕
        </button>
      </div>

      <ul className="mt-2 space-y-1.5 text-[0.7rem] leading-relaxed">
        <li className="text-gold-100/55">
          Luna {Math.round(dia.illumination * 100)}% iluminada
          {dia.fase && <span className="text-gold-200"> · {dia.fase.name}</span>}
        </li>

        {dia.festividad && (
          <li className="text-gold-100/75">
            <span className="text-gold-200">
              {dia.festividad.granHoguera ? 'Hoguera' : 'Festividad'}
            </span>
            {' · '}
            {dia.festividad.name}
          </li>
        )}

        {empiezan.map((p) => (
          <li key={`empieza-${p.planeta}`} className="text-rose-100/85">
            <span className="text-rose-300">Empieza retrógrado</span> · {p.nombre},{' '}
            {p.dias} {p.dias === 1 ? 'día' : 'días'} hasta el {p.hasta.slice(8, 10)}/{p.hasta.slice(5, 7)}
          </li>
        ))}

        {continuados.map((p) => (
          <li key={`sigue-${p.planeta}`} className="text-gold-100/60">
            En curso · {linea(p)} desde el {p.desde.slice(8, 10)}/{p.desde.slice(5, 7)}, hasta el{' '}
            {p.hasta.slice(8, 10)}/{p.hasta.slice(5, 7)}
          </li>
        ))}
      </ul>

      {!dia.festividad && empiezan.length === 0 && continuados.length === 0 && !dia.fase && (
        <p className="mt-2 text-[0.65rem] text-gold-100/30">Sin nada marcado para este día.</p>
      )}
    </div>
  );
}