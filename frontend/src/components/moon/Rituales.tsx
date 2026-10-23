import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { festivalsOf, infoDeFase, type MoonPhaseId } from '@arcana/tarot-core';
import MoonDisc from '../cards/MoonDisc';
import Button from '../ui/Button';
import type { Ritual } from '../../types';
import {
  FECHA_CORTA,
  FECHA_LARGA_ANIO,
  Icono,
  NOMBRE_FASE,
  OPCIONES_FASE,
  desdeIsoDia,
  lookDeFase,
  useEscape,
} from './lunaUi';

/* ==========================================================================
   Rituales personales: la lista, la tarjeta, el editor y el borrado.

   La persistencia es la de siempre: el store guarda en la cuenta (PUT
   /user/rituals/:id, que crea o actualiza). Sin sesión esta sección no se
   muestra: la pantalla pone la invitación a crear cuenta en su lugar.

   SOBRE LAS FUENTES: la app NO verifica de dónde sale un ritual. El usuario
   escribe la fuente y, si quiere, la marca como verificada. Mientras no lo
   haga, se muestra con una advertencia. La app no inventa atribuciones.
   ========================================================================== */

export type Filtro = 'dia' | 'pendientes' | 'hechos' | 'todos';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'dia', texto: 'Para el día elegido' },
  { id: 'pendientes', texto: 'Pendientes' },
  { id: 'hechos', texto: 'Hechos' },
  { id: 'todos', texto: 'Todos' },
];

/** Nombre de la festividad por id, del año que corresponda. */
function nombreFestividad(id: string, anio: number): string {
  return festivalsOf(anio).find((f) => f.id === id)?.name ?? id;
}

/* ==========================================================================
   La sección
   ========================================================================== */

