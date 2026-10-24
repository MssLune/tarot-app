import 'dotenv/config';
import { beforeAll } from 'vitest';

/* ==========================================================================
   Preparación de los tests del backend (corre antes de cada archivo).

   Los tests de integración usan la base real de desarrollo (la rama `dev` de
   Neon), que está lejos (us-east-2) y en plan gratuito. A veces la conexión
   tarda o falla un momento —la base se despierta, o el pooler demora— y el
   test se cae con «Can't reach database server» o «Timed out fetching a new
   connection», aunque el código esté bien. Para que eso no ensucie los
   resultados:

   1. Sólo en los tests, se le da más margen a la conexión. No cambia
      `backend/.env` ni lo que usa la app: se ajusta la variable en memoria
      antes de que se cree el cliente de Prisma.
   2. Antes de los tests de cada archivo se abre la conexión con reintentos.
      Así el `beforeAll` de cada archivo encuentra la base ya despierta.
   3. `retry` en `vitest.config.ts` repite una vez un test que falló por un
      corte de red en el medio.
   ========================================================================== */

const url = process.env.DATABASE_URL;
const esPostgres = !!url && /^postgres(ql)?:\/\//i.test(url);
if (esPostgres) {
  const u = new URL(url);
  u.searchParams.set('pool_timeout', '60');
  u.searchParams.set('connect_timeout', '30');
  process.env.DATABASE_URL = u.toString();
}

beforeAll(async () => {
  if (!esPostgres) return;
  /* Import dinámico: el cliente se crea DESPUÉS de ajustar la variable. */
  const { prisma } = await import('../database/prisma');
  let ultimo: unknown;
  for (let intento = 1; intento <= 4; intento += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, 2000 * intento));
    }
  }
  throw ultimo;
}, 180000);
