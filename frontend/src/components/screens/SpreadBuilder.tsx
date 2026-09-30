import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LAYOUT_PRESETS, generateLayout } from '../../data/spreadLayouts';
import { buildArchive, downloadArchive } from '../../lib/archive';
import { layoutMetrics } from '../../lib/layout';
import { uid, useReadingStore } from '../../store/useReadingStore';
import type { LayoutPreset, Spread, SpreadPosition } from '../../types';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Creador de tiradas personalizadas.
   - Nombre de la tirada y cantidad de posiciones.
   - Nombre (y matiz opcional) de cada posición.
   - Layout predefinido (línea, cruz, círculo, grilla, pirámide) o libre,
     arrastrando cada carta sobre el lienzo.
   ========================================================================== */

const MIN_POSITIONS = 1;
const MAX_POSITIONS = 12;

/** Crea una posición nueva con nombre por defecto. */
const makePosition = (index: number, x = 50, y = 50): SpreadPosition => ({
  id: uid('pos'),
  name: `Posición ${index + 1}`,
  prompt: '',
  x,
  y,
});

export default function SpreadBuilder() {
  const editingSpread = useReadingStore((s) => s.editingSpread);
  const saveCustomSpread = useReadingStore((s) => s.saveCustomSpread);
  const chooseSpread = useReadingStore((s) => s.chooseSpread);
  const goTo = useReadingStore((s) => s.goTo);

  /* ---------------- Estado local del editor ---------------- */
  const [name, setName] = useState(editingSpread?.name ?? '');
  const [description, setDescription] = useState(editingSpread?.description ?? '');
  const [preset, setPreset] = useState<LayoutPreset>(editingSpread?.preset ?? 'line');
  const [positions, setPositions] = useState<SpreadPosition[]>(() => {
    if (editingSpread) return editingSpread.positions.map((p) => ({ ...p }));
    const coords = generateLayout('line', 3);
    return coords.map((c, i) => makePosition(i, c.x, c.y));
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const metrics = layoutMetrics(positions);

  /* ---------------- Cantidad de posiciones ---------------- */
  const applyPreset = (nextPreset: LayoutPreset, list: SpreadPosition[]) => {
    if (nextPreset === 'free') return list;
    const coords = generateLayout(nextPreset, list.length);
    return list.map((p, i) => ({ ...p, x: coords[i]?.x ?? p.x, y: coords[i]?.y ?? p.y }));
  };

  const setCount = (count: number) => {
    const target = Math.max(MIN_POSITIONS, Math.min(MAX_POSITIONS, count));
    setPositions((prev) => {
      let next = [...prev];
      if (target > prev.length) {
        for (let i = prev.length; i < target; i++) next.push(makePosition(i));
      } else {
        next = next.slice(0, target);
      }
      return applyPreset(preset, next);
    });
  };

  const changePreset = (nextPreset: LayoutPreset) => {
    setPreset(nextPreset);
    setPositions((prev) => applyPreset(nextPreset, prev));
  };

  const updatePosition = (index: number, patch: Partial<SpreadPosition>) => {
    setPositions((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const removePosition = (index: number) => {
    if (positions.length <= MIN_POSITIONS) return;
    setPositions((prev) => applyPreset(preset, prev.filter((_, i) => i !== index)));
  };

  /* ---------------- Arrastre en el lienzo ---------------- */
  const moveTo = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clamp = (v: number) => Math.max(6, Math.min(94, v));
      // Redondeo a 0.5% para un movimiento suave pero prolijo.
      const x = clamp(Math.round(((clientX - rect.left) / rect.width) * 200) / 2);
      const y = clamp(Math.round(((clientY - rect.top) / rect.height) * 200) / 2);
      setPositions((prev) => prev.map((p, i) => (i === index ? { ...p, x, y } : p)));
    },
    [],
  );

  // Listeners globales mientras se arrastra: permiten soltar fuera del lienzo.
  useEffect(() => {
    if (dragIndex === null) return;

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      moveTo(dragIndex, e.clientX, e.clientY);
    };
    const handleUp = () => setDragIndex(null);

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragIndex, moveTo]);

  const startDrag = (index: number) => {
    // Al mover a mano, el layout pasa a ser libre.
    setPreset('free');
    setDragIndex(index);
  };

  /* ---------------- Guardado ---------------- */
  const buildSpread = (): Spread => ({
    id: editingSpread?.id ?? uid('spread'),
    name: name.trim() || 'Mi tirada',
    description:
      description.trim() ||
      `Tirada personalizada de ${positions.length} ${positions.length === 1 ? 'posición' : 'posiciones'}.`,
    positions: positions.map((p, i) => ({
      ...p,
      name: p.name.trim() || `Posición ${i + 1}`,
      prompt: p.prompt?.trim() || undefined,
    })),
    custom: true,
    preset,
    createdAt: editingSpread?.createdAt ?? Date.now(),
  });

  const validate = (): boolean => {
    if (!name.trim()) {
      setError('Ponele un nombre a la tirada para poder guardarla.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    saveCustomSpread(buildSpread());
    goTo('spread');
  };

  const handleSaveAndUse = () => {
    if (!validate()) return;
    const spread = buildSpread();
    saveCustomSpread(spread);
    chooseSpread(spread);
  };

  return (
    <div className="space-y-9">
      <SectionHeading
        overline={editingSpread ? 'Editar tirada' : 'Nueva tirada'}
        title={editingSpread ? 'Ajustá tu tirada' : 'Diseñá tu tirada'}
        subtitle="Definí cuántas cartas usás, qué representa cada posición y cómo se ubican en el paño. Se guarda en tu dispositivo para reutilizarla cuando quieras."
      />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ================= Columna izquierda: datos ================= */}
        <div className="space-y-5">
          {/* --- Identidad de la tirada --- */}
          <div className="panel gilded space-y-4 p-5">
            <div>
              <label className="overline mb-2 block" htmlFor="spread-name">
                Nombre de la tirada
              </label>
              <input
                id="spread-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ej: Mi tirada de decisiones"
              />
            </div>

            <div>
              <label className="overline mb-2 block" htmlFor="spread-desc">
                Descripción{' '}
                <span className="normal-case tracking-normal text-gold-100/25">(opcional)</span>
              </label>
              <input
                id="spread-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para qué la usás"
              />
            </div>

            {/* --- Cantidad de posiciones --- */}
            <div>
              <span className="overline mb-2 block">Cantidad de posiciones</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-full border border-gold-400/25 bg-ink-900/70 p-1">
                  <button
                    onClick={() => setCount(positions.length - 1)}
                    disabled={positions.length <= MIN_POSITIONS}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gold-200 transition-colors hover:bg-gold-400/15 disabled:opacity-25"
                    title="Quitar una posición"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-display text-lg text-gold-100">
                    {positions.length}
                  </span>
                  <button
                    onClick={() => setCount(positions.length + 1)}
                    disabled={positions.length >= MAX_POSITIONS}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gold-200 transition-colors hover:bg-gold-400/15 disabled:opacity-25"
                    title="Agregar una posición"
                  >
                    +
                  </button>
                </div>
                <p className="text-[0.68rem] text-gold-100/35">
                  Entre {MIN_POSITIONS} y {MAX_POSITIONS} cartas.
                </p>
              </div>
            </div>
          </div>

          {/* --- Nombres de cada posición --- */}
          <div className="panel space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
                Posiciones
              </h3>
              <span className="text-[0.65rem] text-gold-100/30">nombre + matiz opcional</span>
            </div>

            <AnimatePresence initial={false}>
              {positions.map((pos, index) => (
                <motion.div
                  key={pos.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-2xl border p-3 transition-colors ${
                    dragIndex === index
                      ? 'border-gold-300/60 bg-gold-400/[0.07]'
                      : 'border-gold-400/12 bg-ink-950/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400/30 text-[0.65rem] text-gold-200">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={pos.name}
                      onChange={(e) => updatePosition(index, { name: e.target.value })}
                      placeholder={`Posición ${index + 1}`}
                      className="!py-2 !text-sm"
                    />
                    <button
                      onClick={() => removePosition(index)}
                      disabled={positions.length <= MIN_POSITIONS}
                      title="Eliminar posición"
                      className="shrink-0 rounded-full px-2 py-2 text-xs text-rose-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-20"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pos.prompt ?? ''}
                    onChange={(e) => updatePosition(index, { prompt: e.target.value })}
                    placeholder="¿Qué pregunta responde? Ej: lo que no querés mirar"
                    className="mt-2 !py-2 !text-xs"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ================= Columna derecha: layout ================= */}
        <div className="space-y-5 lg:sticky lg:top-36 lg:self-start">
          {/* --- Presets de layout --- */}
          <div className="panel p-5">
            <h3 className="mb-3 font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
              Layout
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {LAYOUT_PRESETS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => changePreset(option.id)}
                  title={option.hint}
                  className={`rounded-xl border px-2 py-2.5 font-display text-[0.6rem] uppercase tracking-[0.14em] transition-all duration-300 ${
                    preset === option.id
                      ? 'border-gold-300/70 bg-gold-400/15 text-gold-100 shadow-glow'
                      : 'border-gold-400/15 text-gold-100/45 hover:border-gold-400/40 hover:text-gold-100/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-gold-100/35">
              {preset === 'free'
                ? 'Modo libre: arrastrá cada carta al lugar que quieras.'
                : 'Elegí un layout base y, si querés, arrastrá cualquier carta para ajustarla a mano.'}
            </p>
          </div>

          {/* --- Lienzo con drag & drop --- */}
          <div className="panel gilded p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
                Paño
              </h3>
              <span className="text-[0.6rem] uppercase tracking-[0.16em] text-gold-100/30">
                arrastrá para ubicar
              </span>
            </div>

            <div className="no-scrollbar w-full overflow-x-auto">
              <div
                ref={canvasRef}
                className="relative mx-auto w-full touch-none select-none rounded-2xl border border-gold-400/15 bg-ink-950/60"
                style={{
                  aspectRatio: `${metrics.aspect}`,
                  minWidth: `${Math.min(metrics.minWidth, 520)}px`,
                  backgroundImage:
                    'linear-gradient(rgba(232,205,138,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(232,205,138,0.055) 1px, transparent 1px)',
                  backgroundSize: '10% 10%',
                }}
              >
                {positions.map((pos, index) => (
                  <div
                    key={pos.id}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startDrag(index);
                    }}
                    className="absolute"
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: `${metrics.cardWidth}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: dragIndex === index ? 30 : 10,
                    }}
                  >
                    <motion.div
                      animate={{
                        scale: dragIndex === index ? 1.12 : 1,
                        boxShadow:
                          dragIndex === index
                            ? '0 0 30px -4px rgba(232,205,138,0.7)'
                            : '0 10px 24px -14px rgba(0,0,0,0.9)',
                      }}
                      transition={{ duration: 0.18 }}
                      className={`flex aspect-[2/3] w-full cursor-grab flex-col items-center justify-center gap-1 rounded-lg border active:cursor-grabbing ${
                        dragIndex === index
                          ? 'border-gold-200 bg-gold-400/25'
                          : 'card-back border-gold-400/45'
                      }`}
                    >
                      <span className="font-display text-xs text-gold-200">{index + 1}</span>
                      <span className="px-1 text-center text-[0.45rem] uppercase leading-tight tracking-wider text-gold-100/50">
                        {pos.name.slice(0, 18)}
                      </span>
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* --- Guardar --- */}
          <div className="panel space-y-3 p-5">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-100"
              >
                {error}
              </motion.p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button fullWidth onClick={handleSaveAndUse}>
                Guardar y usar
              </Button>
              <Button fullWidth variant="outline" onClick={handleSave}>
                Sólo guardar
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                fullWidth
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadArchive(
                    buildArchive(
                      {
                        customDecks: [],
                        customSpreads: [buildSpread()],
                        history: [],
                        rituals: [],
                      },
                      { decks: false, readings: false, rituals: false },
                    ),
                  )
                }
                title="Descarga esta tirada como archivo JSON para guardarla como respaldo"
              >
                ⇩ Exportar esta tirada
              </Button>
              <Button fullWidth variant="ghost" size="sm" onClick={() => goTo('spread')}>
                ← Volver sin guardar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
