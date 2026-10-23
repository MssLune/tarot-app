import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import ErrorBoundary from './components/layout/ErrorBoundary';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!publishableKey) {
  console.warn('[Clerk] VITE_CLERK_PUBLISHABLE_KEY no configurado. La autenticación no funcionará.');
}

/* Apariencia de los componentes de Clerk (inicio de sesión, registro,
   cuenta), con la paleta de la app (ver tailwind.config.js). Va aquí, en el
   provider, para que valga para todos a la vez. */
const clerkAppearance = {
  variables: {
    colorBackground: '#0a0716', // ink-900
    colorForeground: '#fbf3dc', // gold-100
    colorMutedForeground: 'rgba(251, 243, 220, 0.55)',
    colorPrimary: '#d9b25f', // gold-400
    colorPrimaryForeground: '#0a0716',
    colorInput: '#120d24', // ink-800
    colorInputForeground: '#fbf3dc',
    colorNeutral: '#fbf3dc',
    colorBorder: 'rgba(217, 178, 95, 0.25)',
    fontFamily: 'Inter, Poppins, system-ui, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    /* El pie de Clerk trae fondo propio: transparente para que se vea el
       fondo de la app. "Secured by Clerk" queda, pero con nuestros colores:
       quitarlo es una función del plan Pro de Clerk (se desactiva en su
       panel), no algo a ocultar con CSS. */
    footer: { background: 'transparent' },
    /* "Don't have an account? Sign up": la app ya muestra su propio enlace
       debajo ("¿No tienes cuenta? Regístrate"), y el de Clerk navegaría a una
       ruta que esta app sin router no tiene. */
    footerAction: { display: 'none' },
  },
  options: {
    /* La etiqueta "Development mode" sólo existe con claves de desarrollo
       (pk_test_); en producción no aparece. Se oculta para que la pantalla
       se vea como la verá el usuario. */
    unsafe_disableDevelopmentModeWarnings: true,
  },
};

/* Punto de entrada de la aplicación. */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey ?? ''} appearance={clerkAppearance}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ClerkProvider>
  </React.StrictMode>,
);
