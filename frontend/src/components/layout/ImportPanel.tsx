import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArchiveError, readArchiveFile, type ImportPreview } from '../../lib/archive';
import { useReadingStore } from '../../store/useReadingStore';
import Button from '../ui/Button';

/* ==========================================================================
   Panel de importación de un archivo de respaldo JSON.
   Muestra una vista previa antes de confirmar: importar es una acción que
   escribe en el archivo del usuario y no queremos que sea a ciegas.
   ========================================================================== */

interface Props {
  onClose: () => void;
  onDone: (result: {
    decks: number;
    spreads: number;
    readings: number;
    rituals: number;
  }) => void;
}

export default function ImportPanel({ onClose, onDone }: Props) {
  const importArchive = useReadingStore((s) => s.importArchive);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Guarda el archivo ya leído para no volver a pedirlo al confirmar. */
  const [pending, setPending] = useState<ImportPreview | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setPending(null);
    try {
      const result = await readArchiveFile(file);
      if (result.total === 0) {
        setError('El archivo no contiene mazos, tiradas, lecturas ni rituales.');
        return;
      }
      setPreview(result);
      setPending(result);
    } catch (err) {
      setError(err instanceof ArchiveError ? err.message : 'No se pudo leer el archivo.');
    }
  };

  const handleConfirm = () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = importArchive(pending.archive);
      onDone(result);
    } finally {
      setBusy(false);
    }
  };

  const elegir = () => inputRef.current?.click();

  const filas = preview
    ? ([
        ['Mazos', preview.decks],
        ['Tiradas', preview.spreads],
        ['Lecturas', preview.readings],
        ['Rituales', preview.rituals],
      ] as const)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 rounded-xl border border-gold-400/20 bg-ink-950/40 p-4"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          // Permite reelegir el mismo archivo si el usuario cambia de idea.
          e.target.value = '';
        }}
      />

      {preview ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gold-100/70">
            El archivo trae {preview.total} {preview.total === 1 ? 'elemento' : 'elementos'}:
          </p>
          {/* Dos columnas también en el celular: son cuatro números cortos. */}
          <ul className="grid grid-cols-2 gap-2">
            {filas.map(([etiqueta, n]) => (
              <li
                key={etiqueta}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                  n > 0
                    ? 'border-gold-400/25 bg-ink-900/60 text-gold-100/85'
                    : 'border-gold-400/10 text-gold-100/35'
                }`}
              >
                <span>{etiqueta}</span>
                <span className="font-display tabular-nums text-sm">{n}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.68rem] leading-relaxed text-gold-100/45">
            Lo que ya tengas guardado con el mismo id se conserva y no se duplica.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" className="sm:flex-1" fullWidth onClick={handleConfirm} disabled={busy}>
              {busy ? 'Importando…' : 'Importar'}
            </Button>
            <Button size="sm" variant="ghost" fullWidth className="sm:w-auto" onClick={elegir}>
              Otro archivo
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error ? (
            <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {error}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-gold-100/60">
              Elige un archivo <code className="text-gold-200/80">.json</code> exportado desde Arcana.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" className="sm:flex-1" fullWidth onClick={elegir}>
              {error ? 'Elegir otro archivo' : 'Elegir archivo'}
            </Button>
            <Button size="sm" variant="ghost" fullWidth className="sm:w-auto" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
