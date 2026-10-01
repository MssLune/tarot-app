import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { RESOURCE_UNIT, usePlan } from '../../lib/usePlan';
import { useReadingStore } from '../../store/useReadingStore';
import type { LimitedResource } from '../../types';
import Button from '../ui/Button';

/* ==========================================================================
   Aviso de límite del plan gratuito.

   INVASIVIDAD, que es el requisito: no aparece siempre. Sólo cuando el
   usuario llegó al tope de algo, porque en ese momento sí le está estorbando.
   Un banner permanente arriba de la app sería tráfico de la versión de pago
   sobre el producto, y además entrena al usuario a ignorar los avisos.

   Se puede cerrar. Y si lo cerró, no vuelve a aparecer en esa sesión: no hay
   forma de que algo molesto se repita cada vez que cambia de pantalla.

   El botón NO abre el pago. Lleva a la pantalla de planes, donde hay tres
   opciones y se elige. Tirar al checkout desde un aviso sería empujar al
   usuario a comprar algo sin haberle dicho cuánto cuesta ni cuánto dura.
   ========================================================================== */

export default function LimitBanner() {
  const { isPro, atLimit, notice, dismissNotice } = usePlan();
  const goTo = useReadingStore((s) => s.goTo);
  /* `cerrado` es por sesión. Al recargar vuelve a poder mostrarse. */
  const [cerrado, setCerrado] = useState(false);

  if (isPro) return null;

  /* El backend rechazó una operación con 402. Es el aviso más importante: no
     es una predicción, es algo que acaba de pasar. */
  const mensajeAviso = notice?.message ?? null;

  const faltantes = (['readings', 'decks', 'spreads', 'rituals'] as LimitedResource[]).filter(
    atLimit,
  );

  if (cerrado) return null;
  if (!mensajeAviso && faltantes.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <div className="border-b border-amber-400/20 bg-amber-500/[0.07]">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
            <span className="shrink-0 text-sm text-amber-300/80" aria-hidden="true">
              ⚠
            </span>

            <p className="min-w-0 flex-1 text-xs leading-relaxed text-gold-100/75">
              {mensajeAviso ??
                `Llegaste al límite de ${
                  faltantes.length === 1
                    ? RESOURCE_UNIT[faltantes[0]!]
                    : 'varios recursos'
                } del plan gratuito.`}
            </p>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismissNotice();
                  goTo('plan');
                }}
              >
                Ver el Pro
              </Button>
              <button
                type="button"
                onClick={() => {
                  setCerrado(true);
                  dismissNotice();
                }}
                title="Cerrar aviso"
                aria-label="Cerrar aviso"
                className="rounded-full border border-gold-400/20 px-2 py-0.5 text-[0.6rem] text-gold-100/40 transition-colors hover:border-gold-400/45 hover:text-gold-100/80"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
