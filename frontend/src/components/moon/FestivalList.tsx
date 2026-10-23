import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  festivalsOf,
  nearestFestival,
  notaSobreFechasDeLasHogueras,
  type Festival,
} from '@arcana/tarot-core';
import { useReadingStore } from '../../store/useReadingStore';
import { userService } from '../../services/userService';
import type { FestivalNote, Ritual } from '../../types';
import {
  FECHA_LARGA_ANIO,
  Icono,
  categoriaDe,
  diasEntre,
  isoDia,
  primeraMayuscula,
  relativo,
  useAhora,
} from './lunaUi';

/* ==========================================================================
   Festividades: la rueda del año, con su explicación desplegable.

   La lista se CALCULA (ver tarot-core/festivals): las fechas fijas son las
   tradicionales y las cuatro estaciones salen de la longitud del Sol. Los
   textos son los que ya tenía la app; esta pantalla no agrega historia.

   LAS FECHAS NO SON UNIVERSALES: son las de la tradición del hemisferio
   norte, y la pantalla lo dice. Mucha gente del hemisferio sur corre la
   rueda seis meses, y cada tradición tiene sus variantes.

   NOTAS PERSONALES: una por festividad y por año, guardadas en la cuenta. Sin
   sesión no se ofrecen (no se guardan en el navegador: las vería quien use
   el equipo después).
   ========================================================================== */

const MES_CORTO = new Intl.DateTimeFormat('es-PE', { month: 'short' });

interface Props {
  rituales?: Ritual[];
  /** Crear un ritual atado a la festividad, en su fecha de ese año. */
  onCrearRitual?: (festivalId: string, iso: string) => void;
  onAbrirRitual?: (id: string) => void;
}

type EstadoNotas =
  | { estado: 'sin-cuenta' }
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'listo'; notas: Record<string, FestivalNote> };

