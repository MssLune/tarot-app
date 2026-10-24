/* ==========================================================================
   Empaqueta el backend en un solo archivo para Vercel.

   Por qué: Vercel ejecuta el backend como una función (api/index.js). El
   código importa `@arcana/tarot-core`, que es TypeScript sin compilar dentro
   del monorepo, y la función no lo compila sola. esbuild junta el backend y
   tarot-core en `dist-vercel/app.cjs`; las dependencias de npm (Prisma,
   pdfkit, Stripe…) quedan afuera y se cargan de node_modules, porque varias
   leen archivos propios del disco y no sobreviven a un empaquetado.

   Se corre en el build de Vercel (`npm run vercel-build`). En local no hace
   falta: `npm run dev` sigue usando tsx.
   ========================================================================== */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(aqui, '..');

await build({
  entryPoints: [path.join(backend, 'src', 'app.ts')],
  outfile: path.join(backend, 'dist-vercel', 'app.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  /* Todo lo de node_modules queda afuera… */
  packages: 'external',
  /* …salvo tarot-core, que se compila adentro desde su código fuente. */
  alias: {
    '@arcana/tarot-core': path.resolve(backend, '..', 'packages', 'tarot-core', 'src', 'index.ts'),
  },
  logLevel: 'info',
});
