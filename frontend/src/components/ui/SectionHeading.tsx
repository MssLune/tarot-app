import type { ReactNode } from 'react';

/* ==========================================================================
   Encabezado de sección: overline + título con degradado + subtítulo.
   ========================================================================== */

export default function SectionHeading({
  overline,
  title,
  subtitle,
  children,
}: {
  overline?: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="text-center">
      {overline && <p className="overline mb-3">{overline}</p>}
      <h2 className="text-gold-gradient text-2xl leading-tight sm:text-4xl">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-gold-100/55 sm:text-base">
          {subtitle}
        </p>
      )}
      {children}
    </header>
  );
}
