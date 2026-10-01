import { useEffect, useState } from 'react';
import { estadoLunar, type LunarEclipse } from '../../services/api';

/* ==========================================================================
   ¿Hoy es luna de sangre?

   "Luna de sangre" no es un nombre poético: es un eclipse TOTAL de Luna, y la
   diferencia con uno parcial es real. En el total la Luna entera entra en la
   umbra de la Tierra y se ve roja; en el parcial sólo se ve un pedazo rojo y el
   resto sigue iluminado. Por eso el dato que decide es si el eclipse trae
   duración de totalidad, no la magnitud ni el nombre del tipo.

   Los datos vienen del IMCCE y se cachean en el backend, así que abrir la
   pantalla no le pega a un observatorio francés. Si ese servicio no está, la
   pantalla no muestra nada de eclipsos — ni un error, ni un spinner eterno— y
   sigue mostrando la fase igual.
   ========================================================================== */

const FECHA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** "00:58:23" → "58 minutos", para no obligar a leer el reloj. */
function duracionLegible(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const horas = (h || 0) * 60 + (m || 0);
  if (horas <= 0) return null;
  if (horas < 60) return `${horas} minutos`;
  const resto = horas % 60;
  return resto === 0 ? `${horas / 60} horas` : `${Math.floor(horas / 60)} h ${resto} min`;
}

/** Etiqueta y color según el tipo, para que "total" no sea sólo una palabra. */
const ETIQUETA: Record<LunarEclipse['kind'], { nombre: string; nota: string; clase: string }> = {
  total: {
    nombre: 'Luna de sangre',
    nota: 'Eclipse total: la Luna entera entra en la umbra de la Tierra y se ve roja.',
    clase: 'border-rose-400/45 bg-rose-500/[0.12] text-rose-100',
  },
  parcial: {
    nombre: 'Eclipse parcial de Luna',
    nota: 'Una parte de la Luna entra en la umbra: se ve un sector rojo y el resto iluminado.',
    clase: 'border-gold-400/35 bg-gold-400/[0.08] text-gold-100',
  },
  penumbral: {
    nombre: 'Eclipse penumbral',
    nota: 'La Luna pasa por la penumbra, la sombra más suave: apenas se nota.',
    clase: 'border-gold-400/20 bg-ink-950/40 text-gold-100/60',
  },
};

export default function EclipseNotice() {
  const [estado, setEstado] = useState<{ hoy: LunarEclipse | null; proximo: LunarEclipse | null } | null>(
    null,
  );

  useEffect(() => {
    let vivo = true;
    void estadoLunar().then((e) => {
      /* El guard evita el clásico "setState after unmount" si el usuario se va
         de la pantalla antes de que responda la API. */
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /* Sin dato todavía: no se renderiza nada. Un bloque vacío con "cargando"
     centado salta al aparecer y empuja el resto de la pantalla hacia abajo. */
  if (!estado) return null;

  const hoy = estado.hoy;
  if (hoy) {
    const et = ETIQUETA[hoy.kind];
    const totality = duracionLegible(hoy.totalidad);
    return (
      <div className={`rounded-xl border px-4 py-3 ${et.clase}`}>
        <p className="font-display text-sm uppercase tracking-[0.16em]">{et.nombre}</p>
        <p className="mt-1 text-xs leading-relaxed opacity-85">{et.nota}</p>
        <p className="mt-1.5 text-[0.65rem] opacity-70">
          Máximo a las {hoy.mayor ? hoy.mayor.slice(11, 16) : '—'} UTC
          {totality ? ` · la totalidad dura ${totality}` : ''}
        </p>
      </div>
    );
  }

  /* No hay eclipse hoy. Se anuncia el próximo, y sólo si es de los que vale la
     pena mirar: uno penumbral de 10 minutos no merece un cartel permanente
     en la pantalla. */
  const prox = estado.proximo;
  if (!prox || prox.kind === 'penumbral') return null;

  const et = ETIQUETA[prox.kind];
  const totality = duracionLegible(prox.totalidad);
  return (
    <div className="rounded-xl border border-gold-400/20 bg-ink-950/40 px-4 py-3">
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold-100/70">
        Próximo eclipse
      </p>
      <p className="mt-1 text-xs text-gold-100/80">
        <span className="text-gold-100">{et.nombre}</span> · {FECHA.format(new Date(`${prox.fecha}T12:00:00`))}
      </p>
      <p className="mt-1 text-[0.65rem] text-gold-100/40">
        {totality ? `La totalidad dura ${totality}. ` : ''}
        Lo dice el IMCCE, el observatorio astronómico oficial de Francia.
      </p>
    </div>
  );
}