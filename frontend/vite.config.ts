import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base relativa: permite abrir el build desde el sistema de archivos o
  // servirlo desde cualquier subcarpeta sin reconfigurar nada.
  base: './',
  server: {
    port: 5173,
    open: false,
  },
});
