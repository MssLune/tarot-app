import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { calendarMonth, festivalsOf, type CalendarDay, type Festival } from '@arcana/tarot-core';
import MoonDisc from '../cards/MoonDisc';
import {
  eclipsesDelAnio,
  retrogradosDelAnio,
  type LunarEclipse,
  type RetrogradePeriod,
} from '../../services/api';
import type { Ritual } from '../../types';
import {
  FECHA_CORTA,
  FECHA_LARGA_ANIO,
  Icono,
  horaAprox,
  LEYENDA,
  Marca,
  categoriaDe,
  desdeIsoDia,
  diasEntre,
  isoDia,
  primeraMayuscula,
  relativo,
  useAhora,
} from './lunaUi';

/* ==========================================================================
   Calendario lunar: el mes, con la Luna de cada día y su detalle.

   LA LUNA DE CADA CELDA es la de ese día a mediodía local: iluminación real
   y nombre según la convención de los almanaques (el nombre de una fase
   principal sólo el día local en que cae su instante). Lo calcula
   `calendarMonth` en el dispositivo, sin red.

   LOS EVENTOS REMOTOS (retrógrados del JPL, eclipses del IMCCE) llegan del
   backend. Si no llegan, el calendario lo dice y sigue: las fases y las
   festividades no dependen de eso.

   CADA MARCA TIENE UNA FORMA (aro, rombo, estrella, punto), no sólo un
   color, y la leyenda las nombra.

   TECLADO: las flechas mueven el día elegido (±1 día, ±1 semana), Inicio y
   Fin van al principio y al final de la semana, Re Pág y Av Pág cambian de
   mes. Sólo el día elegido está en el orden de tabulación (tabindex móvil),
   para que Tab no recorra 31 botones.

   Todas las props son opcionales: suelto, el calendario maneja su propia
   selección (así lo renderizan los tests).
   ========================================================================== */

const DIAS_SEMANA = [
  ['D', 'Domingo'],
  ['L', 'Lunes'],
  ['M', 'Martes'],
  ['X', 'Miércoles'],
  ['J', 'Jueves'],
  ['V', 'Viernes'],
  ['S', 'Sábado'],
] as const;
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
/** Mismos límites que las rutas de la Luna del backend. */
const ANIO_MIN = 1900;
const ANIO_MAX = 2100;

const NOMBRE_ECLIPSE: Record<LunarEclipse['kind'], string> = {
  total: 'Eclipse total de Luna',
  parcial: 'Eclipse parcial de Luna',
  penumbral: 'Eclipse penumbral de Luna',
};

type Remoto<T> = { estado: 'cargando' } | { estado: 'listo'; datos: T } | { estado: 'error' };

export interface MoonCalendarProps {
  /** Día elegido, `AAAA-MM-DD` local. Sin esto el calendario maneja el suyo. */
  seleccion?: string;
  onSeleccionar?: (iso: string) => void;
  /** Rituales del usuario, para marcarlos y listarlos en el detalle. */
  rituales?: Ritual[];
  onCrearRitual?: (iso: string, festivalId: string | null) => void;
  onAbrirRitual?: (id: string) => void;
  /** Cambiarlo pone el foco en el día elegido (para "Ver calendario"). */
  enfocar?: number;
}

/** Rituales atados a un día: por fecha, o por festividad si no tienen fecha. */
export function ritualesDelDia(rituales: Ritual[], iso: string, festividadId?: string): Ritual[] {
  return rituales.filter(
    (r) => r.date === iso || (!r.date && !!r.festivalId && r.festivalId === festividadId),
  );
}

