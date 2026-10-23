import { useEffect, useState } from 'react';
import { estadoLunar, type LunarEclipse } from '../../services/api';
import { FECHA_LARGA_ANIO, horaAprox, Marca } from './lunaUi';

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
    clase: 'border-rosa-400/45 bg-rosa-400/[0.1] text-lavanda-100',
  },
  parcial: {
    nombre: 'Eclipse parcial de Luna',
    nota: 'Una parte de la Luna entra en la umbra: se ve un sector rojo y el resto iluminado.',
    clase: 'border-rosa-400/30 bg-noche-800/80 text-lavanda-100',
  },
  penumbral: {
    nombre: 'Eclipse penumbral',
    nota: 'La Luna pasa por la penumbra, la sombra más suave: apenas se nota.',
    clase: 'border-noche-600/60 bg-noche-800/80 text-lavanda-200',
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
      <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${et.clase}`}>
        <Marca tipo="astro" className="mt-1.5" />
        <div>
          <p className="font-display text-base text-rosa-300">Hoy: {et.nombre}</p>
          <p className="mt-1 text-sm leading-relaxed">{et.nota}</p>
          <p className="mt-1.5 text-xs text-lavanda-300">
            {/* El instante del máximo, en la hora local del usuario. */}
            {hoy.mayor ? `Máximo a las ${horaAprox(new Date(hoy.mayor))} (hora local)` : 'Hora del máximo no disponible'}
            {totality ? ` · la totalidad dura ${totality}` : ''}
          </p>
        </div>
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
  const cuando = prox.mayor ? new Date(prox.mayor) : new Date(`${prox.fecha}T12:00:00`);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-noche-600/60 bg-noche-800/70 px-4 py-3">
      <Marca tipo="astro" className="mt-1.5" />
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-lavanda-400">Próximo eclipse</p>
        <p className="mt-0.5 text-sm text-lavanda-100">
          <span className="font-display text-rosa-300">{et.nombre}</span> · {FECHA_LARGA_ANIO.format(cuando)}
          {prox.mayor && <span className="text-lavanda-300">, máximo a las {horaAprox(cuando)}</span>}
        </p>
        <p className="mt-1 text-xs text-lavanda-400">
          {totality ? `La totalidad dura ${totality}. ` : ''}
          Datos del IMCCE (Observatorio de París). Que se vea depende de dónde estés.
        </p>
      </div>
    </div>
  );
}
