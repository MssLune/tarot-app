import Button from './Button';
import Glyph from './Glyph';
import { useReadingStore } from '../../store/useReadingStore';

/* ==========================================================================
   Invitación a iniciar sesión.

   Ocupa el lugar de lo que necesita cuenta (el historial, los rituales) en
   modo invitado. No es un muro: el resto de la app sigue a un clic, y el
   texto dice qué se gana, no que algo está prohibido.
   ========================================================================== */

export default function InvitacionCuenta({
  titulo,
  texto,
  glifo = '☾',
  compacta = false,
}: {
  titulo: string;
  texto: string;
  glifo?: string;
  /** Versión en línea, para dentro de una pantalla que sí se ve. */
  compacta?: boolean;
}) {
  const pedirCuenta = useReadingStore((s) => s.pedirCuenta);

  return (
    <section
      className={`panel gilded mx-auto flex max-w-xl flex-col items-center text-center ${
        compacta ? 'gap-3 px-5 py-6' : 'gap-4 px-6 py-10'
      }`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-gold-300/40 bg-ink-950/70 text-xl text-gold-gradient">
        <Glyph>{glifo}</Glyph>
      </span>
      <h2 className={`text-gold-gradient ${compacta ? 'text-lg' : 'text-2xl'}`}>{titulo}</h2>
      <p className="max-w-md text-sm leading-relaxed text-gold-100/55">{texto}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={() => pedirCuenta(null, { modo: 'sign-in' })}>
          Iniciar sesión
        </Button>
        <Button size="sm" variant="outline" onClick={() => pedirCuenta(null, { modo: 'sign-up' })}>
          Crear cuenta
        </Button>
      </div>
    </section>
  );
}
