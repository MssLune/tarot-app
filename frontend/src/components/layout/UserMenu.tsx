import { useEffect, useRef, useState } from 'react';
import { useClerk, useSession } from '@clerk/react';
import { useProfile } from '../../lib/useProfile';
import { useReadingStore } from '../../store/useReadingStore';
import Button from '../ui/Button';

/* ==========================================================================
   Menú de cuenta: identidad, rol, sincronización y cierre de sesión.
   Se muestra sólo si hay sesión iniciada (AppShell lo usa dentro de <Show>).
   ========================================================================== */

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  user: 'Lector',
};

export default function UserMenu() {
  const { user, signOut } = useClerk();
  const { session } = useSession();
  const restart = useReadingStore((s) => s.restart);
  const goTo = useReadingStore((s) => s.goTo);
  const retrySync = useReadingStore((s) => s.retrySync);
  const syncInFlight = useReadingStore((s) => s.syncInFlight);
  const pendingCount = useReadingStore((s) => s.pendingOps.length);
  const { profile, isAdmin } = useProfile();

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Cierra el menú al hacer clic fuera o al presionar Escape. */
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirming(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  /* Reintenta la cola de operaciones que fallaron. No hace falta "subir todo":
     la sincronización es automática y lo que queda en la cola es exactamente
     lo que no se pudo guardar en su momento. */
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retrySync();
    } finally {
      setRetrying(false);
    }
  };

  if (!user) return null;

  /* El rol viene de la API (useProfile), no de Clerk: la base es la fuente
     de verdad y así se puede promover a admin desde el propio panel. */
  const role = profile?.role ?? 'user';
  const fullName = user.fullName || user.username || null;
  /* Iniciales para el avatar de reserva (sin foto y sin nombre). */
  const initials = (fullName ?? user.primaryEmailAddress?.emailAddress ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const handleSignOut = () => {
    restart();
    void signOut({ redirectUrl: window.location.origin });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Botón del avatar */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirming(false);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de cuenta"
        title={fullName ?? user.primaryEmailAddress?.emailAddress ?? 'Cuenta'}
        className="group flex items-center gap-2 rounded-full border border-gold-400/25 py-1 pl-1 pr-2 transition-colors hover:border-gold-300/60 hover:bg-gold-400/10 sm:pr-3"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold-300/40 bg-ink-900 text-[0.65rem] text-gold-200">
          {user.imageUrl ? (
            <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className="hidden max-w-[9rem] truncate font-display text-[0.65rem] uppercase tracking-[0.16em] text-gold-200/80 sm:block">
          {fullName ?? 'Cuenta'}
        </span>
        <span className="text-[0.55rem] text-gold-100/40" aria-hidden="true">
          ▾
        </span>
      </button>

      {/* Panel desplegable */}
      {open && (
        <div
          role="menu"
          /* Opaco a propósito: .panel es cristal y sobre el campo estelar el
             texto dorado se vuelve ilegible. Acá va un fondo sólido. */
          className="gilded absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-3xl border border-gold-400/20 bg-ink-900 p-0"
          style={{ boxShadow: '0 28px 70px -24px rgba(0, 0, 0, 0.98)' }}
        >
          {/* Identidad */}
          <div className="border-b border-gold-400/15 px-4 py-3.5">
            <p className="truncate text-sm text-gold-100">
              {profile?.name ?? fullName ?? 'Sin nombre'}
            </p>
            <p className="mt-0.5 truncate text-[0.68rem] text-gold-100/70">
              {profile?.email ?? user.primaryEmailAddress?.emailAddress ?? '—'}
            </p>
            <span className="mt-2 inline-block rounded-full border border-gold-400/40 bg-ink-800 px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.14em] text-gold-200">
              {ROLE_LABEL[role] ?? 'Lector'}
            </span>
          </div>

          {/* Acceso a administración: sólo si el usuario es admin. */}
          {isAdmin && (
            <div className="border-b border-gold-400/15 px-4 py-3">
              <p className="overline mb-2">Administración</p>
              <button
                type="button"
                onClick={() => {
                  goTo('admin');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-gold-400/25 bg-ink-800 px-3 py-2.5 text-left transition-colors hover:border-gold-300/60 hover:bg-ink-700"
              >
                <span className="text-sm text-gold-300" aria-hidden="true">
                  ⚙
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-gold-100">Gestión de usuarios</span>
                  <span className="block text-[0.6rem] text-gold-100/60">
                    Roles, cuentas y contenido editorial
                  </span>
                </span>
                <span className="shrink-0 text-[0.6rem] text-gold-100/50" aria-hidden="true">
                  →
                </span>
              </button>
            </div>
          )}

          {/* Sesión activa */}
          <div className="border-b border-gold-400/15 px-4 py-3">
            <p className="overline mb-1.5">Sesión activa</p>
            {session ? (
              <div className="text-[0.65rem] leading-relaxed text-gold-100/70">
                <p>Este dispositivo</p>
                <p className="text-gold-100/55">
                  Ingresó {new Date(session.createdAt).toLocaleString('es-AR')}
                </p>
              </div>
            ) : (
              <p className="text-[0.65rem] text-gold-100/55">Sin datos de sesión</p>
            )}
          </div>

          {/* Estado de la sincronización con la cuenta. */}
          <div className="space-y-2 bg-ink-800 p-3">
            {pendingCount > 0 ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.08] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-amber-300" aria-hidden="true">
                    ⚠
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-gold-100">
                      {pendingCount === 1
                        ? '1 cambio sin sincronizar'
                        : `${pendingCount} cambios sin sincronizar`}
                    </span>
                    <span className="block text-[0.6rem] text-gold-100/60">
                      {retrying || syncInFlight > 0
                        ? 'Sincronizando…'
                        : 'Sólo en este navegador'}
                    </span>
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  fullWidth
                  className="mt-2"
                  disabled={retrying || syncInFlight > 0}
                  onClick={handleRetry}
                >
                  ↻ Reintentar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl border border-gold-400/20 bg-ink-700 px-3 py-2.5">
                <span className="text-sm text-emerald-400/90" aria-hidden="true">
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-gold-100">
                    {syncInFlight > 0 ? 'Sincronizando…' : 'Sincronizado'}
                  </span>
                  <span className="block text-[0.6rem] text-gold-100/60">
                    Mazos, tiradas y lecturas
                  </span>
                </span>
              </div>
            )}

            {confirming ? (
              <div className="space-y-2">
                <p className="text-center text-[0.68rem] text-gold-100/60">
                  ¿Cerrar sesión en este dispositivo?
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" className="flex-1" onClick={handleSignOut}>
                    Sí, salir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setConfirming(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" fullWidth onClick={() => setConfirming(true)}>
                Cerrar sesión
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
