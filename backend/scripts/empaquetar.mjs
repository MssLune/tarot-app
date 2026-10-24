/* ==========================================================================
   Empaqueta el backend en un solo archivo para Vercel.

   Por qué: Vercel ejecuta el backend como una función (api/index.js). El
   código importa `@arcana/tarot-core`, que es TypeScript sin compilar dentro
   del monorepo, y la función no lo compila sola. esbuild junta el backend y
   tarot-core en `dist-vercel/app.cjs`; las dependencias de npm (Prisma,
   pdfkit, Stripe…) quedan afuera y se cargan de node_modules, porque varias
   leen archivos propios del disco y no sobreviven a un empaquetado.

   EXCEPCIÓN: las que sólo se publican como módulo ES (hoy, svix) van
   ADENTRO. El paquete es CommonJS (`app.cjs`) y la función de Vercel no
   puede hacer `require()` de un módulo ES: se caía al arrancar con
   ERR_REQUIRE_ESM. esbuild las convierte al empaquetarlas.

   Se corre en el build de Vercel (`npm run vercel-build`). En local no hace
   falta: `npm run dev` sigue usando tsx.
   ========================================================================== */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(aqui, '..');

/** Dependencias que sólo existen como módulo ES: se empaquetan adentro. */
const SOLO_ESM = new Set(['svix']);

const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
const externas = Object.keys(pkg.dependencies ?? {})
  .filter((d) => !SOLO_ESM.has(d))
  /* Cada paquete y sus subrutas (`dotenv/config`, `@clerk/express/…`). */
  .flatMap((d) => [d, `${d}/*`]);

await build({
  entryPoints: [path.join(backend, 'src', 'app.ts')],
  outfile: path.join(backend, 'dist-vercel', 'app.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  /* Las dependencias del backend quedan afuera (salvo las de SOLO_ESM)… */
  external: [...externas, '.prisma/*'],
  /* …y tarot-core se compila adentro desde su código fuente. */
  alias: {
    '@arcana/tarot-core': path.resolve(backend, '..', 'packages', 'tarot-core', 'src', 'index.ts'),
  },
  logLevel: 'info',
});
