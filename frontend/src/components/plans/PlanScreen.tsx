import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RESOURCE_LABEL, RESOURCE_UNIT, usePlan } from '../../lib/usePlan';
import { api } from '../../services/api';
import type { LimitedResource, PlanTier } from '../../types';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   MI PLAN: qué tienes, cuánto usaste y cómo cambiar de plan.

   Lo que decide la pantalla: qué es gratis y qué es Pro. Y no es "las lecturas
   de más". Todo lo que hace que una lectura sirva es gratis para siempre —las
   78 cartas, las fichas, la interpretación, la fase lunar— porque cobrar por
   eso es cobrarle a alguien por la razón por la que vino.

   Lo que se cobra es el ACCESO: cuánto puede acumular y en qué formato se lo
   lleva. Un usuario free no lee menos cartas que uno Pro; sólo guarda menos
   cosas y no las exporta a PDF.

   Los tres planes dan lo mismo. No es una pantalla de "elige el tuyo": es una
   pantalla de cuánto quieres pagar por lo mismo. Por eso el anual y el de por
   vida tienen la misma lista de beneficios y sólo cambia el precio y el
   compromiso.
   ========================================================================== */

const RECURSOS: LimitedResource[] = ['readings', 'decks', 'spreads', 'rituals'];

const FECHA = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Lo que trae el Pro. Los tres planes dan todo esto.
 *
 * El PDF NO está en la lista, a propósito. Es la función por la que más gente
 * comparte una lectura, y compartir es de las pocas vías por las que alguien
 * se entera de que la app existe. Ponerla de pago frenaría justo eso, a cambio
 * de unos pesos: generar el archivo cuesta milisegundos y cero servidores, así
 * que detrás de la decisión no hay costo, sólo una decisión de producto.
 */
const BENEFICIOS = [
  { titulo: 'Lecturas sin tope', detalle: 'Gratis: 2 lecturas guardadas por semana.' },
  { titulo: 'Mazos y tiradas sin tope', detalle: 'Gratis: 1 mazo y 2 tiradas.' },
  { titulo: 'Rituales sin tope', detalle: 'Gratis: 3 rituales.' },
  { titulo: 'Todo en la nube', detalle: 'Tus lecturas en todos tus dispositivos.' },
  { titulo: 'Sin avisos de promoción', detalle: 'Nada de banners en la app.' },
];

/** Cómo se llama y qué promete cada plan. */
const PLANES: Record<PlanTier, { nombre: string; nota: string }> = {
  monthly: {
    nombre: 'Mensual',
    nota: 'Se renueva cada mes. Puedes cancelar cuando quieras.',
  },
  annual: {
    nombre: 'Anual',
    nota: 'Un año por menos que doce meses sueltos.',
  },
  lifetime: {
    nombre: 'De por vida',
    nota: 'Un solo pago. No se renueva nunca y no hay nada que cancelar.',
  },
};

/** Lo que ofrece el backend, con los precios leídos de Stripe. */
interface Oferta {
  tier: PlanTier;
  amount: number | null;
  currency: string | null;
  interval: 'month' | 'year' | null;
  trialDays: number | null;
  disponible: boolean;
}

const FECHAS = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * El precio, formateado.
 *
 * Viene de Stripe en la unidad mínima (centavos), así que hay que dividir por
 * 100. Si no se pudo leer el precio, se dice que no se pudo en vez de mostrar
 * un 0: un "$0"would fåä equivocado.
 */
function formatearPrecio(oferta: Oferta): { texto: string; unavailable: boolean } {
  if (oferta.amount === null || !oferta.currency) {
    return { texto: 'Precio no disponible', unavailable: true };
  }
  const valor = oferta.amount / 100;
  try {
    return {
      texto: new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: oferta.currency.toUpperCase(),
        maximumFractionDigits: valor % 1 === 0 ? 0 : 2,
      }).format(valor),
      unavailable: false,
    };
  } catch {
    /* Una moneda que el navegador no conoce no debe romper la pantalla. */
    return { texto: `${oferta.currency.toUpperCase()} ${valor}`, unavailable: false };
  }
}

