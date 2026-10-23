import { useMemo } from 'react';
import { edadLunar, iluminacionEn, lunaDelDia, proximaFasePrincipal } from '@arcana/tarot-core';
import MoonDisc from '../cards/MoonDisc';
import Button from '../ui/Button';
import {
  FECHA_LARGA,
  horaAprox,
  Icono,
  diasEntre,
  primeraMayuscula,
  relativo,
  useAhora,
  zonaHoraria,
} from './lunaUi';

/* ==========================================================================
   La Luna de hoy: la tarjeta protagonista de la pantalla.

   QUÉ ES DATO Y QUÉ NO. Arriba van los datos astronómicos (nombre de la fase
   del día, iluminación y edad en este momento, próxima fase principal) y la
   descripción de lo que pasa en el cielo. La lectura simbólica va aparte,
   con su propio rótulo: no es un dato, es una sugerencia de la tradición, y
   no tiene que poder confundirse con uno.

   PRECISIÓN: la hora de la próxima fase sale de la serie de Meeus con ΔT, a
   menos de un minuto de lo publicado. Se muestra al minuto y como
   aproximada; nunca segundos.
   ========================================================================== */

interface Props {
  onAnotar: () => void;
  onVerCalendario: () => void;
}

export default function FaseActual({ onAnotar, onVerCalendario }: Props) {
  const ahora = useAhora();
  /* Se recalcula por minuto, que es la resolución de lo que se muestra. */
  const minuto = Math.floor(ahora.getTime() / 60000);

  const datos = useMemo(() => {
    const instante = new Date(minuto * 60000);
    const dia = lunaDelDia(instante);
    const luz = iluminacionEn(instante);
    const prox = proximaFasePrincipal(instante);
    return {
      instante,
      dia,
      luz,
      edad: edadLunar(instante),
      prox,
      faltan: diasEntre(instante, prox.date),
    };
  }, [minuto]);

  const { instante, dia, luz, edad, prox, faltan } = datos;
  const porcentaje = Math.round(luz.illumination * 100);
  const zona = zonaHoraria();

  return (
    <section aria-labelledby="fase-hoy-titulo" className="superficie overflow-hidden">
      {/* Halo muy suave detrás de la Luna: da profundidad sin competir. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-luna-300/[0.06] blur-3xl"
      />

      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[auto,1fr] md:items-center md:gap-10">
        <div className="flex justify-center">
          {/* El disco usa el MISMO estado que el texto: iluminación y ángulo
              de este minuto. */}
          <MoonDisc
            phase={{ ...luz, name: dia.name }}
            size={184}
            variant="engraved"
            glow
          />
        </div>

        <div className="min-w-0">
          <p className="overline">
            Hoy · {primeraMayuscula(FECHA_LARGA.format(instante))}
          </p>
          <h2 id="fase-hoy-titulo" className="mt-1.5 text-gold-gradient text-2xl sm:text-3xl">
            {dia.name}
          </h2>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="superficie-2 px-3.5 py-2.5">
              <dt className="overline">Iluminación</dt>
              <dd className="mt-0.5 font-display text-xl text-gold-100">
                {porcentaje}
                <span className="ml-0.5 text-sm text-gold-100/55">%</span>
              </dd>
            </div>
            <div className="superficie-2 px-3.5 py-2.5">
              <dt className="overline">Edad lunar</dt>
              <dd className="mt-0.5 font-display text-xl text-gold-100">
                {edad.toLocaleString('es-PE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
                <span className="ml-1 text-sm text-gold-100/55">días</span>
              </dd>
            </div>
          </dl>

          <p className="mt-4 max-w-prose text-sm leading-relaxed text-gold-100/75">{dia.descripcion}</p>

          {/* La lectura simbólica, separada de los datos. */}
          <figure className="mt-4 max-w-prose border-l-2 border-luna-400/40 pl-3.5">
            <figcaption className="overline">
              Lectura simbólica
            </figcaption>
            <p className="mt-1 text-[0.95rem] italic leading-relaxed text-gold-100/90">{dia.note}</p>
          </figure>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5 text-sm text-gold-100/55">
            <Icono nombre="reloj" className="h-4 w-4 self-center text-gold-100/40" />
            <span>Próxima fase principal:</span>
            <span className="text-gold-100">{prox.name}</span>
            <span>
              · {FECHA_LARGA.format(prox.date)}, {horaAprox(prox.date)}
            </span>
            <span className="text-gold-100/40">({relativo(faltan)})</span>
          </p>
          <p className="mt-1 text-xs text-gold-100/40">
            Hora local aproximada al minuto ({zona}).
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button size="sm" onClick={onAnotar} icon={<Icono nombre="mas" className="h-3.5 w-3.5" />}>
              Anotar ritual
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onVerCalendario}
              icon={<Icono nombre="calendario" className="h-3.5 w-3.5" />}
            >
              Ver calendario
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