export function SeccionRituales({
  rituales,
  diaIso,
  faseDelDia,
  festividadDelDia,
  sincronizando,
  sinSubir,
  aviso,
  onReintentar,
  onNuevo,
  onEditar,
  onBorrar,
  onAlternarHecho,
  abierto,
  setAbierto,
}: {
  rituales: Ritual[];
  /** Día elegido en el calendario, `AAAA-MM-DD`. */
  diaIso: string;
  faseDelDia: { id: MoonPhaseId; name: string };
  festividadDelDia?: { id: string; name: string };
  sincronizando: boolean;
  sinSubir: number;
  /** Mensaje del servidor si rechazó un ritual (tope del plan). */
  aviso: string | null;
  onReintentar: () => void;
  onNuevo: (prefill?: Partial<Ritual>) => void;
  onEditar: (r: Ritual) => void;
  onBorrar: (r: Ritual) => void;
  onAlternarHecho: (id: string) => void;
  abierto: string | null;
  setAbierto: (id: string | null) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('dia');
  const fechaDia = desdeIsoDia(diaIso);
  const etiquetaDia = fechaDia ? FECHA_CORTA.format(fechaDia).replace('.', '') : diaIso;

  const lista = useMemo(() => {
    const porCreacion = (a: Ritual, b: Ritual) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    switch (filtro) {
      case 'dia':
        /* Lo atado a ese día (fecha o festividad) y lo que va con la fase
           del día sin fecha propia. */
        return rituales
          .filter(
            (r) =>
              r.date === diaIso ||
              (!r.date && !!r.festivalId && r.festivalId === festividadDelDia?.id) ||
              (!r.date && !r.festivalId && r.phase === faseDelDia.id),
          )
          .sort(porCreacion);
      case 'pendientes':
        return rituales
          .filter((r) => !r.completedAt)
          .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || porCreacion(a, b));
      case 'hechos':
        return rituales
          .filter((r) => !!r.completedAt)
          .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      case 'todos':
        return [...rituales].sort(porCreacion);
    }
  }, [rituales, filtro, diaIso, faseDelDia.id, festividadDelDia?.id]);

  const cuenta = (f: Filtro) =>
    f === 'pendientes'
      ? rituales.filter((r) => !r.completedAt).length
      : f === 'hechos'
        ? rituales.filter((r) => r.completedAt).length
        : f === 'todos'
          ? rituales.length
          : null;

  return (
    <section aria-labelledby="rituales-titulo">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-lavanda-400">Tu práctica</p>
          <h2 id="rituales-titulo" className="mt-1 font-display text-2xl text-luna-300">
            Rituales
          </h2>
        </div>
        <Button
          size="sm"
          onClick={() => onNuevo({ date: diaIso, phase: faseDelDia.id, festivalId: festividadDelDia?.id ?? null })}
          icon={<Icono nombre="mas" className="h-3.5 w-3.5" />}
        >
          Crear ritual
        </Button>
      </header>

      {/* ---------------- Estado de la sincronización ---------------- */}
      <div role="status" aria-live="polite" className="empty:hidden mb-3 space-y-2 text-sm">
        {sincronizando && <p className="text-lavanda-300">Guardando en tu cuenta…</p>}
        {!sincronizando && sinSubir > 0 && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl border border-rosa-400/30 bg-rosa-400/10 px-3.5 py-2 text-lavanda-100">
            <Icono nombre="aviso" className="h-4 w-4 text-rosa-300" />
            {sinSubir === 1 ? 'Un cambio no se pudo subir todavía.' : `${sinSubir} cambios no se pudieron subir todavía.`}
            <button type="button" onClick={onReintentar} className="foco rounded text-luna-300 underline underline-offset-4">
              Reintentar
            </button>
          </p>
        )}
        {aviso && (
          <p className="flex items-start gap-2 rounded-xl border border-rosa-400/30 bg-rosa-400/10 px-3.5 py-2 text-lavanda-100">
            <Icono nombre="aviso" className="mt-0.5 h-4 w-4 shrink-0 text-rosa-300" />
            <span>El último ritual no se guardó: {aviso}</span>
          </p>
        )}
      </div>

      {/* ---------------- Filtros ---------------- */}
      <div role="group" aria-label="Qué rituales ver" className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTROS.map((f) => {
          const n = cuenta(f.id);
          const activo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={activo}
              onClick={() => setFiltro(f.id)}
              className={`foco shrink-0 rounded-full border px-3.5 py-2 text-xs tracking-[0.06em] transition-colors ${
                activo
                  ? 'border-luna-400/60 bg-luna-400/[0.12] text-luna-300'
                  : 'border-noche-600 text-lavanda-300 hover:border-lavanda-300/40 hover:text-lavanda-100'
              }`}
            >
              {f.id === 'dia' ? `Para el ${etiquetaDia}` : f.texto}
              {n !== null && <span className="ml-1.5 text-lavanda-400">{n}</span>}
            </button>
          );
        })}
      </div>

      {lista.length === 0 ? (
        <Vacio
          filtro={filtro}
          hayRituales={rituales.length > 0}
          etiquetaDia={etiquetaDia}
          fase={faseDelDia}
          onCrear={(prefill) => onNuevo({ date: diaIso, phase: faseDelDia.id, festivalId: festividadDelDia?.id ?? null, ...prefill })}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((r) => (
            <li key={r.id}>
              <TarjetaRitual
                ritual={r}
                abierta={abierto === r.id}
                onAlternar={() => setAbierto(abierto === r.id ? null : r.id)}
                onEditar={() => onEditar(r)}
                onBorrar={() => onBorrar(r)}
                onAlternarHecho={() => onAlternarHecho(r.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Vacio({
  filtro,
  hayRituales,
  etiquetaDia,
  fase,
  onCrear,
}: {
  filtro: Filtro;
  hayRituales: boolean;
  etiquetaDia: string;
  fase: { id: MoonPhaseId; name: string };
  onCrear: (prefill?: Partial<Ritual>) => void;
}) {
  if (filtro === 'hechos' || filtro === 'pendientes') {
    return (
      <p className="superficie-2 px-5 py-6 text-center text-sm text-lavanda-300">
        {filtro === 'hechos'
          ? 'Todavía no marcaste ningún ritual como hecho. Cuando lo hagas, queda acá como historial.'
          : 'No tenés rituales pendientes.'}
      </p>
    );
  }

  const idea = infoDeFase(fase.id).note;
  return (
    <div className="superficie-2 flex flex-col items-center gap-4 px-5 py-8 text-center sm:flex-row sm:items-center sm:text-left">
      <MoonDisc phase={{ ...lookDeFase(fase.id) }} size={64} variant="icon" animate={false} decorativo />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-lavanda-100">
          {hayRituales ? `Nada anotado para el ${etiquetaDia}` : 'Tu cuaderno de rituales está en blanco'}
        </p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-lavanda-300">
          Anotá tus propias prácticas: qué hacés, con qué materiales y cómo te fue. Podés atarlas a un día, a una fase
          o a una festividad.
        </p>
        {/* La sugerencia sale de la nota simbólica de la fase, que la app ya
            tiene; no es un ritual inventado: sólo un punto de partida. */}
        <p className="mt-3 max-w-prose text-sm text-lavanda-200">
          <span className="text-xs uppercase tracking-[0.16em] text-luna-400">Idea para {fase.name.toLowerCase()} · </span>
          {idea}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button size="sm" onClick={() => onCrear()} icon={<Icono nombre="mas" className="h-3.5 w-3.5" />}>
            Crear ritual
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCrear({ title: `Ritual de ${fase.name}`, notes: `Idea de la fase: ${idea}` })}>
            Partir de esta idea
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   La tarjeta
   ========================================================================== */

function TarjetaRitual({
  ritual,
  abierta,
  onAlternar,
  onEditar,
  onBorrar,
  onAlternarHecho,
}: {
  ritual: Ritual;
  abierta: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onBorrar: () => void;
  onAlternarHecho: () => void;
}) {
  const reducir = useReducedMotion();
  const hecho = !!ritual.completedAt;
  const fecha = ritual.date ? desdeIsoDia(ritual.date) : null;
  const anioFestividad = fecha?.getFullYear() ?? new Date().getFullYear();
  const idDetalle = useId();
  const ref = useRef<HTMLElement>(null);

  /* Al abrir un ritual desde el calendario o una festividad, se lo trae a la
     vista y se le da el foco. */
  useEffect(() => {
    if (abierta) ref.current?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' });
  }, [abierta, reducir]);

  return (
    <article
      ref={ref}
      id={`ritual-${ritual.id}`}
      tabIndex={-1}
      className={`foco h-full rounded-2xl border transition-colors ${
        hecho ? 'border-noche-600/50 bg-noche-900/60' : 'border-noche-600/70 bg-noche-800/80'
      } ${abierta ? 'border-lavanda-300/30' : ''}`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Hecho / pendiente: botón propio, con texto para lector de pantalla. */}
        <button
          type="button"
          onClick={onAlternarHecho}
          aria-pressed={hecho}
          aria-label={hecho ? `Marcar "${ritual.title}" como pendiente` : `Marcar "${ritual.title}" como hecho`}
          className={`foco mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
            hecho
              ? 'border-luna-300 bg-luna-400 text-noche-950'
              : 'border-lavanda-300/50 text-transparent hover:border-luna-300 hover:text-luna-300/60'
          }`}
        >
          <Icono nombre="check" className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h3 className={`font-display text-base ${hecho ? 'text-lavanda-300' : 'text-lavanda-100'}`}>{ritual.title}</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Vínculos">
            {ritual.phase !== 'any' && (
              <li className="inline-flex items-center gap-1 rounded-full border border-noche-600 px-2 py-0.5 text-xs text-lavanda-300">
                <MoonDisc phase={lookDeFase(ritual.phase)} size={12} variant="icon" animate={false} decorativo />
                {NOMBRE_FASE[ritual.phase]}
              </li>
            )}
            {fecha && (
              <li className="inline-flex items-center gap-1 rounded-full border border-noche-600 px-2 py-0.5 text-xs text-lavanda-300">
                <Icono nombre="calendario" className="h-3 w-3" />
                {FECHA_CORTA.format(fecha).replace('.', '')} {fecha.getFullYear()}
              </li>
            )}
            {ritual.festivalId && (
              <li className="inline-flex items-center gap-1 rounded-full border border-noche-600 px-2 py-0.5 text-xs text-lavanda-300">
                {nombreFestividad(ritual.festivalId, anioFestividad)}
              </li>
            )}
            {ritual.phase === 'any' && !fecha && !ritual.festivalId && (
              <li className="rounded-full border border-noche-600 px-2 py-0.5 text-xs text-lavanda-400">Cualquier momento</li>
            )}
          </ul>
          <p className="mt-1.5 text-xs text-lavanda-400" aria-live="polite">
            {hecho
              ? `Hecho el ${FECHA_LARGA_ANIO.format(new Date(ritual.completedAt as string))}`
              : 'Pendiente'}
          </p>
        </div>

        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={idDetalle}
          className="foco flex h-9 shrink-0 items-center gap-1 rounded-full border border-noche-600 px-3 text-xs text-lavanda-200 hover:border-lavanda-300/40"
        >
          {abierta ? 'Cerrar' : 'Ver'}
          <Icono nombre="abajo" className={`h-3.5 w-3.5 transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            id={idDetalle}
            initial={reducir ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reducir ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-noche-600/50 px-4 pb-4 pt-3 text-sm">
              <Bloque titulo="Instrucciones" texto={ritual.body} />
              {ritual.materials && <Bloque titulo="Materiales" texto={ritual.materials} />}
              {ritual.notes && <Bloque titulo="Notas" texto={ritual.notes} />}

              <div className="text-xs leading-relaxed">
                {ritual.source ? (
                  <p className="text-lavanda-300">
                    Fuente: <span className="text-lavanda-100">{ritual.source}</span>
                    {ritual.sourceDetail && <span> · {ritual.sourceDetail}</span>}
                  </p>
                ) : (
                  <p className="italic text-lavanda-400">Sin fuente anotada.</p>
                )}
                {ritual.source && !ritual.sourceVerified && (
                  <p className="mt-1 flex items-start gap-1.5 text-amber-200/85">
                    <Icono nombre="aviso" className="mt-px h-3.5 w-3.5 shrink-0" />
                    Fuente sin verificar: la app no comprueba que el ritual venga de ahí.
                  </p>
                )}
                {ritual.sourceVerified && (
                  <p className="mt-1 flex items-center gap-1.5 text-emerald-300/80">
                    <Icono nombre="check" className="h-3.5 w-3.5" /> Marcaste la fuente como verificada.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={onEditar}
                  className="foco inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-noche-600 px-4 text-xs uppercase tracking-[0.12em] text-lavanda-100 hover:border-lavanda-300/40"
                >
                  <Icono nombre="lapiz" className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={onBorrar}
                  className="foco inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border border-rosa-400/30 px-4 text-xs uppercase tracking-[0.12em] text-rosa-300 hover:bg-rosa-400/10"
                >
                  <Icono nombre="papelera" className="h-3.5 w-3.5" /> Borrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-lavanda-400">{titulo}</p>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-lavanda-200">{texto}</p>
    </div>
  );
}

/* ==========================================================================
   Diálogo base: fondo, Escape, foco inicial y vuelta del foco
   ========================================================================== */

function Dialogo({
  titulo,
  onCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  const reducir = useReducedMotion();
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  useEscape(true, onCerrar);

  /* Foco al abrir y de vuelta a donde estaba al cerrar. */
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    /* `querySelector` con una lista devuelve el primero en el documento, no
       el de la lista: por eso dos búsquedas. */
    const primero =
      caja.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      caja.current?.querySelector<HTMLElement>('input, textarea, button');
    primero?.focus();
    return () => previo?.focus?.();
  }, []);

  /* Tab no se escapa del diálogo. */
  const atrapar = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !caja.current) return;
    const focos = caja.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focos.length === 0) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  return (
    <motion.div
      initial={reducir ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-noche-950/80 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:py-10"
      onClick={onCerrar}
    >
      <motion.div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        initial={reducir ? false : { y: 16, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducir ? undefined : { y: 16, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={atrapar}
        className={`w-full ${ancho} max-h-[92vh] overflow-y-auto rounded-t-3xl border border-noche-600 bg-noche-800 p-5 shadow-card sm:rounded-3xl sm:p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="font-display text-lg text-luna-300">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="foco -mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-lavanda-300 hover:bg-noche-700 hover:text-lavanda-100"
          >
            <Icono nombre="cerrar" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ==========================================================================
   El editor
   ========================================================================== */

export function EditorRitual({
  ritual,
  esNuevo,
  onGuardar,
  onCancelar,
}: {
  ritual: Ritual;
  esNuevo: boolean;
  onGuardar: (r: Ritual) => void;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<Ritual>(ritual);
  const [error, setError] = useState<string | null>(null);
  const anio = (b.date ? desdeIsoDia(b.date) : null)?.getFullYear() ?? new Date().getFullYear();
  const festividades = useMemo(() => festivalsOf(anio), [anio]);
  const set = <K extends keyof Ritual>(k: K, v: Ritual[K]) => setB((x) => ({ ...x, [k]: v }));

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    if (!b.title.trim()) return setError('Poné un título para encontrarlo después.');
    if (!b.body.trim()) return setError('Anotá las instrucciones: qué se hace y en qué orden.');
    if (b.date && !desdeIsoDia(b.date)) return setError('La fecha no es válida.');
    setError(null);
    onGuardar(b);
  };

  const campo = 'mt-1.5 !border-noche-600 !bg-noche-900/80 !py-2.5 text-sm';
  const etiqueta = 'text-xs uppercase tracking-[0.14em] text-lavanda-300';

  return (
    <Dialogo titulo={esNuevo ? 'Nuevo ritual' : 'Editar ritual'} onCerrar={onCancelar}>
      <form onSubmit={guardar} className="space-y-4" noValidate>
        <div>
          <label className={etiqueta} htmlFor="rit-title">
            Título <span className="text-rosa-300">*</span>
          </label>
          <input
            id="rit-title"
            type="text"
            data-autofocus
            required
            maxLength={200}
            value={b.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ej. Intención de Luna Nueva"
            className={campo}
          />
        </div>

        <div>
          <label className={etiqueta} htmlFor="rit-body">
            Instrucciones <span className="text-rosa-300">*</span>
          </label>
          <textarea
            id="rit-body"
            rows={4}
            required
            maxLength={8000}
            value={b.body}
            onChange={(e) => set('body', e.target.value)}
            placeholder="Qué se hace, en qué orden."
            className={campo}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiqueta} htmlFor="rit-materials">
              Materiales
            </label>
            <textarea
              id="rit-materials"
              rows={2}
              maxLength={4000}
              value={b.materials ?? ''}
              onChange={(e) => set('materials', e.target.value)}
              placeholder="Vela, mazo, cuaderno…"
              className={campo}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="rit-notes">
              Notas personales
            </label>
            <textarea
              id="rit-notes"
              rows={2}
              maxLength={8000}
              value={b.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Cómo te fue, qué cambiarías."
              className={campo}
            />
          </div>
        </div>

        {/* ---------------- Vínculos ---------------- */}
        <fieldset className="rounded-2xl border border-noche-600/70 p-3.5">
          <legend className="px-1 text-xs uppercase tracking-[0.14em] text-lavanda-300">Cuándo</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-lavanda-300" htmlFor="rit-date">
                Día
              </label>
              <input
                id="rit-date"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={b.date ?? ''}
                onChange={(e) => set('date', e.target.value || null)}
                className={campo}
              />
            </div>
            <div>
              <label className="text-xs text-lavanda-300" htmlFor="rit-phase">
                Fase
              </label>
              <select
                id="rit-phase"
                value={b.phase}
                onChange={(e) => set('phase', e.target.value as MoonPhaseId | 'any')}
                className={campo}
              >
                {OPCIONES_FASE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-lavanda-300" htmlFor="rit-festival">
                Festividad
              </label>
              <select
                id="rit-festival"
                value={b.festivalId ?? ''}
                onChange={(e) => set('festivalId', e.target.value || null)}
                className={campo}
              >
                <option value="">Ninguna</option>
                {festividades.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-lavanda-400">
            Todo es opcional. Sin día, el ritual vale para cada vez que llegue la fase o la festividad.
          </p>
        </fieldset>

        {/* ---------------- Fuente ---------------- */}
        <fieldset className="rounded-2xl border border-noche-600/70 p-3.5">
          <legend className="px-1 text-xs uppercase tracking-[0.14em] text-lavanda-300">Fuente</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-lavanda-300" htmlFor="rit-source">
                De dónde lo sacaste
              </label>
              <input
                id="rit-source"
                type="text"
                maxLength={300}
                value={b.source ?? ''}
                onChange={(e) => set('source', e.target.value)}
                placeholder="Obra, autor o tradición"
                className={campo}
              />
            </div>
            <div>
              <label className="text-xs text-lavanda-300" htmlFor="rit-source-detail">
                Capítulo o página
              </label>
              <input
                id="rit-source-detail"
                type="text"
                maxLength={300}
                value={b.sourceDetail ?? ''}
                onChange={(e) => set('sourceDetail', e.target.value)}
                className={campo}
              />
            </div>
          </div>
          {b.source && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={b.sourceVerified}
                onChange={(e) => set('sourceVerified', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-luna-400"
              />
              <span className="text-sm leading-relaxed text-lavanda-200">
                Verifiqué que este ritual aparece en esa fuente.
                <span className="mt-0.5 block text-xs text-lavanda-400">
                  La app no puede comprobarlo: queda como tu confirmación, no como un dato comprobado.
                </span>
              </span>
            </label>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-rosa-400/40 bg-rosa-400/10 px-3.5 py-2 text-sm text-lavanda-100">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit">{esNuevo ? 'Guardar ritual' : 'Guardar cambios'}</Button>
        </div>
      </form>
    </Dialogo>
  );
}

/* ==========================================================================
   Confirmación de borrado
   ========================================================================== */

export function ConfirmarBorrado({
  ritual,
  onConfirmar,
  onCancelar,
}: {
  ritual: Ritual;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialogo titulo="¿Borrar el ritual?" onCerrar={onCancelar} ancho="max-w-sm">
      <p className="text-sm leading-relaxed text-lavanda-200">
        «{ritual.title}» se borra de tu cuenta, con sus notas. No se puede deshacer.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirmar}>
          Sí, borrar
        </Button>
      </div>
    </Dialogo>
  );
}

