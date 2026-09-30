/* ==========================================================================
   Glifo tipográfico.
   Varios símbolos astrológicos (los signos del zodíaco, U+2648–U+2653) tienen
   presentación emoji por defecto y el sistema los dibuja a color, rompiendo la
   estética dorada. Se les agrega el selector de variación de texto (U+FE0E)
   y una pila de fuentes de símbolos para forzar el glifo monocromo.
   ========================================================================== */

const TEXT_VARIATION_SELECTOR = '\uFE0E';

export default function Glyph({
  children,
  className = '',
  style,
}: {
  children: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`glyph ${className}`}
      style={style}
      // El selector de variación fuerza la versión monocroma del símbolo.
    >
      {children + TEXT_VARIATION_SELECTOR}
    </span>
  );
}
