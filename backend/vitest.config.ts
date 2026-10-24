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
    /* Da más margen a la conexión con Neon sólo en los tests: ver el archivo. */
    setupFiles: ['src/__tests__/setup.ts'],
    /* Las pruebas que tocan la base necesitan tiempo: levantan el servidor de
       express, esperan y hacen varias consultas. Con Neon, además, la base se
       apaga sola y la primera consulta espera a que despierte. Los
       `beforeAll` y `afterAll` crean y borran usuarios en la base, así que
       también necesitan más que los 10 s por defecto. */
    testTimeout: 30000,
    hookTimeout: 60000,
    /* Un archivo a la vez. En paralelo, cada archivo abre su propio pool de
       conexiones y con Neon (plan gratuito, a través del pooler) se agotan:
       aparece «Timed out fetching a new connection from the connection pool»
       y los `beforeAll` se cortan. Además así los archivos de integración no
       se pisan los datos entre ellos. */
    fileParallelism: false,
    /* Un test que falló por un corte de red con Neon se repite una vez. */
    retry: 1,
  },
});
