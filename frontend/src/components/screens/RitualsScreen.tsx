import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { moonPhase, phasesOfLunation, type MoonPhaseId } from '@arcana/tarot-core';
import { useReadingStore, uid } from '../../store/useReadingStore';
import type { Ritual } from '../../types';
import MoonDisc from '../cards/MoonDisc';
import EclipseNotice from '../moon/EclipseNotice';
import FestivalList from '../moon/FestivalList';
import MoonCalendar from '../moon/MoonCalendar';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Fase lunar y rituales.

   SOBRE LAS FUENTES: esta pantalla NO verifica de dónde sale un ritual. El
   usuario escribe la fuente y, si quiere, la marca como verificada. Mientras
   no lo haga, la app la muestra con una advertencia visible en vez de
   presentarla como un hecho. La app no inventa atribuciones.

   Es la diferencia entre "esto viene de un libro" y "alguien lo anotó acá".
   Vale la pena ser explícito porque una cita falsa es indistinguible de una
   verdadera una vez escrita.
   ========================================================================== */

const PHASE_OPTIONS: { value: MoonPhaseId | 'any'; label: string }[] = [
  { value: 'any', label: 'Cualquier momento' },
  { value: 'new', label: 'Luna Nueva' },
  { value: 'waxing-crescent', label: 'Luna Creciente' },
  { value: 'first-quarter', label: 'Cuarto Creciente' },
  { value: 'waxing-gibbous', label: 'Casi Llena' },
  { value: 'full', label: 'Luna Llena' },
  { value: 'waning-gibbous', label: 'Luna Menguante' },
  { value: 'last-quarter', label: 'Cuarto Menguante' },
  { value: 'waning-crescent', label: 'Luna Balsema' },
];

const PHASE_LABEL = Object.fromEntries(PHASE_OPTIONS.map((o) => [o.value, o.label]));

