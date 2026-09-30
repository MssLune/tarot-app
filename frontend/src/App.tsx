import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import AppShell from './components/layout/AppShell';
import DeckScreen from './components/screens/DeckScreen';
import HistoryScreen from './components/screens/HistoryScreen';
import InputScreen from './components/screens/InputScreen';
import ResultScreen from './components/screens/ResultScreen';
import RitualsScreen from './components/screens/RitualsScreen';
import SpreadBuilder from './components/screens/SpreadBuilder';
import SpreadScreen from './components/screens/SpreadScreen';
import SystemScreen from './components/screens/SystemScreen';
import SignInPage from './components/auth/SignInPage';
import SignUpPage from './components/auth/SignUpPage';
import AdminPage from './components/admin/AdminPage';
import PlanScreen from './components/plans/PlanScreen';
import Button from './components/ui/Button';
import Glyph from './components/ui/Glyph';
import Starfield from './components/ui/Starfield';
import { useContentStore } from './store/useContentStore';
import { useReadingStore } from './store/useReadingStore';

/* ==========================================================================
   Raíz de la aplicación.
   Enruta entre pantallas con transiciones suaves (AnimatePresence) y
   mantiene el fondo estelar fuera del ciclo de animación.
   ========================================================================== */

/** Transición compartida por todas las pantallas. */
const pageTransition = {
  initial: { opacity: 0, y: 24, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -18, filter: 'blur(6px)' },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

export default function App() {
  const screen = useReadingStore((s) => s.screen);
  const contentStatus = useContentStore((s) => s.status);
  const contentError = useContentStore((s) => s.error);
  const loadContent = useContentStore((s) => s.loadContent);
  const isAuthenticated = useReadingStore((s) => s.isAuthenticated);
  const setIsAuthenticated = useReadingStore((s) => s.setIsAuthenticated);
  const loadUserData = useReadingStore((s) => s.loadUserData);
  const migrateLocalData = useReadingStore((s) => s.migrateLocalData);

  const { isSignedIn, isLoaded } = useAuth();
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  /* Las cartas y tiradas predefinidas vienen de la API: se piden una sola vez al arrancar. */
  useEffect(() => {
    loadContent();
  }, [loadContent]);

  /* Sincronizar autenticación con Clerk */
  useEffect(() => {
    if (isLoaded) {
      setIsAuthenticated(!!isSignedIn);
    }
  }, [isLoaded, isSignedIn, setIsAuthenticated]);

  /* Al iniciar sesión: primero se sube lo que quedó en el navegador y recién
     después se recarga desde la API. El orden importa: loadUserData reemplaza
     el estado con la respuesta del server, así que migrar después perdería
     los datos locales. Además, sólo corre una vez por sesión. */
  const migratedRef = useRef(false);
  useEffect(() => {
    if (!isSignedIn || !isAuthenticated) {
      migratedRef.current = false;
      return;
    }
    if (migratedRef.current) return;
    migratedRef.current = true;

    void (async () => {
      await migrateLocalData();
      await loadUserData();
    })();
  }, [isSignedIn, isAuthenticated, migrateLocalData, loadUserData]);

  /* Al cambiar de pantalla, volvemos arriba: evita aterrizar a mitad de página. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen]);

  /* Mostrar pantalla de carga mientras Clerk se inicializa */
  if (!isLoaded) {
    return (
      <>
        <Starfield />
        <AppShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full border border-gold-300/40 bg-ink-950/70 text-2xl text-gold-gradient">
              <Glyph>✧</Glyph>
            </span>
            <p className="overline">Cargando…</p>
          </div>
        </AppShell>
      </>
    );
  }

  /* Mostrar autenticación si el usuario no está autenticado */
  if (!isSignedIn) {
    return (
      <>
        <Starfield />
        <AppShell>
          <div className="space-y-8">
            <div className="text-center">
              <p className="overline mb-3">Bienvenido a Arcana</p>
              <h1 className="text-gold-gradient text-3xl sm:text-4xl">Iniciá sesión o creá tu cuenta</h1>
              <p className="mt-3 text-sm text-gold-100/50">
                Guardá tus mazos, tiradas y lecturas en todos tus dispositivos.
              </p>
            </div>
            {/* Alternamos en estado: la app no tiene router, así que un <a href>
                haría una recarga completa hacia una ruta que el dev server no
                sirve y quedaría en blanco. */}
            {authMode === 'sign-in' ? <SignInPage /> : <SignUpPage />}

            <div className="text-center">
              {authMode === 'sign-in' ? (
                <p className="text-sm text-gold-100/50">
                  ¿No tenés cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('sign-up')}
                    className="text-gold-300 transition-colors hover:text-gold-200"
                  >
                    Registrate
                  </button>
                </p>
              ) : (
                <p className="text-sm text-gold-100/50">
                  ¿Ya tenés cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('sign-in')}
                    className="text-gold-300 transition-colors hover:text-gold-200"
                  >
                    Iniciá sesión
                  </button>
                </p>
              )}
            </div>
          </div>
        </AppShell>
      </>
    );
  }

  if (contentStatus === 'idle' || contentStatus === 'loading') {
    return (
      <>
        <Starfield />
        <AppShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full border border-gold-300/40 bg-ink-950/70 text-2xl text-gold-gradient">
              <Glyph>✧</Glyph>
            </span>
            <p className="overline">Abriendo el mazo…</p>
          </div>
        </AppShell>
      </>
    );
  }

  if (contentStatus === 'error') {
    return (
      <>
        <Starfield />
        <AppShell>
          <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-300/40 bg-ink-950/70 text-2xl text-rose-200">
              <Glyph>✕</Glyph>
            </span>
            <h2 className="text-lg text-gold-100">No pudimos conectar con la API</h2>
            <p className="text-sm text-gold-100/50">{contentError}</p>
            <Button onClick={() => loadContent()}>Reintentar</Button>
          </div>
        </AppShell>
      </>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'system':
        return <SystemScreen />;
      case 'decks':
        return <DeckScreen />;
      case 'spread':
        return <SpreadScreen />;
      case 'input':
        return <InputScreen />;
      case 'result':
        return <ResultScreen />;
      case 'builder':
        return <SpreadBuilder />;
      case 'history':
        return <HistoryScreen />;
      case 'rituals':
        return <RitualsScreen />;
      case 'plan':
        return <PlanScreen />;
      case 'admin':
        return <AdminPage />;
      default:
        return <SystemScreen />;
    }
  };

  return (
    <>
      <Starfield />
      <AppShell>
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
            transition={pageTransition.transition}
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </AppShell>
    </>
  );
}
