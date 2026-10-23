import { useEffect, useState, type ReactNode } from 'react';
import { FASES_LUNARES, type Festival, type MoonPhaseId } from '@arcana/tarot-core';

/* ==========================================================================
   Piezas compartidas de la pantalla Luna: formatos de fecha, íconos y las
   marcas de la leyenda del calendario.

   LAS FECHAS: todo se muestra en la zona horaria del dispositivo, que es la
   del usuario. Un instante astronómico (la Luna Llena a las 04:12 UTC) se
   formatea con hora local; un DÍA del calendario se identifica con
   `AAAA-MM-DD` en hora local, nunca con `toISOString()`, que lo pasaría a UTC
   y en América movería la noche al día siguiente.
   ========================================================================== */

export const LOCALE = 'es-PE';

export const FECHA_LARGA = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
export const FECHA_LARGA_ANIO = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const FECHA_CORTA = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
export const HORA = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Hora de un instante astronómico, redondeada al minuto más cercano.
 * `Intl` trunca los segundos: una fase a las 04:11:52 saldría 04:11, y lo
 * publicado (redondeado) dice 04:12.
 */
export const horaAprox = (d: Date) => HORA.format(new Date(Math.round(d.getTime() / 60000) * 60000));

/** Zona horaria del dispositivo, para decir en qué hora están las horas. */
export function zonaHoraria(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local';
  } catch {
    return 'hora local';
  }
}

/** Día local como `AAAA-MM-DD`. */
export const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `AAAA-MM-DD` a la fecha local de ese día, a mediodía. */
export function desdeIsoDia(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** Días enteros entre dos días locales (b − a). */
export function diasEntre(a: Date, b: Date): number {
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86400000,
  );
}

/** "hoy", "mañana", "en 3 días", "hace 2 días". */
export function relativo(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

export const primeraMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La hora actual, refrescada cada `cadaMs`. La pantalla puede quedar abierta
 * pasada la medianoche: sin esto, "hoy" seguiría siendo ayer.
 */
export function useAhora(cadaMs = 60_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), cadaMs);
    return () => window.clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

/** Cierra con Escape mientras `activo`. */
export function useEscape(activo: boolean, alCerrar: () => void) {
  useEffect(() => {
    if (!activo) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [activo, alCerrar]);
}

/* --------------------------------------------------------------------------
   Fases: opciones de los selectores
   -------------------------------------------------------------------------- */

export const OPCIONES_FASE: { value: MoonPhaseId | 'any'; label: string }[] = [
  { value: 'any', label: 'Cualquier momento' },
  ...FASES_LUNARES.map((f) => ({ value: f.id, label: f.name })),
];

export const NOMBRE_FASE: Record<string, string> = Object.fromEntries(
  OPCIONES_FASE.map((o) => [o.value, o.label]),
);

/** Ángulo e iluminación NOMINALES de una fase, para dibujar su disco chico. */
export function lookDeFase(id: MoonPhaseId) {
  const i = FASES_LUNARES.findIndex((f) => f.id === id);
  const angle = (2 * Math.PI * i) / 8;
  return { angle, illumination: (1 - Math.cos(angle)) / 2, name: FASES_LUNARES[i]?.name };
}

/* --------------------------------------------------------------------------
   Festividades: categoría
   -------------------------------------------------------------------------- */

/**
 * Categoría de una festividad, sacada de los datos que ya trae (no de una
 * tabla aparte): las cuatro Hogueras, las cuatro estaciones (fecha solar) y
 * las dos vísperas tradicionales.
 */
export function categoriaDe(f: Pick<Festival, 'granHoguera' | 'fixed'>): string {
  if (f.granHoguera) return 'Gran Hoguera';
  if (!f.fixed) return 'Estación solar';
  return 'Víspera tradicional';
}

/* --------------------------------------------------------------------------
   Íconos (SVG de trazo, sin emoji)
   -------------------------------------------------------------------------- */

const TRAZOS: Record<string, ReactNode> = {
  izquierda: <path d="M15 18l-6-6 6-6" />,
  derecha: <path d="M9 6l6 6-6 6" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  mas: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lapiz: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  papelera: <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" />,
  calendario: <path d="M4 7h16v13H4zM4 11h16M8 4v4M16 4v4" />,
  abajo: <path d="M6 9l6 6 6-6" />,
  aviso: <path d="M12 4l9 16H3L12 4zM12 10v4M12 17v.5" />,
  reloj: <path d="M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z" />,
};

export function Icono({ nombre, className = 'h-4 w-4' }: { nombre: keyof typeof TRAZOS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Marcas del calendario: cada tipo tiene una FORMA, no sólo un color
   -------------------------------------------------------------------------- */

export type TipoMarca = 'fase' | 'astro' | 'fiesta' | 'ritual';

/** Forma y color de cada marca. La forma es lo que se lee sin color. */
export function Marca({ tipo, className = '' }: { tipo: TipoMarca; className?: string }) {
  const base = `inline-block shrink-0 ${className}`;
  switch (tipo) {
    case 'fase':
      /* Aro: la fase principal es un instante, un círculo vacío. */
      return <span aria-hidden="true" className={`${base} h-2 w-2 rounded-full border border-luna-300`} />;
    case 'astro':
      /* Rombo: retrógrados y eclipses. */
      return <span aria-hidden="true" className={`${base} h-[7px] w-[7px] rotate-45 bg-rosa-300`} />;
    case 'fiesta':
      /* Estrella de cuatro puntas: festividades. */
      return (
        <svg viewBox="0 0 10 10" aria-hidden="true" className={`${base} h-2.5 w-2.5 text-gold-300`}>
          <path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="currentColor" />
        </svg>
      );
    case 'ritual':
      /* Punto lleno: hay un ritual tuyo ese día. */
      return <span aria-hidden="true" className={`${base} h-1.5 w-1.5 rounded-full bg-lavanda-200`} />;
  }
}

export const LEYENDA: { tipo: TipoMarca; texto: string }[] = [
  { tipo: 'fase', texto: 'Fase principal' },
  { tipo: 'astro', texto: 'Evento astronómico (retrógrado, eclipse)' },
  { tipo: 'fiesta', texto: 'Festividad' },
  { tipo: 'ritual', texto: 'Ritual tuyo' },
];