const FASE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default function RitualsScreen() {
  const rituals = useReadingStore((s) => s.rituals);
  const saveRitual = useReadingStore((s) => s.saveRitual);
  const deleteRitual = useReadingStore((s) => s.deleteRitual);

  const hoy = useMemo(() => moonPhase(), []);
  const ciclo = useMemo(() => phasesOfLunation(), []);
  const [editando, setEditando] = useState<Ritual | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  /* Los rituales que tocan la fase de hoy, más los que no dependen de la fase. */
  const delDia = useMemo(
    () => rituals.filter((r) => r.phase === 'any' || r.phase === hoy.id),
    [rituals, hoy.id],
  );

  const porFase = useMemo(
    () =>
      rituals
        .filter((r) => r.phase !== 'any')
        .sort((a, b) => a.phase.localeCompare(b.phase)),
    [rituals],
  );

  return (
    <div className="space-y-9">
      <SectionHeading
        overline="Calendario"
        title="Fase lunar y rituales"
        subtitle="La fase se calcula astronómicamente. Los rituales son tuyos: anotá lo que quieras practicar y de dónde lo sacaste."
      />

      {/* ---------------- Fase de hoy ---------------- */}
      <section className="panel gilded overflow-hidden p-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Registro grande: el de la fase de hoy, con halo. */}
          <MoonDisc phase={hoy} size={118} variant="engraved" glow className="shrink-0" />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="overline mb-1">{FASE_FORMAT.format(new Date())}</p>
            <h2 className="font-display text-xl text-gold-gradient">{hoy.name}</h2>
            <p className="mt-1 text-xs text-gold-100/50">
              {Math.round(hoy.illumination * 100)}% iluminada · día {hoy.age.toFixed(1)} del lunación
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gold-100/75">{hoy.note}</p>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-gold-100/35">
              Próxima: <span className="text-gold-200/70">{hoy.next.name}</span> el{' '}
              {FASE_FORMAT.format(hoy.next.date)}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Eclipse de hoy ---------------- */}
      {/* Va pegado a la fase: si hoy es luna de sangre, el cartel tiene que
          estar en la misma pantalla que el disco, no más abajo. */}
      <EclipseNotice />

      {/* ---------------- El lunación, mes a mes ---------------- */}
      {/* Antes acá iban ocho fichas, una por fase. Es la información correcta
          pero no se lee como un calendario: no dice en qué día cae la Luna
          Llena de este mes ni cuántos días faltan. */}
      <MoonCalendar />

      {/* ---------------- Las ocho fases y sus rituales ---------------- */}
      {/* Achicada a propósito. Antes era la seccion principal y tenía que
          decir cómo se veía la Luna; ahora eso lo hace el
          calendario de arriba. Queda sólo para lo que sigue. */}
      {rituals.some((r) => r.phase !== 'any') && (
        <section className="panel p-3">
          <h3 className="overline mb-2.5">Fases con rituales</h3>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {ciclo.map((fase) => {
              const conRituales = rituals.some((r) => r.phase === fase.id);
              if (!conRituales) return null;
              return (
                <div
                  key={fase.id}
                  className="flex flex-col items-center gap-1 rounded-lg border border-gold-400/15 bg-ink-950/40 px-1 py-2 text-center"
                >
                  <MoonDisc phase={fase} size={28} variant="icon" />
                  <span className="text-[0.52rem] leading-tight text-gold-100/70">
                    {fase.name.replace('Luna ', '')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------------- Rituales de hoy ---------------- */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            Para esta fase
          </h3>
          <span className="hairline h-px flex-1 opacity-60" />
          <Button size="sm" onClick={() => setEditando(nuevoRitual(hoy.id))}>
            + Anotar ritual
          </Button>
        </div>

        {delDia.length === 0 ? (
          <p className="panel px-5 py-8 text-center text-xs text-gold-100/40">
            No tenés rituales anotados para {hoy.name.toLowerCase()}.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {delDia.map((ritual) => (
              <RitualCard
                key={ritual.id}
                ritual={ritual}
                onEdit={() => setEditando(ritual)}
                onDelete={() => setBorrando(ritual.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- El resto, por fase ---------------- */}
      {porFase.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            Los demás rituales
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {porFase.map((ritual) => (
              <RitualCard
                key={ritual.id}
                ritual={ritual}
                onEdit={() => setEditando(ritual)}
                onDelete={() => setBorrando(ritual.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Festividades ---------------- */}
      {/* Al final y no arriba: el calendario del año es contexto. Lo primero
          que se abre la pantalla es la fase de HOY, que es lo que la persona
          fue a ver. */}
      <FestivalList />

      {/* ---------------- Editor ---------------- */}
      <AnimatePresence>
        {editando && (
          <RitualEditor
            ritual={editando}
            onCancel={() => setEditando(null)}
            onSave={(ritual) => {
              saveRitual(ritual);
              setEditando(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {borrando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
            onClick={() => setBorrando(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="panel gilded w-full max-w-sm p-5 text-center"
            >
              <h3 className="font-display text-sm text-gold-100">¿Borrar el ritual?</h3>
              <p className="mt-2 text-xs text-gold-100/50">Se borra de la cuenta también.</p>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    deleteRitual(borrando);
                    setBorrando(null);
                  }}
                >
                  Sí, borrar
                </Button>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setBorrando(null)}>
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Ritual nuevo, prellenado con la fase que se está viendo. */
function nuevoRitual(phase: MoonPhaseId | 'any'): Ritual {
  return {
    id: uid('rit'),
    title: '',
    body: '',
    phase,
    source: '',
    sourceDetail: '',
    sourceVerified: false,
  };
}

/* -------------------------------------------------------------------------- */

function RitualCard({
  ritual,
  onEdit,
  onDelete,
}: {
  ritual: Ritual;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      className="panel flex flex-col p-4 transition-colors hover:border-gold-400/40"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-sm text-gold-100">
            {ritual.title || 'Sin título'}
          </h4>
          <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-gold-100/35">
            {PHASE_LABEL[ritual.phase] ?? ritual.phase}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-full border border-gold-400/25 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.12em] text-gold-200/70 transition-colors hover:border-gold-300/60 hover:text-gold-100"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Borrar ritual"
          className="shrink-0 rounded-full border border-gold-400/20 px-2 py-0.5 text-[0.55rem] text-rose-200/70 transition-colors hover:border-rose-400/60 hover:text-rose-100"
        >
          ✕
        </button>
      </div>

      <p className="mt-2.5 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-gold-100/60">
        {ritual.body || 'Sin pasos anotados.'}
      </p>

      {/* La fuente se muestra, pero nunca se da por buena sola. */}
      <div className="mt-3 border-t border-gold-400/12 pt-2.5">
        {ritual.source ? (
          <p className="text-[0.65rem] leading-relaxed text-gold-100/45">
            Fuente: <span className="text-gold-200/80">{ritual.source}</span>
            {ritual.sourceDetail && (
              <span className="text-gold-100/40"> · {ritual.sourceDetail}</span>
            )}
          </p>
        ) : (
          <p className="text-[0.65rem] italic text-gold-100/30">Sin fuente anotada.</p>
        )}
        {ritual.source && !ritual.sourceVerified && (
          <p
            className="mt-1 text-[0.6rem] leading-relaxed text-amber-200/70"
            title="La app no puede comprobar que el ritual venga realmente de esa fuente. Sólo vos sabés."
          >
            ⚠ Fuente sin verificar: la app no comprueba que el ritual venga de ahí.
          </p>
        )}
        {ritual.sourceVerified && (
          <p className="mt-1 text-[0.6rem] text-emerald-300/60">
            ✓ Marcaste la fuente como verificada.
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */

function RitualEditor({
  ritual,
  onSave,
  onCancel,
}: {
  ritual: Ritual;
  onSave: (ritual: Ritual) => void;
  onCancel: () => void;
}) {
  const [borrador, setBorrador] = useState<Ritual>(ritual);
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    if (!borrador.title.trim()) {
      setError('Poné un título para encontrarlo después.');
      return;
    }
    if (!borrador.body.trim()) {
      setError('Anotá los pasos del ritual.');
      return;
    }
    onSave(borrador);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 py-10 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.97, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="panel gilded w-full max-w-lg space-y-4 p-5"
      >
        <h3 className="font-display text-sm uppercase tracking-[0.18em] text-gold-100">
          {ritual.title ? 'Editar ritual' : 'Anotar ritual'}
        </h3>

        <div>
          <label className="overline mb-1.5 block" htmlFor="rit-title">
            Título
          </label>
          <input
            id="rit-title"
            type="text"
            value={borrador.title}
            onChange={(e) => setBorrador({ ...borrador, title: e.target.value })}
            placeholder="Ej. Barajado del viejo"
            className="!py-2"
          />
        </div>

        <div>
          <label className="overline mb-1.5 block" htmlFor="rit-body">
            Pasos
          </label>
          <textarea
            id="rit-body"
            rows={5}
            value={borrador.body}
            onChange={(e) => setBorrador({ ...borrador, body: e.target.value })}
            placeholder="Qué se hace, con qué, en qué orden."
            className="!py-2 text-sm"
          />
        </div>

        <div>
          <label className="overline mb-1.5 block" htmlFor="rit-phase">
            ¿Cuándo se hace?
          </label>
          <select
            id="rit-phase"
            value={borrador.phase}
            onChange={(e) =>
              setBorrador({ ...borrador, phase: e.target.value as MoonPhaseId | 'any' })
            }
            className="!py-2 text-sm"
          >
            {PHASE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* ---------------- Fuente ---------------- */}
        <div className="rounded-xl border border-gold-400/20 bg-ink-950/40 p-3.5">
          <p className="overline mb-2">Fuente</p>
          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-[0.6rem] text-gold-100/45" htmlFor="rit-source">
                De dónde lo sacaste
              </label>
              <input
                id="rit-source"
                type="text"
                value={borrador.source ?? ''}
                onChange={(e) => setBorrador({ ...borrador, source: e.target.value })}
                placeholder="Obra, autor o tradición"
                className="!py-2 !text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.6rem] text-gold-100/45" htmlFor="rit-source-detail">
                Capítulo o página (opcional)
              </label>
              <input
                id="rit-source-detail"
                type="text"
                value={borrador.sourceDetail ?? ''}
                onChange={(e) => setBorrador({ ...borrador, sourceDetail: e.target.value })}
                className="!py-2 !text-xs"
              />
            </div>

            {borrador.source && (
              <label className="flex cursor-pointer items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={borrador.sourceVerified}
                  onChange={(e) =>
                    setBorrador({ ...borrador, sourceVerified: e.target.checked })
                  }
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-gold-400"
                />
                <span className="text-[0.62rem] leading-relaxed text-gold-100/50">
                  Verifiqué que este ritual aparece en esa fuente.
                  <span className="mt-0.5 block text-gold-100/30">
                    La app no puede comprobarlo: si la marcás, queda como tu
                    confirmación, no como un dato comprobado.
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button fullWidth onClick={guardar}>
            Guardar ritual
          </Button>
          <Button fullWidth variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
