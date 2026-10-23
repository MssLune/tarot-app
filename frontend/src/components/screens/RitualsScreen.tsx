import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { festivalsOf, lunaDelDia } from '@arcana/tarot-core';
import { useReadingStore, uid } from '../../store/useReadingStore';
import type { Ritual } from '../../types';
import EclipseNotice from '../moon/EclipseNotice';
import FaseActual from '../moon/FaseActual';
import FestivalList from '../moon/FestivalList';
import MoonCalendar from '../moon/MoonCalendar';
import { ConfirmarBorrado, EditorRitual, SeccionRituales } from '../moon/Rituales';
import { desdeIsoDia, isoDia } from '../moon/lunaUi';
import InvitacionCuenta from '../ui/InvitacionCuenta';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Luna: la fase de hoy, el calendario, tus rituales y las festividades.

   El orden es la jerarquía de la pantalla: primero lo que se vino a ver (la
   Luna de hoy), después el mes, después lo propio (los rituales del día
   elegido) y al final el año (las festividades).

   UN SOLO DÍA ELEGIDO para toda la pantalla: lo cambia el calendario, y de
   él salen el detalle del día y el filtro "Para el día elegido" de los
   rituales.

   Sin sesión se ve todo lo astronómico; anotar rituales y notas pide
   cuenta, porque se guarda en ella (nunca en el navegador).
   ========================================================================== */

/** Ritual nuevo, con los vínculos que vengan del contexto. */
function nuevoRitual(prefill: Partial<Ritual> = {}): Ritual {
  return {
    id: uid('rit'),
    title: '',
    body: '',
    phase: 'any',
    source: '',
    sourceDetail: '',
    sourceVerified: false,
    date: null,
    festivalId: null,
    notes: '',
    materials: '',
    completedAt: null,
    ...prefill,
  };
}

