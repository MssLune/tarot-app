import { defineConfig } from 'vitest/config';

/* ==========================================================================
   Tests del backend.

   Son de lógica pura y de integración con la base real de desarrollo, no de
   red: el `environment` es `node` porque no hay nada de DOM que probar. Para
   las pruebas de HTTP, las rutas se montan sobre el `app` de express y se
   llama con `fetch` contra un puerto libre.
   ========================================================================== */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /* Las pruebas que tocan la base necesitan tiempo:levantan el servidor de
       express, esperan y hacen varias consultas. */
    testTimeout: 20000,
  },
});
