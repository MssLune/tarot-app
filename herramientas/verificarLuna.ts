/* ==========================================================================
   Verifica la geometría del disco contra el SVG RENDERIZADO.

   `moonDiscSvg.test.ts` mide el área con el zancos, reconstruyendo las dos
   cadenas del path. Eso comprueba la geometría que el código escribe, pero no
   que el SVG que sale esté bien: entre una cosa y la otra está el relleno por
   regla nonzero de SVG, que se comporta de formas que no se deducen mirando
   el `d`.

   Esta herramienta cierra ese hueco: rasteriza el path con librsvg y cuenta
   los píxeles. Si el `d` está mal, el área sale mal y esto falla.

   Corre fuera de la suite de tests porque necesita `sharp`, que vive en el
   backend y el frontend no lo tiene. Es una comprobación, no una parte de la
   app: hay que correrla a mano cuando se toca la geometría.

   Uso:  npx tsx herramientas/verificarLuna.ts
   ========================================================================== */

import sharp from 'sharp';
import { caminoIluminado } from '../frontend/src/components/cards/moonDiscSvg';

const LADO = 400;
const CENTRO = LADO / 2;
const R = LADO / 2 - 10;
const TOTAL = Math.PI * R * R;

/** Área iluminada real, contando píxeles del SVG renderizado. */
async function areaRenderizada(k: number, waxing: boolean) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}">` +
    `<rect width="${LADO}" height="${LADO}" fill="#000"/>` +
    `<path d="${caminoIluminado(CENTRO, R, k, waxing)}" fill="#fff"/>` +
    `</svg>`;

  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  let sx = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels] > 127) {
        n += 1;
        sx += x;
      }
    }
  }
  return { fraccion: n / TOTAL, centroX: n ? sx / n / CENTRO : 0 };
}

let fallos = 0;
const check = (ok: boolean, texto: string, detalle = '') => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}${detalle ? `   ${detalle}` : ''}`);
};

async function main() {
  console.log('Área iluminada: (1 − k)/2 sobre el SVG renderizado');
  for (const k of [1, 0.707, 0, -0.707, -1]) {
    const { fraccion, centroX } = await areaRenderizada(k, true);
    const esperado = (1 - k) / 2;
    const dif = Math.abs(fraccion - esperado);
    check(
      dif < 0.002,
      `k=${k.toFixed(3)}  área ${fraccion.toFixed(4)}`,
      `esperado ${esperado.toFixed(4)}  dif ${dif.toFixed(4)}`,
    );
    /* Y del lado correcto. El cuarto va a 1,40 porque el centroide de un
       semidisco está a 4R/3π del centro, no en el centro. */
    if (k !== -1 && k !== 1) {
      check(centroX > 1.02, `k=${k.toFixed(3)}  ilumina a la DERECHA`, `centroX=${centroX.toFixed(2)}`);
    }
  }

  console.log('\nCreciente y menguante: mismo área, lados opuestos');
  for (const k of [0.707, 0.5, 0, -0.5, -0.707]) {
    const der = await areaRenderizada(k, true);
    const izq = await areaRenderizada(k, false);
    check(Math.abs(der.fraccion - izq.fraccion) < 0.002, `k=${k.toFixed(3)}  áreas iguales`,
      `${der.fraccion.toFixed(4)} vs ${izq.fraccion.toFixed(4)}`);
    check(der.centroX > 1.02 && izq.centroX < 0.98, `k=${k.toFixed(3)}  lados opuestos`,
      `der ${der.centroX.toFixed(2)} / izq ${izq.centroX.toFixed(2)}`);
  }

  console.log(fallos === 0 ? '\nTodo correcto.' : `\n${fallos} fallas.`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
