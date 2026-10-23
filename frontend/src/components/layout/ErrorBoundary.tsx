import { Component, type ErrorInfo, type ReactNode } from 'react';

/* ==========================================================================
   Red de contención de errores.
   Sin esto, si cualquier componente falla al renderizar (por el motivo que
   sea), React desmonta toda la app y no queda nada en pantalla — el error
   real sólo aparece en la consola del navegador, invisible para quien no
   sepa abrirla. Esto muestra el error en pantalla para poder copiarlo y
   reportarlo, y da una forma de recuperarse sin perder el mazo/historial
   guardado (que vive en localStorage, no en memoria).
   ========================================================================== */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink-950 px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-300/40 bg-ink-950/70 text-2xl text-rose-200">
          ✕
        </span>
        <div>
          <h1 className="font-display text-lg uppercase tracking-[0.14em] text-gold-100">
            Algo salió mal
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gold-100/50">
            La aplicación encontró un error inesperado. Copia el mensaje de abajo si le vas a
            avisar a quien la mantiene — tu mazo y tu historial guardados no se pierden.
          </p>
        </div>
        <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-4 text-left text-xs text-rose-100/80">
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-gold-sheen px-6 py-3 font-display text-sm uppercase tracking-[0.16em] text-ink-900 shadow-glow"
        >
          Recargar
        </button>
      </div>
    );
  }
}
