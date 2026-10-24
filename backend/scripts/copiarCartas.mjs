/* Copia las imágenes de las cartas a `public/assets/cards` en el build de
   Vercel. En Vercel `express.static` no sirve archivos: lo que está en
   `public/` lo sirve la CDN, en la misma URL que en local (/assets/cards/…). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origen = path.join(backend, 'assets', 'cards');
const destino = path.join(backend, 'public', 'assets', 'cards');

fs.rmSync(path.join(backend, 'public'), { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
let n = 0;
if (fs.existsSync(origen)) {
  for (const f of fs.readdirSync(origen)) {
    if (/\.(jpe?g|png|webp)$/i.test(f)) {
      fs.copyFileSync(path.join(origen, f), path.join(destino, f));
      n += 1;
    }
  }
}
/* La carpeta pública no puede quedar vacía: Vercel la exige como salida. */
fs.writeFileSync(path.join(backend, 'public', 'index.html'), '<!doctype html><title>Arcana API</title><p>Arcana API</p>');
console.log(`[copiarCartas] ${n} imágenes copiadas a public/assets/cards`);
