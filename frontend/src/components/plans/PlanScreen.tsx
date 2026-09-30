import { useState } from 'react';
import { motion } from 'framer-motion';
import { RESOURCE_LABEL, RESOURCE_UNIT, usePlan } from '../../lib/usePlan';
import type { LimitedResource } from '../../types';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   MI PLAN: qué tenés, cuánto usaste y cómo cambiar de plan.

   Lo que decide la pantalla: qué es gratis y qué es Pro. Y no es "las lecturas
   de más". Todo lo que hace que una lectura sirva es gratis para siempre —las
   78 cartas, las fichas, la interpretación, la fase lunar— porque cobrar por
   eso es cobrarle a alguien por la razón por la que vino.

   Lo que se cobra es el ACESO: cuánto puede acumular y en qué formato se lo
   lleva. Un usuario free no lee menos cartas que uno Pro; sólo guarda menos
   cosas y no las exporta a PDF.
   ========================================================================== */

const RECURSOS: LimitedResource[] = ['readings', 'decks', 'spreads', 'rituals'];

/** Beneficios del Pro. Cada punto corresponde a algo que el backend aplica. */
const BENEFICIOS = [
  { titulo: 'Lecturas sin tope', detalle: 'El plan gratuito guarda 20.' },
  { titulo: 'Mazos y tiradas sin tope', detalle: 'Gratis: 2 mazos y 3 tiradas.' },
  { titulo: 'Rituales sin tope', detalle: 'Gratis: 5 rituales.' },
  { titulo: 'Exportar a PDF', detalle: 'Llevá la lectura en un archivo.' },
  { titulo: 'Sin avisos de promoción', detalle: 'Nada de banners en la app.' },
];

const FECHAS = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function PlanScreen() {
  const {
    isPro,
    limits,
    usage,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    noConfigurado,
    loading,
    progress,
    subscribe,
    manage,
  } = usePlan();

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const alSuscribirse = async () => {
    setOcupado(true);
    setMensaje(null);
    const r = await subscribe();
    if (r === 'ya-pro') {
      setMensaje('Ya sos Pro. Te llevamos a la gestión de la suscripción.');
      await manage();
    } else if (r === 'error') {
      setMensaje('No pudimos abrir el pago. Probá de nuevo en un momento.');
    }
    setOcupado(false);
  };

  /* Stripe no configurado: no hay nada que vender todavía. Decirlo es mejor
     que mostrar una pantalla de pago que va a fallar. */
  if (noConfigurado) {
    return (
      <div className="space-y-9">
        <SectionHeading
          overline="Cuenta"
          title="Tu plan"
          subtitle="La información de tu cuenta y qué se sincroniza entre dispositivos."
        />
        <div className="panel gilded p-6 text-center">
          <p className="text-sm text-gold-100/80">Estás en el plan gratuito</p>
          <p className="mt-2 text-xs leading-relaxed text-gold-100/45">
            El pago no está habilitado en este entorno, así que no hay nada que contratar
            por ahora. Todo lo de la app funciona igual.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      <SectionHeading
        overline="Cuenta"
        title="Tu plan"
        subtitle="Qué tenés guardado y hasta dónde llegás. Tus mazos, tiradas y lecturas se sincronizan entre todos tus dispositivos."
      />

      {/* ---------------- Plan actual ---------------- */}
      <section className="panel gilded overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-2xl text-gold-gradient">
                {isPro ? 'Pro' : 'Gratis'}
              </h2>
              {isPro && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] ${
                    status === 'active'
                      ? 'bg-emerald-400/15 text-emerald-200/90'
                      : 'bg-amber-400/20 text-amber-200/90'
                  }`}
                >
                  {status === 'trialing' ? 'Período de prueba' : status === 'past_due' ? 'Pago pendiente' : 'Activo'}
                </span>
              )}
            </div>

            {isPro && currentPeriodEnd && (
              <p className="mt-2 text-xs leading-relaxed text-gold-100/55">
                {cancelAtPeriodEnd ? (
                  <>
                    Tenés Pro hasta el {FECHAS.format(new Date(currentPeriodEnd))}. Después
                    vuelve al plan gratuito y conservás todo lo que guardaste.
                  </>
                ) : (
                  <>Se renueva el {FECHAS.format(new Date(currentPeriodEnd))}.</>
                )}
              </p>
            )}
            {!isPro && (
              <p className="mt-2 text-xs leading-relaxed text-gold-100/55">
                Las 78 cartas, las fichas y la fase lunar son gratis siempre. El Pro es para
                guardar más cosas y llevártelas en PDF.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:w-48">
            {isPro ? (
              <Button variant="outline" fullWidth disabled={ocupado} onClick={() => void manage()}>
                Gestionar suscripción
              </Button>
            ) : (
              <Button fullWidth disabled={ocupado || loading} onClick={() => void alSuscribirse()}>
                {ocupado ? 'Abriendo…' : 'Pasar al Pro'}
              </Button>
            )}
          </div>
        </div>

        {mensaje && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-gold-400/15 px-5 py-3 text-xs text-gold-100/70"
          >
            {mensaje}
          </motion.p>
        )}
      </section>

      {/* ---------------- Uso ---------------- */}
      {limits && usage && (
        <section className="panel gilded p-5">
          <h3 className="overline mb-4">Lo que tenés guardado</h3>
          <div className="space-y-3.5">
            {RECURSOS.map((recurso) => {
              const usado = usage[recurso];
              const max = limits[recurso];
              const p = progress(recurso);
              const sinTope = !Number.isFinite(max);
              const lleno = !sinTope && usado >= max;
              /* Aviso recién al 80%: mostrar la barra en rojo al segundo
                 guardado sería invasivo. */
              const casi = p !== null && p >= 0.8;

              return (
                <div key={recurso}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-gold-100/70">
                      {RESOURCE_LABEL[recurso]}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${
                        lleno ? 'text-rose-200/90' : casi ? 'text-amber-200/80' : 'text-gold-100/45'
                      }`}
                    >
                      {usado}
                      {sinTope ? ' · sin tope' : ` de ${max}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-900/80">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: p ?? 1 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ transformOrigin: 'left' }}
                      className={`h-full rounded-full ${
                        lleno
                          ? 'bg-rose-400/70'
                          : casi
                            ? 'bg-amber-300/70'
                            : 'bg-gold-400/55'
                      }`}
                    />
                  </div>
                  {lleno && (
                    <p className="mt-1 text-[0.62rem] text-rose-200/70">
                      Llegaste al límite de {RESOURCE_UNIT[recurso]} del plan gratuito.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------------- Qué trae el Pro ---------------- */}
      {!isPro && (
        <section className="space-y-3">
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            Qué incluye el Pro
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {BENEFICIOS.map((b, i) => (
              <motion.div
                key={b.titulo}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="panel flex items-start gap-3 p-4"
              >
                <span className="mt-0.5 text-sm text-gold-300/80" aria-hidden="true">
                  ✦
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gold-100/85">{b.titulo}</p>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-gold-100/45">
                    {b.detalle}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="px-1 text-[0.65rem] leading-relaxed text-gold-100/35">
            Cancelás cuando quieras desde la gestión de la suscripción. Conservás todo lo que
            guardaste: al bajar a gratuito sólo dejás de crear cosas nuevas.
          </p>
        </section>
      )}
    </div>
  );
}
