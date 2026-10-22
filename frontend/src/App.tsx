import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
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

/**
 * Transición compartida por todas las pantallas.
 *
 * SIN `filter: blur()`. Estaba, y era caro de una forma que no se ve en la
 * pantalla de sistema pero sí en la Luna: un desenfoque sobre el subárbol
 * entero obliga al navegador a componerlo en una capa propia, y la Luna tiene
 * 42 SVG inline. Al entrar y al salir se difuminaban los 42 a la vez.
 *
 * Un desenfoque además hace que la salida dependa de terminar a tiempo: con
 * `AnimatePresence mode="wait"`, si el exit no concludes, la pantalla nueva no
 * se monta y el área de contenido queda VACÍA — se ve el menú y nada más.
 * Sacar el blur deja la transición como una opacidad y un desplazamiento, que
 * no dependen de que el navegador pueda seguir el paso.
 */
const pageTransition = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
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
  const prepararSesion = useReadingStore((s) => s.prepararSesion);
  const limpiarDatosLocales = useReadingStore((s) => s.limpiarDatosLocales);
  const authView = useReadingStore((s) => s.authView);
  const authMotivo = useReadingStore((s) => s.authMotivo);
  const setAuthView = useReadingStore((s) => s.setAuthView);
  const cerrarCuenta = useReadingStore((s) => s.cerrarCuenta);
  const completarGuardadoPendiente = useReadingStore((s) => s.completarGuardadoPendiente);

  const { isSignedIn, isLoaded, userId } = useAuth();

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

  /* Sin sesión (cerró sesión, o expiró, o la cerró en otra pestaña): los
     datos del navegador que tienen dueño se borran. Están a salvo en su
     cuenta, y así quien use este equipo después no ve el historial de otro.
     Los datos SIN dueño (de antes de las cuentas) se conservan para subirlos
     la primera vez que alguien inicie sesión. */
  useEffect(() => {
    if (isLoaded && !isSignedIn && useReadingStore.getState().ownerId) {
      limpiarDatosLocales();
    }
  }, [isLoaded, isSignedIn, limpiarDatosLocales]);

  /* Al iniciar sesión: primero se sube lo que quedó en el navegador y recién
     después se recarga desde la API. El orden importa: loadUserData reemplaza
     el estado con la respuesta del server, así que migrar después perdería
     los datos locales. Además, sólo corre una vez por sesión. */
  /* Guarda el id del usuario ya preparado, no sólo "sí/no": si se cambia de
     cuenta sin cerrar sesión (Clerk admite varias sesiones), hay que volver a
     preparar con el usuario nuevo. */
  const migratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSignedIn || !isAuthenticated || !userId) {
      migratedRef.current = null;
      return;
    }
    if (migratedRef.current === userId) return;
    migratedRef.current = userId;

    void (async () => {
      /* PRIMERO, antes de subir nada: si lo que hay en el navegador es de
         otra cuenta, se descarta. Si no, `migrateLocalData` subiría a esta
         cuenta las lecturas de otra persona. */
      prepararSesion(userId);
      await migrateLocalData();
      await loadUserData();
      /* Si entró para guardar la lectura que acababa de hacer como invitado,
         se guarda ahora, ya en su cuenta. */
      completarGuardadoPendiente();
    })();
  }, [
    isSignedIn,
    isAuthenticated,
    userId,
    prepararSesion,
    migrateLocalData,
    loadUserData,
    completarGuardadoPendiente,
  ]);

  /* Con sesión iniciada, la pantalla de cuenta no tiene nada que hacer. Se
     cierra sin `cerrarCuenta`, que descartaría la lectura apartada antes de
     que `completarGuardadoPendiente` llegue a guardarla. */
  useEffect(() => {
    if (isSignedIn && authView) useReadingStore.setState({ authView: null, authMotivo: null });
  }, [isSignedIn, authView]);

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

  /* Pantalla de cuenta, SÓLO si se pidió. La app se usa sin cuenta (modo
     invitado): esta pantalla aparece al tocar "Iniciar sesión" o al intentar
     algo que se guarda (una lectura, un mazo, un ritual). */
  if (!isSignedIn && authView) {
    return (
      <>
        <Starfield />
        <AppShell>
          <div className="space-y-8">
            <div className="text-center">
              <p className="overline mb-3">Tu cuenta en Arcana</p>
              <h1 className="text-gold-gradient text-3xl sm:text-4xl">
                {authView === 'sign-in' ? 'Iniciá sesión' : 'Creá tu cuenta'}
              </h1>
              <p className="mt-3 text-sm text-gold-100/50">
                {authMotivo ?? 'Guardá tus mazos, tiradas y lecturas en todos tus dispositivos.'}
              </p>
            </div>
            {/* Alternamos en estado: la app no tiene router, así que un <a href>
                haría una recarga completa hacia una ruta que el dev server no
                sirve y quedaría en blanco. */}
            {authView === 'sign-in' ? <SignInPage /> : <SignUpPage />}

            <div className="space-y-3 text-center">
              {authView === 'sign-in' ? (
                <p className="text-sm text-gold-100/50">
                  ¿No tenés cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthView('sign-up')}
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
                    onClick={() => setAuthView('sign-in')}
                    className="text-gold-300 transition-colors hover:text-gold-200"
                  >
                    Iniciá sesión
                  </button>
                </p>
              )}
              <button
                type="button"
                onClick={cerrarCuenta}
                className="font-display text-[0.68rem] uppercase tracking-[0.2em] text-gold-100/45 transition-colors hover:text-gold-100"
              >
                ← Seguir sin cuenta
              </button>
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