export default function PlanScreen() {
  const {
    isPro,
    isLifetime,
    tier,
    limits,
    usage,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    noConfigurado,
    proximaLectura,
    loading,
    progress,
    subscribe,
    manage,
  } = usePlan();

  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<PlanTier | null>(null);

  /* Los precios se piden por separado y en paralelo con el resto de la
     pantalla: la barra de uso puede pintar sin esperar a Stripe, y el catálogo
     llega después. La pantalla no queda en blanco esperando. */
  useEffect(() => {
    if (noConfigurado) return;
    let vigente = true;
    api
      .get<Oferta[]>('/billing/plans')
      .then((data) => {
        if (vigente) setOfertas(data);
      })
      .catch(() => {
        if (vigente) setOfertas([]);
      });
    return () => {
      vigente = false;
    };
  }, [noConfigurado]);

  const alElegir = async (elegido: PlanTier) => {
    setOcupado(elegido);
    setMensaje(null);
    const r = await subscribe(elegido);
    if (r === 'de-por-vida') {
      setMensaje('Ya tienes el Pro de por vida. No hay nada más que pagar.');
    } else if (r === 'ya-pro') {
      setMensaje('Ya eres Pro. Te llevamos a la gestión de la suscripción.');
      await manage();
    } else if (r === 'error') {
      setMensaje('No pudimos abrir el pago. Prueba de nuevo en un momento.');
    }
    setOcupado(null);
  };

  /* El uso del plan, con sus topes. Va en las dos versiones de la pantalla:
     los topes del plan gratuito se aplican aunque el pago no esté habilitado. */
  const seccionUso =
    limits && usage ? (
        <section className="panel gilded p-5">
          <h3 className="overline mb-4">Tu uso</h3>
          <div className="space-y-3.5">
            {RECURSOS.map((recurso) => {
              const usado = usage[recurso];
              const max = limits[recurso];
              const p = progress(recurso);
              const sinTope = !Number.isFinite(max);
              const lleno = !sinTope && usado >= max;
              /* Aviso recién al 80%: una barra en rojo al segundo guardado
                 sería invasivo. */
              const casi = p !== null && p >= 0.8;

              return (
                <div key={recurso}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-gold-100/70">{RESOURCE_LABEL[recurso]}</span>
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
                        lleno ? 'bg-rose-400/70' : casi ? 'bg-amber-300/70' : 'bg-gold-400/55'
                      }`}
                    />
                  </div>
                  {lleno && (
                    <p className="mt-1 text-[0.62rem] text-rose-200/70">
                      {recurso === 'readings' && proximaLectura
                        ? `Ya guardaste las de esta semana. Puedes guardar otra el ${FECHA.format(proximaLectura)}.`
                        : `Llegaste al límite de ${RESOURCE_UNIT[recurso]} del plan gratuito.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
    ) : null;

  /* Stripe no configurado: no hay Pro que contratar todavía. Decirlo es mejor
     que mostrar planes que van a fallar, pero el plan gratuito tiene topes
     igual, y se muestran. */
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
            Leer no tiene límite. Lo que tiene tope es lo que se guarda: 2 lecturas por semana,{' '}
            {limits?.decks ?? 1} mazo propio, {limits?.spreads ?? 2} tiradas personalizadas y{' '}
            {limits?.rituals ?? 3} rituales. El plan Pro, sin topes, va a estar disponible pronto.
          </p>
        </div>
        {seccionUso}
      </div>
    );
  }

  /* Los planes que se ofrecen son los que el backend pudo leer. Un plan sin
     precio no se muestra: es mejor una lista de dos que una de tres con un
     hueco. */
  const disponibles = (ofertas ?? []).filter((o) => o.disponible);

  return (
    <div className="space-y-9">
      <SectionHeading
        overline="Cuenta"
        title="Tu plan"
        subtitle="Qué tienes guardado y hasta dónde llegas. Tus mazos, tiradas y lecturas se sincronizan entre todos tus dispositivos."
      />

      {/* ---------------- Plan actual ---------------- */}
      <section className="panel gilded overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-2xl text-gold-gradient">
                {isPro ? 'Pro' : 'Gratis'}
              </h2>
              {isPro && tier && (
                <span className="rounded-full border border-gold-400/25 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] text-gold-200/80">
                  {PLANES[tier].nombre}
                </span>
              )}
              {isPro && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.14em] ${
                    status === 'active'
                      ? 'bg-emerald-400/15 text-emerald-200/90'
                      : 'bg-amber-400/20 text-amber-200/90'
                  }`}
                >
                  {status === 'trialing'
                    ? 'Período de prueba'
                    : status === 'past_due'
                      ? 'Pago pendiente'
                      : 'Activo'}
                </span>
              )}
            </div>

            {isLifetime && (
              <p className="mt-2 text-xs leading-relaxed text-gold-100/55">
                Pagaste una vez. No se renueva nunca y no hay nada que cancelar: conservas
                todo lo que guardaste, para siempre.
              </p>
            )}
            {isPro && !isLifetime && currentPeriodEnd && (
              <p className="mt-2 text-xs leading-relaxed text-gold-100/55">
                {cancelAtPeriodEnd ? (
                  <>
                    Tienes Pro hasta el {FECHAS.format(new Date(currentPeriodEnd))}. Después
                    vuelve al plan gratuito y conservas todo lo que guardaste.
                  </>
                ) : status === 'trialing' ? (
                  <>
                    Tu prueba termina el {FECHAS.format(new Date(currentPeriodEnd))}. Después
                    se cobra el plan {tier ? PLANES[tier].nombre.toLowerCase() : ''} y sigues
                    con Pro.
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

          {isPro && !isLifetime && (
            <div className="shrink-0 sm:w-48">
              <Button variant="outline" fullWidth onClick={() => void manage()}>
                Gestionar suscripción
              </Button>
            </div>
          )}
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
      {seccionUso}

      {/* ---------------- Los tres planes ---------------- */}
      {!isPro && (
        <section className="space-y-4">
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            El Pro, como lo prefieras
          </h3>

          {disponibles.length === 0 && ofertas !== null ? (
            <div className="panel gilded p-5 text-center">
              <p className="text-xs text-gold-100/60">
                No pudimos leer los precios desde el servidor. Prueba de nuevo en un momento.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {(disponibles.length ? disponibles : []).map((oferta, i) => {
                const { texto, unavailable } = formatearPrecio(oferta);
                const porMes =
                  oferta.interval === 'year' && oferta.amount !== null
                    ? ` ~ ${new Intl.NumberFormat('es-PE', {
                        style: 'currency',
                        currency: (oferta.currency ?? 'USD').toUpperCase(),
                        maximumFractionDigits: 0,
                      }).format(oferta.amount / 100 / 12)} al mes`
                    : '';

                return (
                  <motion.button
                    key={oferta.tier}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    disabled={ocupado !== null || unavailable || loading}
                    onClick={() => void alElegir(oferta.tier)}
                    className="panel gilded flex flex-col items-start gap-1 p-4 text-left transition-colors hover:border-gold-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="font-display text-sm uppercase tracking-[0.16em] text-gold-200/85">
                      {PLANES[oferta.tier].nombre}
                    </span>
                    <span className="font-display text-2xl text-gold-gradient">
                      {ocupado === oferta.tier ? 'Abriendo…' : texto}
                    </span>
                    {oferta.interval === 'year' && porMes && (
                      <span className="text-[0.6rem] text-gold-100/40">{porMes}</span>
                    )}
                    {oferta.trialDays != null && oferta.trialDays > 0 && (
                      <span className="mt-0.5 text-[0.6rem] text-emerald-200/70">
                        {oferta.trialDays} días de prueba
                      </span>
                    )}
                    <span className="mt-1 text-[0.65rem] leading-relaxed text-gold-100/45">
                      {PLANES[oferta.tier].nota}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          )}

          <p className="px-1 text-[0.65rem] leading-relaxed text-gold-100/35">
            Los tres planes dan exactamente lo mismo. Cambia cuánto pagas y cada cuánto: el
            de por vida no se renueva nunca. Cancelas cuando quieras desde la gestión, y al
            bajar a gratuito conservas todo lo que guardaste: sólo dejas de crear cosas nuevas.
          </p>
        </section>
      )}

      {/* ---------------- Qué trae el Pro ---------------- */}
      {!isPro && (
        <section className="space-y-3">
          <h3 className="font-display text-xs uppercase tracking-[0.24em] text-gold-200/80">
            Qué incluye
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
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-gold-100/45">{b.detalle}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
