import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { buildArchive, downloadArchive, nombreDeArchivo } from '../../lib/archive';
import { useReadingStore } from '../../store/useReadingStore';
import Button from '../ui/Button';
import ImportPanel from './ImportPanel';

/* ==========================================================================
   Tus datos: exportar e importar el respaldo de la cuenta.

   Se abre desde el menú de cuenta. Antes vivía en la pantalla de Mazos, y su
   «Exportar todo» descargaba también el historial y los rituales: no tenía
   sentido ahí. Ahora se elige qué incluir, y el archivo se llama según lo que
   lleva (`arcana-respaldo-…`, `arcana-lecturas-…`).

   Se dibuja con un portal en <body>. El menú de cuenta vive dentro del
   encabezado, que tiene `backdrop-blur`, y un `position: fixed` adentro de un
   elemento con filtro queda atrapado en él: la ventana salía metida en la
   franja del encabezado, sin el fondo oscuro sobre la página.
   ========================================================================== */

export type ModoDatos = 'exportar' | 'importar';

type Clave = 'decks' | 'spreads' | 'readings' | 'rituals';

const ETIQUETAS: Record<Clave, string> = {
  decks: 'Mazos propios',
  spreads: 'Tiradas propias',
  readings: 'Lecturas del historial',
  rituals: 'Rituales',
};

/** «1 mazo», «3 lecturas»… para el resumen de lo importado. */
const CONTAR: Record<Clave, [string, string]> = {
  decks: ['mazo', 'mazos'],
  spreads: ['tirada', 'tiradas'],
  readings: ['lectura', 'lecturas'],
  rituals: ['ritual', 'rituales'],
};
const contar = (k: Clave, n: number) => `${n} ${CONTAR[k][n === 1 ? 0 : 1]}`;

export default function DatosDialog({ modo, onCerrar }: { modo: ModoDatos; onCerrar: () => void }) {
  const customDecks = useReadingStore((s) => s.customDecks);
  const customSpreads = useReadingStore((s) => s.customSpreads);
  const history = useReadingStore((s) => s.history);
  const rituals = useReadingStore((s) => s.rituals);

  const [pestana, setPestana] = useState<ModoDatos>(modo);
  const [elegidos, setElegidos] = useState<Record<Clave, boolean>>({
    decks: true,
    spreads: true,
    readings: true,
    rituals: true,
  });
  const [resultado, setResultado] = useState<Record<Clave, number> | null>(null);
  const ventana = useRef<HTMLDivElement>(null);

  /* Escape cierra; la página de atrás no se desplaza mientras la ventana está
     abierta; el foco entra a la ventana y vuelve a donde estaba al cerrar. */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', f);
    const previo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ventana.current?.focus();
    return () => {
      window.removeEventListener('keydown', f);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, [onCerrar]);

  const cantidades: Record<Clave, number> = {
    decks: customDecks.length,
    spreads: customSpreads.length,
    readings: history.length,
    rituals: rituals.length,
  };

  const archivo = buildArchive(
    { customDecks, customSpreads, history, rituals },
    { decks: elegidos.decks, spreads: elegidos.spreads, readings: elegidos.readings, rituals: elegidos.rituals },
  );
  const total =
    archivo.decks.length + archivo.spreads.length + archivo.readings.length + archivo.rituals.length;

  const importados = resultado
    ? (Object.keys(ETIQUETAS) as Clave[]).filter((k) => resultado[k] > 0)
    : [];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <motion.div
        ref={ventana}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="datos-titulo"
        initial={{ y: 24, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
        className="panel gilded max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none sm:max-w-md sm:rounded-3xl sm:p-6"
      >
          {/* Asa de la hoja en el celular */}
          <div aria-hidden="true" className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-gold-100/15 sm:hidden" />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="overline">Tu cuenta</p>
              <h2 id="datos-titulo" className="mt-1 text-xl text-gold-gradient">
                Tus datos
              </h2>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="rounded-full px-2 py-1 text-gold-100/50 transition-colors hover:text-gold-100"
            >
              ✕
            </button>
          </div>

          {/* Pestañas */}
          <div className="mb-5 flex gap-1 rounded-full border border-gold-400/20 bg-ink-900/60 p-1">
            {(['exportar', 'importar'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPestana(p)}
                aria-pressed={pestana === p}
                className={`flex-1 rounded-full px-4 py-2 font-display text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                  pestana === p ? 'bg-gold-sheen text-ink-900' : 'text-gold-100/55 hover:text-gold-100'
                }`}
              >
                {p === 'exportar' ? 'Exportar' : 'Importar'}
              </button>
            ))}
          </div>

          {pestana === 'exportar' ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-gold-100/60">
                Descarga una copia en un archivo JSON. Sirve como respaldo o para pasar tus datos a otra
                cuenta con «Importar».
              </p>
              <fieldset className="space-y-2">
                <legend className="overline mb-2">Qué incluir</legend>
                {(Object.keys(ETIQUETAS) as Clave[]).map((k) => (
                  <label
                    key={k}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-gold-400/15 bg-ink-900/50 px-3.5 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={elegidos[k]}
                      onChange={(e) => setElegidos({ ...elegidos, [k]: e.target.checked })}
                      className="h-4 w-4 accent-gold-400"
                    />
                    <span className="flex-1 text-sm text-gold-100/85">{ETIQUETAS[k]}</span>
                    <span className="text-xs tabular-nums text-gold-100/45">{cantidades[k]}</span>
                  </label>
                ))}
              </fieldset>
              <p className="text-[0.65rem] text-gold-100/40">
                {total > 0 ? `Archivo: ${nombreDeArchivo(archivo)}` : 'No hay nada para exportar con esa selección.'}
              </p>
              <Button fullWidth disabled={total === 0} onClick={() => downloadArchive(archivo)}>
                ⇩ Descargar
              </Button>
            </div>
          ) : resultado ? (
            <div className="space-y-4 text-center" role="status">
              <span
                aria-hidden="true"
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold-300/40 bg-gold-400/10 text-xl text-gold-200"
              >
                ✓
              </span>
              <p className="font-display text-sm uppercase tracking-[0.18em] text-gold-100">
                {importados.length ? 'Importación lista' : 'No había nada nuevo'}
              </p>
              {importados.length ? (
                <ul className="flex flex-wrap justify-center gap-2">
                  {importados.map((k) => (
                    <li
                      key={k}
                      className="rounded-full border border-gold-400/25 bg-ink-900/60 px-3 py-1 text-xs text-gold-100/85"
                    >
                      + {contar(k, resultado[k])}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs leading-relaxed text-gold-100/55">
                {importados.length
                  ? 'Lo que ya tenías en tu cuenta se conservó y no se duplicó.'
                  : 'Todo lo que trae el archivo ya estaba en tu cuenta.'}
              </p>
              <Button fullWidth variant="outline" onClick={onCerrar}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-gold-100/60">
                Elige un archivo exportado desde Arcana. Antes de importar vas a ver qué trae; lo que ya
                tienes no se duplica.
              </p>
              <ImportPanel onClose={onCerrar} onDone={(r) => setResultado(r)} />
            </div>
          )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