export default function FestivalList({ rituales = [], onCrearRitual, onAbrirRitual }: Props) {
  const reducir = useReducedMotion();
  const ahora = useAhora();
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  const [anio, setAnio] = useState(() => ahora.getFullYear());
  const [abierto, setAbierto] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [notas, setNotas] = useState<EstadoNotas>({ estado: 'sin-cuenta' });

  const lista = useMemo(() => festivalsOf(anio), [anio]);
  const cercana = useMemo(
    () => (anio === ahora.getFullYear() ? nearestFestival(ahora, anio) : null),
    [anio, ahora],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setNotas({ estado: 'sin-cuenta' });
      return;
    }
    let vivo = true;
    setNotas({ estado: 'cargando' });
    userService
      .listFestivalNotes(anio)
      .then((lista) => {
        if (vivo) setNotas({ estado: 'listo', notas: Object.fromEntries(lista.map((n) => [n.festivalId, n])) });
      })
      .catch(() => {
        if (vivo) setNotas({ estado: 'error' });
      });
    return () => {
      vivo = false;
    };
  }, [isAuthenticated, anio, intento]);

  const alGuardarNota = (festivalId: string, nota: FestivalNote | null) => {
    setNotas((n) => {
      if (n.estado !== 'listo') return n;
      const copia = { ...n.notas };
      if (nota) copia[festivalId] = nota;
      else delete copia[festivalId];
      return { estado: 'listo', notas: copia };
    });
  };

  return (
    <section aria-labelledby="festividades-titulo">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline">La rueda del año</p>
          <h2 id="festividades-titulo" className="mt-1 font-display text-xl text-gold-gradient">
            Festividades
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gold-100/55">
            Las cuatro Hogueras, las cuatro estaciones y las dos vísperas que la tradición guarda aparte.
          </p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Año de las festividades">
          <button
            type="button"
            onClick={() => setAnio((a) => Math.max(1900, a - 1))}
            aria-label="Año anterior"
            className="foco flex h-10 w-10 items-center justify-center rounded-full border border-noche-600 text-gold-100/75 hover:border-luna-400/50 hover:text-gold-200"
          >
            <Icono nombre="izquierda" />
          </button>
          <span className="w-14 text-center font-display text-base text-gold-100" aria-live="polite">
            {anio}
          </span>
          <button
            type="button"
            onClick={() => setAnio((a) => Math.min(2100, a + 1))}
            aria-label="Año siguiente"
            className="foco flex h-10 w-10 items-center justify-center rounded-full border border-noche-600 text-gold-100/75 hover:border-luna-400/50 hover:text-gold-200"
          >
            <Icono nombre="derecha" />
          </button>
        </div>
      </header>

      {notas.estado === 'error' && (
        <p role="alert" className="mb-3 rounded-xl border border-rosa-400/30 bg-rosa-400/10 px-3.5 py-2 text-sm text-gold-100">
          No se pudieron cargar tus notas de festividades.{' '}
          <button type="button" onClick={() => setIntento((n) => n + 1)} className="foco rounded text-gold-200 underline underline-offset-4">
            Reintentar
          </button>
        </p>
      )}

      <ul className="grid gap-2.5 md:grid-cols-2">
        {lista.map((f) => (
          <li key={f.id} className={abierto === f.id ? 'md:col-span-2' : ''}>
            <Tarjeta
              festival={f}
              anio={anio}
              hoy={ahora}
              abierta={abierto === f.id}
              proxima={cercana?.festival.id === f.id}
              reducir={!!reducir}
              rituales={rituales.filter((r) => r.festivalId === f.id && (!r.date || r.date.startsWith(String(anio))))}
              notas={notas}
              onAlternar={() => setAbierto(abierto === f.id ? null : f.id)}
              onCrearRitual={onCrearRitual ? () => onCrearRitual(f.id, isoDia(f.date)) : undefined}
              onAbrirRitual={onAbrirRitual}
              onNotaGuardada={(n) => alGuardarNota(f.id, n)}
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1.5 text-xs leading-relaxed text-gold-100/40">
        <p>
          Fechas de la tradición del hemisferio norte. En el hemisferio sur mucha gente celebra la rueda corrida seis
          meses (Samhain cerca del 1 de mayo, Beltane cerca del 1 de noviembre), y las costumbres cambian según la
          tradición y el lugar.
        </p>
        <p>{notaSobreFechasDeLasHogueras}</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Tarjeta({
  festival: f,
  anio,
  hoy,
  abierta,
  proxima,
  reducir,
  rituales,
  notas,
  onAlternar,
  onCrearRitual,
  onAbrirRitual,
  onNotaGuardada,
}: {
  festival: Festival;
  anio: number;
  hoy: Date;
  abierta: boolean;
  proxima: boolean;
  reducir: boolean;
  rituales: Ritual[];
  notas: EstadoNotas;
  onAlternar: () => void;
  onCrearRitual?: () => void;
  onAbrirRitual?: (id: string) => void;
  onNotaGuardada: (n: FestivalNote | null) => void;
}) {
  const dias = diasEntre(hoy, f.date);
  const esHoy = dias === 0;
  const idPanel = `festividad-${f.id}`;

  return (
    <article
      className={`h-full rounded-2xl border transition-colors ${
        esHoy
          ? 'border-luna-400/50 bg-luna-400/[0.07]'
          : abierta
            ? 'border-lavanda-300/25 bg-noche-800/90'
            : 'border-noche-600/55 bg-noche-800/60 hover:border-noche-600'
      }`}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={idPanel}
        className="foco flex w-full items-start gap-3.5 rounded-2xl px-4 py-3.5 text-left"
      >
        <span className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-noche-600/60 bg-noche-900/80 py-1.5">
          <span className="font-display text-lg leading-none text-gold-200">{f.date.getDate()}</span>
          <span className="mt-0.5 font-display text-[0.6rem] uppercase tracking-[0.12em] text-gold-100/55">
            {MES_CORTO.format(f.date).replace('.', '')}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-sm text-gold-100">{f.name}</span>
            <span className="rounded-full border border-gold-400/25 px-2 py-px text-[0.6rem] uppercase tracking-[0.14em] text-gold-200/75">
              {categoriaDe(f)}
            </span>
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-gold-100/55">{f.resumen}</span>
          <span className="mt-1.5 block text-xs text-gold-100/40">
            {esHoy ? (
              <span className="uppercase tracking-[0.16em] text-gold-200">Es hoy</span>
            ) : (
              <>
                {primeraMayuscula(relativo(dias))}
                {proxima && dias > 0 && <span className="text-gold-200"> · la próxima</span>}
              </>
            )}
            {rituales.length > 0 && ` · ${rituales.length} ${rituales.length === 1 ? 'ritual tuyo' : 'rituales tuyos'}`}
          </span>
        </span>

        <span
          aria-hidden="true"
          className={`mt-1 shrink-0 text-gold-100/40 transition-transform ${abierta ? 'rotate-180' : ''}`}
        >
          <Icono nombre="abajo" />
        </span>
        <span className="sr-only">{abierta ? 'Ocultar detalle' : 'Ver detalle'}</span>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            key="detalle"
            id={idPanel}
            initial={reducir ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reducir ? 0 : 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4 sm:pl-[4.6rem]">
              <p className="max-w-prose text-sm leading-relaxed text-gold-100/75">{f.detalle}</p>

              <dl className="grid gap-x-6 gap-y-1.5 text-xs text-gold-100/55 sm:grid-cols-2">
                <div>
                  <dt className="inline text-gold-100/40">Fecha {anio}: </dt>
                  <dd className="inline">{primeraMayuscula(FECHA_LARGA_ANIO.format(f.date))}</dd>
                </div>
                <div>
                  <dt className="inline text-gold-100/40">Cómo se fija: </dt>
                  <dd className="inline">
                    {f.fixed ? 'fecha tradicional del calendario' : 'calculada por la posición del Sol para este año'}
                  </dd>
                </div>
                {f.altNames && f.altNames.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="inline text-gold-100/40">También: </dt>
                    <dd className="inline">{f.altNames.join(', ')}</dd>
                  </div>
                )}
              </dl>

              {/* ---------------- Rituales atados ---------------- */}
              {rituales.length > 0 && (
                <div>
                  <p className="overline">Tus rituales para {f.name}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {rituales.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onAbrirRitual?.(r.id)}
                          className="foco inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border border-noche-600 px-3 text-sm text-gold-100 hover:border-lavanda-300/40"
                        >
                          {r.completedAt && <Icono nombre="check" className="h-3.5 w-3.5 text-gold-200" />}
                          {r.title}
                          <span className="sr-only">{r.completedAt ? ', hecho' : ', pendiente'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <NotaPersonal festival={f} anio={anio} notas={notas} onGuardada={onNotaGuardada} />

              {onCrearRitual && (
                <button
                  type="button"
                  onClick={onCrearRitual}
                  className="foco inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-luna-400/40 px-4 font-display text-[0.68rem] uppercase tracking-[0.18em] text-gold-200 transition-colors hover:bg-luna-400/10"
                >
                  <Icono nombre="mas" className="h-3.5 w-3.5" />
                  Añadir ritual para esta festividad
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function NotaPersonal({
  festival,
  anio,
  notas,
  onGuardada,
}: {
  festival: Festival;
  anio: number;
  notas: EstadoNotas;
  onGuardada: (n: FestivalNote | null) => void;
}) {
  const pedirCuenta = useReadingStore((s) => s.pedirCuenta);
  const guardada = notas.estado === 'listo' ? notas.notas[festival.id]?.body ?? '' : '';
  const [texto, setTexto] = useState(guardada);
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado' | 'error'>('quieto');

  /* Cuando llegan las notas (o cambia el año), el campo muestra la guardada.
     El estado ("Nota guardada.") sólo se limpia al cambiar de año: si se
     limpiara al cambiar la guardada, el aviso de éxito se borraría en el
     mismo instante en que aparece. */
  useEffect(() => {
    setTexto(guardada);
  }, [guardada]);
  useEffect(() => {
    setEstado('quieto');
  }, [anio]);

  const id = `nota-${festival.id}`;

  if (notas.estado === 'sin-cuenta') {
    return (
      <p className="text-sm text-gold-100/55">
        <button
          type="button"
          onClick={() => pedirCuenta('Inicia sesión para guardar tus notas de cada festividad.')}
          className="foco rounded text-gold-200 underline decoration-luna-400/40 underline-offset-4"
        >
          Inicia sesión
        </button>{' '}
        para guardar una nota personal de {festival.name} {anio}.
      </p>
    );
  }
  if (notas.estado === 'cargando') {
    return <p className="text-sm text-gold-100/40">Cargando tu nota…</p>;
  }
  if (notas.estado === 'error') return null;

  const cambio = texto !== guardada;

  const guardar = async () => {
    setEstado('guardando');
    try {
      const nota = await userService.saveFestivalNote(festival.id, anio, texto);
      onGuardada(nota);
      setEstado('guardado');
    } catch {
      setEstado('error');
    }
  };

  return (
    <div>
      <label htmlFor={id} className="overline">
        Tu nota de {festival.name} {anio}
      </label>
      <textarea
        id={id}
        rows={3}
        value={texto}
        maxLength={4000}
        onChange={(e) => {
          setTexto(e.target.value);
          setEstado('quieto');
        }}
        placeholder="Qué quieres recordar de esta fecha: intenciones, lo que hiciste, lo que salió."
        className="mt-1.5 !border-noche-600 !bg-noche-900/80 !py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!cambio || estado === 'guardando'}
          className="foco inline-flex min-h-[2.25rem] items-center rounded-full bg-luna-400 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-noche-950 transition-opacity disabled:opacity-40"
        >
          {estado === 'guardando' ? 'Guardando…' : texto.trim() === '' && guardada ? 'Borrar nota' : 'Guardar nota'}
        </button>
        <span role="status" className="text-xs">
          {estado === 'guardado' && <span className="text-gold-200">Nota guardada.</span>}
          {estado === 'error' && <span className="text-rosa-300">No se pudo guardar. Prueba de nuevo.</span>}
        </span>
      </div>
    </div>
  );
}
