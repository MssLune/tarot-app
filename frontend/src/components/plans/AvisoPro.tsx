import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePlan } from '../../lib/usePlan';
import { useReadingStore } from '../../store/useReadingStore';
import type { LimitedResource } from '../../types';
import Button from '../ui/Button';

/* ==========================================================================
   "Pasa al Pro": la ventana que aparece cuando el plan gratuito no deja
   guardar algo.

   La barra del plan ya avisa del tope, pero una franja fina arriba no
   alcanza en el momento en que la persona toca "Guardar" y no pasa nada:
   hay que decirle, ahí mismo, qué pasó, cuándo puede volver a guardar y qué
   le daría el Pro. Se abre desde el store (`abrirAvisoPro`), ya sea porque la
   pantalla sabía que estaba en el tope o porque el servidor respondió 402.

   No empuja al pago: lleva a "Tu plan", donde están los precios.
   ========================================================================== */

const QUE_PASO: Record<LimitedResource, string> = {
  readings: 'La lectura no se guardó en tu historial, pero sigue en pantalla: puedes copiarla o descargarla en PDF, que es gratis.',
  decks: 'El mazo no se guardó en tu cuenta.',
  spreads: 'La tirada no se guardó en tu cuenta.',
  rituals: 'El ritual no se guardó en tu cuenta.',
};

export default function AvisoPro() {
  const aviso = useReadingStore((s) => s.avisoPro);
  const cerrar = useReadingStore((s) => s.cerrarAvisoPro);
  const goTo = useReadingStore((s) => s.goTo);
  const { isPro, isAdmin, noConfigurado, limits } = usePlan();
  const reducir = useReducedMotion();
  const boton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aviso) return;
    const previo = document.activeElement as HTMLElement | null;
    boton.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', f);
    return () => {
      window.removeEventListener('keydown', f);
      previo?.focus?.();
    };
  }, [aviso, cerrar]);

  /* Un Pro no debería ver esto nunca; si el servidor lo rechazó igual, el
     mensaje de la barra alcanza. */
  const visible = !!aviso && !isPro && !isAdmin;

  const beneficios = [
    `Lecturas guardadas sin tope (gratis: ${limits?.readings ?? 2} por semana)`,
    `Mazos y tiradas propias sin tope (gratis: ${limits?.decks ?? 1} mazo y ${limits?.spreads ?? 2} tiradas)`,
    `Rituales sin tope (gratis: ${limits?.rituals ?? 3})`,
  ];

  return (
    <AnimatePresence>
      {visible && aviso && (
        <motion.div
          key="aviso-pro"
          initial={reducir ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={cerrar}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="aviso-pro-titulo"
            aria-describedby="aviso-pro-mensaje"
            initial={reducir ? false : { y: 24, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducir ? undefined : { y: 24, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="panel gilded w-full max-w-md rounded-b-none p-6 sm:rounded-3xl"
          >
            <p className="overline">Plan gratuito</p>
            <h2 id="aviso-pro-titulo" className="mt-2 text-xl text-gold-gradient">
              Llegaste al tope de tu plan
            </h2>
            <p id="aviso-pro-mensaje" className="mt-3 text-sm leading-relaxed text-gold-100/80">
              {aviso.message}
            </p>
            {aviso.recurso && (
              <p className="mt-2 text-sm leading-relaxed text-gold-100/60">{QUE_PASO[aviso.recurso]}</p>
            )}

            <div className="mt-5 rounded-2xl border border-gold-400/20 bg-ink-950/50 p-4">
              <p className="font-display text-xs uppercase tracking-[0.18em] text-gold-200">Con el Pro</p>
              <ul className="mt-2 space-y-1.5 text-sm text-gold-100/75">
                {beneficios.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-300" />
                    {b}
                  </li>
                ))}
              </ul>
              {noConfigurado && (
                <p className="mt-3 text-xs text-gold-100/50">El plan Pro va a estar disponible pronto.</p>
              )}
            </div>

            <div ref={boton} className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <Button
                fullWidth
                onClick={() => {
                  cerrar();
                  goTo('plan');
                }}
              >
                {noConfigurado ? 'Ver los planes' : 'Pasar al Pro'}
              </Button>
              <Button fullWidth variant="ghost" onClick={cerrar}>
                Ahora no
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