export default function MoonCalendar({
  seleccion,
  onSeleccionar,
  rituales = [],
  onCrearRitual,
  onAbrirRitual,
  enfocar,
}: MoonCalendarProps) {
  const reducir = useReducedMotion();
  const ahora = useAhora();
  const hoyIso = isoDia(ahora);

  const [selInterna, setSelInterna] = useState(hoyIso);
  const sel = seleccion ?? selInterna;
  const fechaSel = desdeIsoDia(sel) ?? ahora;

  const [cursor, setCursor] = useState(() => ({ anio: fechaSel.getFullYear(), mes: fechaSel.getMonth() }));

  const elegir = useCallback(
    (iso: string) => {
      if (seleccion === undefined) setSelInterna(iso);
      onSeleccionar?.(iso);
    },
    [seleccion, onSeleccionar],
  );

  /* Si la selección cambia desde afuera (o por teclado) a otro mes, el
     calendario va a ese mes: nunca queda elegido un día que no se ve. */
  useEffect(() => {
    const f = desdeIsoDia(sel);
    if (!f) return;
    setCursor((c) =>
      c.anio === f.getFullYear() && c.mes === f.getMonth() ? c : { anio: f.getFullYear(), mes: f.getMonth() },
    );
  }, [sel]);

  const festividades = useMemo(() => festivalsOf(cursor.anio), [cursor.anio]);
  const celdas = useMemo(() => calendarMonth(cursor.anio, cursor.mes, festividades), [cursor, festividades]);

  /* ---------------- Eventos remotos ---------------- */
  const [retro, setRetro] = useState<Remoto<RetrogradePeriod[]>>({ estado: 'cargando' });
  const [eclipses, setEclipses] = useState<Remoto<LunarEclipse[]>>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  /* Lo que ya llegó bien se guarda por año: ir y volver de enero a
     diciembre no vuelve a pedir lo mismo. Los errores no se guardan. */
  const cache = useRef(new Map<string, RetrogradePeriod[] | LunarEclipse[]>());

  useEffect(() => {
    let vivo = true;
    const claveR = `r${cursor.anio}`;
    const claveE = `e${cursor.anio}`;
    const enCacheR = cache.current.get(claveR) as RetrogradePeriod[] | undefined;
    const enCacheE = cache.current.get(claveE) as LunarEclipse[] | undefined;
    setRetro(enCacheR ? { estado: 'listo', datos: enCacheR } : { estado: 'cargando' });
    setEclipses(enCacheE ? { estado: 'listo', datos: enCacheE } : { estado: 'cargando' });
    if (!enCacheR) {
      void retrogradosDelAnio(cursor.anio).then((r) => {
        if (r) cache.current.set(claveR, r);
        if (vivo) setRetro(r ? { estado: 'listo', datos: r } : { estado: 'error' });
      });
    }
    if (!enCacheE) {
      void eclipsesDelAnio(cursor.anio).then((e) => {
        if (e) cache.current.set(claveE, e);
        if (vivo) setEclipses(e ? { estado: 'listo', datos: e } : { estado: 'error' });
      });
    }
    return () => {
      vivo = false;
    };
  }, [cursor.anio, intento]);

  /* Retrógrados por día LOCAL: el instante de inicio se pasa a la zona del
     usuario antes de decidir qué día es. Antes se cortaba el ISO en UTC, y
     en América un retrógrado que empezaba de noche caía al día siguiente. */
  const retrosPorDia = useMemo(() => {
    const empiezan = new Map<string, RetrogradePeriod[]>();
    const enCurso = new Map<string, RetrogradePeriod[]>();
    const lista = retro.estado === 'listo' ? retro.datos : [];
    for (const c of celdas) {
      const dia = isoDia(c.date);
      const inicioDia = new Date(c.date.getFullYear(), c.date.getMonth(), c.date.getDate()).getTime();
      const finDia = new Date(c.date.getFullYear(), c.date.getMonth(), c.date.getDate() + 1).getTime();
      for (const p of lista) {
        const desde = new Date(p.desde).getTime();
        const hasta = new Date(p.hasta).getTime();
        if (desde >= inicioDia && desde < finDia) empiezan.set(dia, [...(empiezan.get(dia) ?? []), p]);
        else if (desde < inicioDia && hasta >= inicioDia) enCurso.set(dia, [...(enCurso.get(dia) ?? []), p]);
      }
    }
    return { empiezan, enCurso };
  }, [celdas, retro]);

  /* Eclipses por día local del máximo (si viene) o de la fecha publicada. */
  const eclipsesPorDia = useMemo(() => {
    const m = new Map<string, LunarEclipse>();
    if (eclipses.estado !== 'listo') return m;
    for (const e of eclipses.datos) {
      const instante = e.mayor ? new Date(e.mayor) : desdeIsoDia(e.fecha);
      if (instante) m.set(isoDia(instante), e);
    }
    return m;
  }, [eclipses]);

  const ritualesPorDia = useMemo(() => {
    const m = new Map<string, Ritual[]>();
    for (const c of celdas) {
      if (!c.enMes) continue;
      const lista = ritualesDelDia(rituales, isoDia(c.date), c.festividad?.id);
      if (lista.length) m.set(isoDia(c.date), lista);
    }
    return m;
  }, [celdas, rituales]);

  /* ---------------- Navegación ---------------- */
  const puedeAnterior = cursor.anio > ANIO_MIN || cursor.mes > 0;
  const puedeSiguiente = cursor.anio < ANIO_MAX || cursor.mes < 11;

  const irAMes = (anio: number, mes: number) => {
    const d = new Date(anio, mes, 1);
    if (d.getFullYear() < ANIO_MIN || d.getFullYear() > ANIO_MAX) return;
    setCursor({ anio: d.getFullYear(), mes: d.getMonth() });
    /* En el mes de hoy se elige hoy; en otro, el día 1. Así el detalle
       siempre corresponde a un día visible. */
    const esMesDeHoy = d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
    elegir(esMesDeHoy ? hoyIso : isoDia(d));
  };
  const mover = (delta: number) => irAMes(cursor.anio, cursor.mes + delta);
  const esMesDeHoy = cursor.anio === ahora.getFullYear() && cursor.mes === ahora.getMonth();

  /* ---------------- Teclado y foco ---------------- */
  const grilla = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef(false);

  const enfocarSeleccion = useCallback(() => {
    grilla.current?.querySelector<HTMLButtonElement>(`[data-dia="${sel}"]`)?.focus({ preventScroll: true });
  }, [sel]);

  /* El foco se mueve cuando el botón del día ya está en la grilla: al cruzar
     de mes, primero cambia la selección y en el render siguiente el mes. */
  useEffect(() => {
    if (!focoPendiente.current) return;
    const boton = grilla.current?.querySelector<HTMLButtonElement>(`[data-dia="${sel}"]`);
    if (boton) {
      focoPendiente.current = false;
      boton.focus();
    }
  }, [celdas, sel]);

  useEffect(() => {
    if (enfocar) enfocarSeleccion();
    // Sólo cuando cambia el pedido de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar]);

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const f = desdeIsoDia(sel);
    if (!f) return;
    let destino: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1, 12);
        break;
      case 'ArrowRight':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1, 12);
        break;
      case 'ArrowUp':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 7, 12);
        break;
      case 'ArrowDown':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 7, 12);
        break;
      case 'Home':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() - f.getDay(), 12);
        break;
      case 'End':
        destino = new Date(f.getFullYear(), f.getMonth(), f.getDate() + (6 - f.getDay()), 12);
        break;
      case 'PageUp':
        destino = new Date(f.getFullYear(), f.getMonth() - 1, Math.min(f.getDate(), 28), 12);
        break;
      case 'PageDown':
        destino = new Date(f.getFullYear(), f.getMonth() + 1, Math.min(f.getDate(), 28), 12);
        break;
      default:
        return;
    }
    e.preventDefault();
    if (destino.getFullYear() < ANIO_MIN || destino.getFullYear() > ANIO_MAX) return;
    focoPendiente.current = true;
    elegir(isoDia(destino));
  };

  const celdaSel = celdas.find((c) => c.enMes && isoDia(c.date) === sel);
  /* El tabindex 0 va al día elegido si está en el mes; si no, al día 1. */
  const diaConTab = celdaSel ? sel : isoDia(new Date(cursor.anio, cursor.mes, 1));

  const errorRemoto = retro.estado === 'error' || eclipses.estado === 'error';
  const cargandoRemoto = retro.estado === 'cargando' || eclipses.estado === 'cargando';

  return (
    <section aria-labelledby="calendario-titulo" className="superficie p-3 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),19rem]">
        <div className="min-w-0">
          {/* ---------------- Cabecera ---------------- */}
          <div className="mb-3 flex items-center gap-2">
            <h2 id="calendario-titulo" className="sr-only">
              Calendario lunar
            </h2>
            <button
              type="button"
              onClick={() => mover(-1)}
              disabled={!puedeAnterior}
              aria-label="Mes anterior"
              className="foco flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-noche-600 text-lavanda-200 transition-colors hover:border-luna-400/50 hover:text-luna-300 disabled:opacity-30"
            >
              <Icono nombre="izquierda" />
            </button>

            <p
              aria-live="polite"
              className="min-w-0 flex-1 text-center font-display text-lg text-lavanda-100 sm:text-xl"
            >
              {MESES[cursor.mes]} <span className="text-lavanda-300">{cursor.anio}</span>
            </p>

            <button
              type="button"
              onClick={() => mover(1)}
              disabled={!puedeSiguiente}
              aria-label="Mes siguiente"
              className="foco flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-noche-600 text-lavanda-200 transition-colors hover:border-luna-400/50 hover:text-luna-300 disabled:opacity-30"
            >
              <Icono nombre="derecha" />
            </button>
            <button
              type="button"
              onClick={() => {
                focoPendiente.current = true;
                if (esMesDeHoy) elegir(hoyIso);
                else irAMes(ahora.getFullYear(), ahora.getMonth());
              }}
              disabled={esMesDeHoy && sel === hoyIso}
              className="foco h-10 shrink-0 rounded-full border border-noche-600 px-3.5 text-xs uppercase tracking-[0.14em] text-lavanda-200 transition-colors hover:border-luna-400/50 hover:text-luna-300 disabled:opacity-35"
            >
              Hoy
            </button>
          </div>

          {/* ---------------- Días de la semana ---------------- */}
          <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden="true">
            {DIAS_SEMANA.map(([corto, largo]) => (
              <div key={largo} title={largo} className="text-center text-[0.7rem] uppercase tracking-[0.12em] text-lavanda-400">
                {corto}
              </div>
            ))}
          </div>

          {/* ---------------- La grilla ---------------- */}
          <div
            ref={grilla}
            role="group"
            aria-label={`Días de ${MESES[cursor.mes]} de ${cursor.anio}. Usá las flechas para moverte.`}
            onKeyDown={alTeclear}
            className="grid grid-cols-7 gap-1 sm:gap-1.5"
          >
            {celdas.map((c) => {
              const iso = isoDia(c.date);
              return (
                <Celda
                  key={iso}
                  dia={c}
                  iso={iso}
                  esHoy={iso === hoyIso}
                  elegida={iso === sel}
                  conTab={iso === diaConTab}
                  astro={(retrosPorDia.empiezan.get(iso)?.length ?? 0) > 0 || eclipsesPorDia.has(iso)}
                  conRitual={ritualesPorDia.has(iso)}
                  onElegir={() => elegir(iso)}
                />
              );
            })}
          </div>

          {/* ---------------- Leyenda ---------------- */}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-lavanda-300">
            {LEYENDA.map((l) => (
              <li key={l.tipo} className="flex items-center gap-1.5">
                <Marca tipo={l.tipo} />
                {l.texto}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-lavanda-400">
            La Luna de cada día es la del mediodía, en tu zona horaria.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-lavanda-400" role="status">
            {cargandoRemoto
              ? 'Cargando retrógrados y eclipses…'
              : errorRemoto
                ? 'No se pudieron cargar los retrógrados o los eclipses. Las fases y las festividades se calculan en tu dispositivo y siguen siendo correctas.'
                : ''}
            {errorRemoto && !cargandoRemoto && (
              <button
                type="button"
                onClick={() => setIntento((n) => n + 1)}
                className="foco ml-1.5 rounded text-luna-300 underline decoration-luna-400/40 underline-offset-4 hover:text-luna-300"
              >
                Reintentar
              </button>
            )}
          </p>
        </div>

        {/* ---------------- Detalle del día ---------------- */}
        <div aria-live="polite" className="min-w-0">
          {/* Sin animación de salida a propósito: el detalle tiene que cambiar
              en el acto, sobre todo al recorrer días con las flechas. */}
          {celdaSel && (
              <motion.div
                key={sel}
                initial={reducir ? false : { opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
              >
                <PanelDia
                  dia={celdaSel}
                  hoy={ahora}
                  empiezan={retrosPorDia.empiezan.get(sel) ?? []}
                  enCurso={retrosPorDia.enCurso.get(sel) ?? []}
                  eclipse={eclipsesPorDia.get(sel)}
                  festividad={festividades.find((f) => f.id === celdaSel.festividad?.id)}
                  rituales={ritualesPorDia.get(sel) ?? []}
                  onCrear={onCrearRitual ? () => onCrearRitual(sel, celdaSel.festividad?.id ?? null) : undefined}
                  onAbrirRitual={onAbrirRitual}
                />
              </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   Una celda
   -------------------------------------------------------------------------- */

function Celda({
  dia,
  iso,
  esHoy,
  elegida,
  conTab,
  astro,
  conRitual,
  onElegir,
}: {
  dia: CalendarDay;
  iso: string;
  esHoy: boolean;
  elegida: boolean;
  conTab: boolean;
  astro: boolean;
  conRitual: boolean;
  onElegir: () => void;
}) {
  const luna = useMemo(() => ({ angle: dia.angle, illumination: dia.illumination }), [dia.angle, dia.illumination]);

  /* Los días del mes vecino: sólo el número, sin disco ni interacción. */
  if (!dia.enMes) {
    return (
      <div aria-hidden="true" className="flex min-h-[3.4rem] items-start px-1 pt-1 sm:min-h-[4.6rem]">
        <span className="text-[0.7rem] text-lavanda-400/40">{dia.date.getDate()}</span>
      </div>
    );
  }

  /* La Luna Nueva es un disco negro sobre fondo negro: sin el aro, la celda
     parecería vacía. */
  const casiOscura = dia.illumination < 0.04;

  const partes = [
    `Día ${dia.date.getDate()}`,
    esHoy ? 'hoy' : '',
    dia.name,
    dia.fase ? `${dia.fase.name} a las ${horaAprox(dia.fase.instante)}` : '',
    dia.festividad?.name ?? '',
    astro ? 'evento astronómico' : '',
    conRitual ? 'con rituales tuyos' : '',
  ].filter(Boolean);

  return (
    <button
      type="button"
      data-dia={iso}
      tabIndex={conTab ? 0 : -1}
      onClick={onElegir}
      aria-pressed={elegida}
      aria-current={esHoy ? 'date' : undefined}
      aria-label={partes.join(', ')}
      className={`foco group relative flex min-h-[3.4rem] flex-col items-center rounded-xl border px-0.5 pb-1 pt-1 transition-colors sm:min-h-[4.6rem] sm:pt-1.5 ${
        elegida
          ? 'border-luna-300/80 bg-luna-400/[0.14]'
          : dia.fase
            ? 'border-luna-400/25 bg-noche-900/70 hover:border-luna-400/50'
            : 'border-noche-600/40 bg-noche-900/50 hover:border-lavanda-300/30 hover:bg-noche-900/80'
      }`}
    >
      <span
        className={`self-start pl-1 text-[0.7rem] leading-none sm:text-xs ${
          esHoy
            ? 'rounded-full bg-luna-400 px-1.5 py-0.5 font-semibold text-noche-950'
            : elegida
              ? 'text-luna-300'
              : 'text-lavanda-200'
        }`}
      >
        {dia.date.getDate()}
      </span>

      <span className="mt-0.5 flex flex-1 items-center justify-center">
        {casiOscura ? (
          <span
            data-disco-lunar="dia"
            aria-hidden="true"
            className="block h-[22px] w-[22px] rounded-full border border-dashed border-lavanda-300/45 sm:h-7 sm:w-7"
          />
        ) : (
          <span className="block h-[22px] w-[22px] sm:h-7 sm:w-7 [&>span]:!h-full [&>span]:!w-full">
            <MoonDisc phase={luna} size={28} variant="icon" animate={false} marca="dia" decorativo />
          </span>
        )}
      </span>

      <span className="flex h-2.5 items-center justify-center gap-[3px]" aria-hidden="true">
        {dia.fase && <Marca tipo="fase" />}
        {astro && <Marca tipo="astro" />}
        {dia.festividad && <Marca tipo="fiesta" />}
        {conRitual && <Marca tipo="ritual" />}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------------
   El detalle del día
   -------------------------------------------------------------------------- */

function PanelDia({
  dia,
  hoy,
  empiezan,
  enCurso,
  eclipse,
  festividad,
  rituales,
  onCrear,
  onAbrirRitual,
}: {
  dia: CalendarDay;
  hoy: Date;
  empiezan: RetrogradePeriod[];
  enCurso: RetrogradePeriod[];
  eclipse?: LunarEclipse;
  festividad?: Festival;
  rituales: Ritual[];
  onCrear?: () => void;
  onAbrirRitual?: (id: string) => void;
}) {
  const fecha = dia.date;
  const dias = diasEntre(hoy, fecha);
  const fin = (p: RetrogradePeriod) => FECHA_CORTA.format(new Date(p.hasta)).replace('.', '');
  const inicio = (p: RetrogradePeriod) => FECHA_CORTA.format(new Date(p.desde)).replace('.', '');
  const hayEventos = !!festividad || !!eclipse || empiezan.length > 0 || enCurso.length > 0;

  return (
    <article className="superficie-2 h-full p-4" aria-label={`Detalle del ${FECHA_LARGA_ANIO.format(fecha)}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-lavanda-400">{primeraMayuscula(relativo(dias))}</p>
      <h3 className="mt-0.5 font-display text-lg leading-snug text-lavanda-100">
        {primeraMayuscula(FECHA_LARGA_ANIO.format(fecha))}
      </h3>

      <div className="mt-3 flex items-center gap-3">
        <MoonDisc
          phase={{ angle: dia.angle, illumination: dia.illumination, name: dia.name }}
          size={60}
          variant="icon"
          animate={false}
          marca="detalle"
        />
        <div className="min-w-0">
          <p className="font-display text-base text-luna-300">{dia.name}</p>
          <p className="text-sm text-lavanda-300">{Math.round(dia.illumination * 100)} % iluminada al mediodía</p>
        </div>
      </div>

      {dia.fase && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-luna-400/25 bg-luna-400/[0.06] px-3 py-2 text-sm text-lavanda-100">
          <Marca tipo="fase" />
          <span>
            {dia.fase.name} exacta a las <strong className="font-semibold text-luna-300">{horaAprox(dia.fase.instante)}</strong>{' '}
            <span className="text-lavanda-400">(hora local, aprox.)</span>
          </span>
        </p>
      )}

      {hayEventos && (
        <ul className="mt-3 space-y-2 text-sm">
          {festividad && (
            <li className="flex items-start gap-2 text-lavanda-100">
              <Marca tipo="fiesta" className="mt-1.5" />
              <span>
                {festividad.name} <span className="text-xs text-lavanda-400">· {categoriaDe(festividad)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-lavanda-300">{festividad.resumen}</span>
              </span>
            </li>
          )}
          {eclipse && (
            <li className="flex items-start gap-2 text-rosa-300">
              <Marca tipo="astro" className="mt-1.5" />
              <span>
                {NOMBRE_ECLIPSE[eclipse.kind]}
                {eclipse.mayor && (
                  <span className="text-lavanda-300"> · máximo a las {horaAprox(new Date(eclipse.mayor))}</span>
                )}
              </span>
            </li>
          )}
          {empiezan.map((p) => (
            <li key={`e-${p.planeta}`} className="flex items-start gap-2 text-lavanda-100">
              <Marca tipo="astro" className="mt-1.5" />
              <span>
                Empieza {p.nombre} retrógrado <span className="text-lavanda-400">· hasta el {fin(p)}</span>
              </span>
            </li>
          ))}
          {enCurso.map((p) => (
            <li key={`c-${p.planeta}`} className="flex items-start gap-2 text-lavanda-300">
              <Marca tipo="astro" className="mt-1.5 opacity-60" />
              <span>
                {p.nombre} retrógrado desde el {inicio(p)}, hasta el {fin(p)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- Rituales del día ---------------- */}
      <div className="mt-4 border-t border-noche-600/50 pt-3">
        <p className="text-xs uppercase tracking-[0.16em] text-lavanda-400">Tus rituales de este día</p>
        {rituales.length === 0 ? (
          <p className="mt-1.5 text-sm text-lavanda-300">Nada anotado para este día.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {rituales.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onAbrirRitual?.(r.id)}
                  className="foco flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-lavanda-100 hover:bg-noche-700/60"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      r.completedAt ? 'border-luna-300 bg-luna-400 text-noche-950' : 'border-lavanda-300/60'
                    }`}
                  >
                    {r.completedAt && <Icono nombre="check" className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="sr-only">{r.completedAt ? ', hecho' : ', pendiente'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {onCrear && (
          <button
            type="button"
            onClick={onCrear}
            className="foco mt-3 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-luna-400/40 px-4 text-xs uppercase tracking-[0.14em] text-luna-300 transition-colors hover:bg-luna-400/10"
          >
            <Icono nombre="mas" className="h-3.5 w-3.5" />
            Crear ritual para este día
          </button>
        )}
      </div>
    </article>
  );
}