export default function RitualsScreen() {
  const rituals = useReadingStore((s) => s.rituals);
  const saveRitual = useReadingStore((s) => s.saveRitual);
  const deleteRitual = useReadingStore((s) => s.deleteRitual);
  const toggleRitualDone = useReadingStore((s) => s.toggleRitualDone);
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  const pedirCuenta = useReadingStore((s) => s.pedirCuenta);
  const syncInFlight = useReadingStore((s) => s.syncInFlight);
  const pendingOps = useReadingStore((s) => s.pendingOps);
  const planNotice = useReadingStore((s) => s.planNotice);
  const retrySync = useReadingStore((s) => s.retrySync);

  const [dia, setDia] = useState(() => isoDia(new Date()));
  const [editando, setEditando] = useState<{ ritual: Ritual; esNuevo: boolean } | null>(null);
  const [borrando, setBorrando] = useState<Ritual | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enfocar, setEnfocar] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => {
    if (!mensaje) return;
    const t = window.setTimeout(() => setMensaje(null), 3200);
    return () => window.clearTimeout(t);
  }, [mensaje]);
  const calendario = useRef<HTMLDivElement>(null);

  /* La Luna y la festividad del día elegido, para los rituales. */
  const fechaDia = desdeIsoDia(dia) ?? new Date();
  const lunaDia = useMemo(() => lunaDelDia(fechaDia), [dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const festividadDia = useMemo(
    () => festivalsOf(fechaDia.getFullYear()).find((f) => isoDia(f.date) === dia),
    [dia], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const abrirEditor = useCallback(
    (prefill?: Partial<Ritual>) => {
      if (!isAuthenticated) {
        pedirCuenta('Inicia sesión para anotar tus rituales y verlos en cualquier dispositivo.');
        return;
      }
      setEditando({ ritual: nuevoRitual(prefill), esNuevo: true });
    },
    [isAuthenticated, pedirCuenta],
  );

  const abrirRitual = (id: string) => {
    setAbierto(id);
    /* La tarjeta se trae a la vista sola al abrirse (ver TarjetaRitual). */
    window.setTimeout(() => document.getElementById(`ritual-${id}`)?.focus({ preventScroll: true }), 50);
  };

  const verCalendario = () => {
    calendario.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setEnfocar((n) => n + 1);
  };

  const sinSubir = pendingOps.filter((op) => op.key.startsWith('ritual:')).length;
  const aviso = planNotice?.key.startsWith('ritual:') ? planNotice.message : null;

  return (
    <div className="space-y-10 sm:space-y-12">
      {/* ---------------- Encabezado ---------------- */}
      {/* El mismo encabezado que el resto de las pantallas. */}
      <SectionHeading
        overline="Calendario"
        title="Fase lunar y rituales"
        subtitle="La fase se calcula en tu dispositivo, en tu zona horaria. Los rituales son tuyos: anota qué practicas y de dónde lo sacaste."
      />

      {/* ---------------- 1. La Luna de hoy ---------------- */}
      <div className="space-y-3">
        <FaseActual
          onAnotar={() => {
            const hoy = new Date();
            abrirEditor({ date: isoDia(hoy), phase: lunaDelDia(hoy).id });
          }}
          onVerCalendario={verCalendario}
        />
        {/* Pegado a la fase: si hoy hay eclipse, el aviso va con el disco. */}
        <EclipseNotice />
      </div>

      {/* ---------------- 2. El mes ---------------- */}
      <div ref={calendario} className="scroll-mt-24">
        <MoonCalendar
          seleccion={dia}
          onSeleccionar={setDia}
          rituales={isAuthenticated ? rituals : []}
          enfocar={enfocar}
          onCrearRitual={(iso, festivalId) =>
            abrirEditor({ date: iso, phase: lunaDelDia(desdeIsoDia(iso) ?? new Date()).id, festivalId })
          }
          onAbrirRitual={abrirRitual}
        />
      </div>

      {/* ---------------- 3. Tus rituales ---------------- */}
      {isAuthenticated ? (
        <SeccionRituales
          rituales={rituals}
          diaIso={dia}
          faseDelDia={{ id: lunaDia.id, name: lunaDia.name }}
          festividadDelDia={festividadDia ? { id: festividadDia.id, name: festividadDia.name } : undefined}
          sincronizando={syncInFlight > 0}
          sinSubir={sinSubir}
          aviso={aviso}
          onReintentar={() => void retrySync()}
          onNuevo={abrirEditor}
          onEditar={(r) => setEditando({ ritual: r, esNuevo: false })}
          onBorrar={setBorrando}
          onAlternarHecho={toggleRitualDone}
          abierto={abierto}
          setAbierto={setAbierto}
        />
      ) : (
        <InvitacionCuenta
          compacta
          titulo="Tus rituales"
          texto="Con una cuenta puedes anotar tus rituales por día, fase o festividad, marcarlos como hechos y verlos en cualquier dispositivo."
        />
      )}

      {/* ---------------- 4. El año ---------------- */}
      <FestivalList
        rituales={isAuthenticated ? rituals : []}
        onCrearRitual={(festivalId, iso) =>
          abrirEditor({ festivalId, date: iso, phase: lunaDelDia(desdeIsoDia(iso) ?? new Date()).id })
        }
        onAbrirRitual={abrirRitual}
      />

      {/* ---------------- Aviso de éxito ---------------- */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[95] flex justify-center px-4">
        {mensaje && (
          <p className="rounded-full border border-luna-400/40 bg-noche-800/95 px-4 py-2 text-sm text-gold-100 shadow-card">
            {mensaje}
          </p>
        )}
      </div>

      {/* ---------------- Diálogos ---------------- */}
      <AnimatePresence>
        {editando && (
          <EditorRitual
            key="editor"
            ritual={editando.ritual}
            esNuevo={editando.esNuevo}
            onCancelar={() => setEditando(null)}
            onGuardar={(r) => {
              saveRitual(r);
              setEditando(null);
              /* Se elige su día para que el ritual quede a la vista. */
              if (r.date) setDia(r.date);
              setAbierto(r.id);
              setMensaje(editando.esNuevo ? 'Ritual guardado.' : 'Cambios guardados.');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {borrando && (
          <ConfirmarBorrado
            key="borrar"
            ritual={borrando}
            onCancelar={() => setBorrando(null)}
            onConfirmar={() => {
              deleteRitual(borrando.id);
              setBorrando(null);
              setMensaje('Ritual borrado.');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
