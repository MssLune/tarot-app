import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { festivalsOf, nearestFestival, type Festival } from '@arcana/tarot-core';


/* ==========================================================================
   Las festividades del año, con su explicación desplegable.

   La lista se CALCULA, no se busca en una tabla. Casi todas son fecha fija —el
   1 de febrero va a ser el 1 de febrero en 2031— y las cuatro que se mueven
   (equinoccios y solsticios) salen de la longitud solar. Por eso no hay nada
   que actualizar cada año: es la respuesta a la pregunta que hace esta
   pantalla, sin tener que escribirla en ningún lado.
   ========================================================================== */

const DIA_FORMAT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const DIA_LARGO = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Días entre hoy y la festividad, a partir de la medianoche local. */
function diasHasta(f: Festival, hoy: Date): number {
  return Math.round(
    (Date.UTC(f.date.getFullYear(), f.date.getMonth(), f.date.getDate()) -
      Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) /
      86400000,
  );
}

export default function FestivalList() {
  const hoy = useMemo(() => new Date(), []);
  const [abierto, setAbierto] = useState<string | null>(null);

  const lista = useMemo(() => festivalsOf(hoy.getFullYear()), [hoy]);
  const cercana = useMemo(() => nearestFestival(hoy, hoy.getFullYear()), [hoy]);

  return (
    <section>
      {/* Encabezado propio y no `SectionHeading`: ese centra el título con un
         `h2` grande y un subtítulo largo, que es lo que va bien arriba de
         una pantalla y mal en medio de una página que ya tiene su título. */}
      <header className="mb-4">
        <p className="overline mb-2">El año</p>
        <h3 className="font-display text-xl text-gold-gradient">Festividades</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gold-100/55">
          Las cuatro Hogueras, las cuatro estaciones y las dos noches que la tradición guarda aparte.
        </p>
      </header>

      <ul className="space-y-2">
        {lista.map((f) => {
          const dias = diasHasta(f, hoy);
          const esHoy = dias === 0;
          const abierta = abierto === f.id;

          return (
            <li key={f.id}>
              {/* El botón y no un div: con teclado se tiene que poder abrir y
                 cerrar, y `aria-expanded` es lo que anuncia el estado. */}
              <button
                type="button"
                onClick={() => setAbierto(abierta ? null : f.id)}
                aria-expanded={abierta}
                className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  esHoy
                    ? 'border-gold-300/60 bg-gold-400/[0.12]'
                    : cercana?.festival.id === f.id
                      ? 'border-gold-400/30 bg-gold-400/[0.05]'
                      : 'border-gold-400/12 bg-ink-950/40 hover:border-gold-400/30 hover:bg-ink-950/60'
                }`}
              >
                <div className="flex items-baseline gap-3">
                  {/* El día se mantiene en su propia columna: si se alineara
                      con el nombre, cada línea_botón cambiaría de largo y la
                      lista "respiraría" al desplegar. */}
                  <span className="w-12 shrink-0 font-display text-sm text-gold-200/80">
                    {DIA_FORMAT.format(f.date).replace('.', '')}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-display text-sm text-gold-100">{f.name}</span>
                      {f.granHoguera && (
                        <span className="rounded-full border border-gold-400/30 px-1.5 py-px text-[0.5rem] uppercase tracking-[0.14em] text-gold-200/70">
                          Hoguera
                        </span>
                      )}
                      {!f.fixed && (
                        <span
                          className="rounded-full border border-ink-400/25 px-1.5 py-px text-[0.5rem] uppercase tracking-[0.14em] text-gold-100/40"
                          title="La fecha sale del Sol, no de una fecha fija del calendario"
                        >
                          Solar
                        </span>
                      )}
                    </span>

                    <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-gold-100/55">
                      {f.resumen}
                    </span>
                  </span>

                  <span className="shrink-0 self-center text-gold-100/25" aria-hidden="true">
                    {abierta ? '−' : '+'}
                  </span>
                </div>

                {esHoy ? (
                  <span className="mt-1.5 block text-[0.6rem] uppercase tracking-[0.18em] text-gold-200">
                    Es hoy
                  </span>
                ) : (
                  dias > 0 && dias <= 30 && (
                    <span className="mt-1.5 block text-[0.6rem] text-gold-100/35">
                      en {dias} {dias === 1 ? 'día' : 'días'}
                    </span>
                  )
                )}
              </button>

              <AnimatePresence initial={false}>
                {abierta && (
                  <motion.div
                    key="detalle"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-14 mt-2 space-y-2 border-l border-gold-400/20 pl-3.5">
                      <p className="text-[0.72rem] leading-relaxed text-gold-100/70">{f.detalle}</p>
                      {f.altNames && f.altNames.length > 0 && (
                        <p className="text-[0.62rem] text-gold-100/35">
                          También: {f.altNames.join(', ')}
                        </p>
                      )}
                      <p className="text-[0.58rem] text-gold-100/25">
                        {DIA_LARGO.format(f.date)}
                        {f.fixed ? '' : ' · la fecha sale del Sol'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[0.6rem] leading-relaxed text-gold-100/30">
        Las fechas no se actualizan: se calculan. Las de las Hogueras son las
        tradicionales del calendario, no la mitad exacta entre dos estaciones.
      </p>
    </section>
  );
}