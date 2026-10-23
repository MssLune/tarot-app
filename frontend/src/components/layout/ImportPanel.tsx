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
        setError('El archivo no contiene mazos, tiradas ni lecturas.');
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

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      ) : preview ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gold-100/70">
            El archivo contiene {preview.total} elemento(s). Lo que ya tengas guardado con el mismo
            id se conserva y no se duplica.
          </p>
          <ul className="space-y-1 text-[0.68rem] text-gold-100/50">
            <li>· Mazos: {preview.decks}</li>
            <li>· Tiradas: {preview.spreads}</li>
            <li>· Lecturas: {preview.readings}</li>
            <li>· Rituales: {preview.rituals}</li>
          </ul>
          {/* Un respaldo v1 no trae rituales. Decirlo es mejor que mostrar un 0
              que el usuario no sabe interpretar. */}
          {preview.rituals === 0 && preview.total > 0 && (
            <p className="text-[0.62rem] leading-relaxed text-gold-100/35">
              Este archivo no incluye rituales: es un respaldo anterior a que existieran.
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleConfirm} disabled={busy}>
              {busy ? 'Importando…' : 'Importar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-gold-100/60">
            Elige un archivo <code className="text-gold-200/80">.json</code> exportado desde Arcana.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => inputRef.current?.click()}>
              Elegir archivo
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
