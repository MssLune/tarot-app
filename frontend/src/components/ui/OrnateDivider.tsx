/* ==========================================================================
   Separador ornamentado: dos filetes dorados con un símbolo al centro.
   ========================================================================== */

export default function OrnateDivider({
  symbol = '✦',
  className = '',
}: {
  symbol?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
      <span className="hairline h-px w-16 sm:w-28" />
      <span className="text-xs text-gold-300/80">{symbol}</span>
      <span className="hairline h-px w-16 sm:w-28" />
    </div>
  );
}
