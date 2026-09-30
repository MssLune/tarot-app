import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* El environment es `node` a propósito: los tests de este proyecto son de
   lógica pura y de renderizado a HTML estático con `react-dom/server`, y no
   necesitan DOM. Con `jsdom` se correrían más lento sin aportar nada.

   Los `import.meta.env` sí existen acá porque los tests pasan por la
   transformación de Vite: sin esto, `api.ts` lee `import.meta.env` y
   revienta al importarse. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /* El setup debe cargarse antes que cualquier módulo del test: zustand
       `persist` busca localStorage al importarse. */
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
