import { usePlan } from '../../lib/usePlan';
import { useReadingStore } from '../../store/useReadingStore';

/* ==========================================================================
   Barra del plan gratuito.

   SIEMPRE VISIBLE para quien tiene sesión y está en el plan gratuito: dice en
   qué plan está, cuánto lleva de su tope semanal y cómo pasar al Pro. No se
   puede cerrar, a propósito: el tope tiene que verse ANTES de chocar con él,
   no recién cuando el servidor rechaza un guardado.

   Es una franja fina y en los colores de la app, no un cartel de alerta. Sólo
   cambia a ámbar cuando de verdad hay algo que avisar: llegó al tope de la
   semana, o el servidor acaba de rechazar algo (un mazo, una tirada) por el
   plan.

   El botón no abre el pago: lleva a "Tu plan", donde están los tres planes
   con su precio. Mandar directo al checkout sería empujar a comprar algo sin
   haber dicho cuánto cuesta.

   Los invitados (sin sesión) no la ven: no tienen plan, y nada de lo que
   hacen se guarda. Los Pro tampoco.
   ========================================================================== */

const FECHA = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

export default function LimitBanner() {
  const { isPro, cargado, limits, usage, proximaLectura, notice, dismissNotice } = usePlan();
  const goTo = useReadingStore((s) => s.goTo);
  const screen = useReadingStore((s) => s.screen);

  if (!cargado || isPro || !limits || !usage) return null;

  const max = limits.readings;
  const usadas = usage.readings;
  const lleno = usadas >= max;
  const aviso = notice?.message ?? null;
  const ambar = lleno || aviso !== null;

  let texto: string;
  if (aviso) {
    texto = aviso;
  } else if (lleno) {
    texto = proximaLectura
      ? `Ya guardaste tus ${max} lecturas de esta semana. Puedes guardar otra el ${FECHA.format(proximaLectura)}.`
      : `Ya guardaste tus ${max} lecturas de esta semana.`;
  } else {
    texto = `Lecturas guardadas esta semana: ${usadas} de ${max}.`;
  }

  return (
    <div
      className={`border-b ${
        ambar ? 'border-amber-400/20 bg-amber-500/[0.07]' : 'border-gold-400/10 bg-ink-900/60'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 font-display text-[0.55rem] uppercase tracking-[0.2em] ${
            ambar ? 'border-amber-300/30 text-amber-200/90' : 'border-gold-400/25 text-gold-200/80'
          }`}
        >
          Plan gratuito
        </span>
        <p className="min-w-0 flex-1 text-[0.7rem] leading-snug text-gold-100/70 sm:text-xs">
          {texto}
        </p>
        {/* Sólo el aviso de un rechazo puntual se puede cerrar; la barra no. */}
        {aviso && (
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Cerrar aviso"
            className="shrink-0 px-1 text-sm text-gold-100/40 transition-colors hover:text-gold-100"
          >
            ×
          </button>
        )}
        {screen !== 'plan' && (
          <button
            type="button"
            onClick={() => goTo('plan')}
            className="shrink-0 whitespace-nowrap rounded-full border border-gold-300/50 px-3 py-1 font-display text-[0.6rem] uppercase tracking-[0.18em] text-gold-200 transition-colors hover:bg-gold-400/15 hover:text-gold-100 sm:text-[0.65rem]"
          >
            Pasar al Pro
          </button>
        )}
      </div>
    </div>
  );
}
