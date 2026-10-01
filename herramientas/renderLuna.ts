/* ==========================================================================
   Renderiza los ocho discos a un PNG para poder mirarlos.

   Es una herramienta de diseño, no parte de la app. Existe porque sin browser
   no hay forma de ver una decisión visual: se puede razonar sobre un color y
   sobre una forma y aun así salir mal. Con esto se ve.

   El SVG que dibuja sale de la FUNCIÓN PURA que usa el componente, no de una
   copia: si el archivo de acá se dibujara distinto al de la pantalla, esta
   herramienta estaría mintiendo, y para que no pueda mentir hay un test que
   compara ambas salidas.

   Uso:  npx tsx herramientas/renderLuna.ts
   Salida: frontend/.luna/contacto.png
   ========================================================================== */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { moonDiscSvg } from '../frontend/src/components/cards/moonDiscSvg';

/** Las ocho fases, con el ángulo que les corresponde. */
const FASES: { nombre: string; angle: number }[] = [
  { nombre: 'Nueva', angle: 0 },
  { nombre: 'Creciente', angle: Math.PI / 4 },
  { nombre: 'Cuarto creciente', angle: Math.PI / 2 },
  { nombre: 'Casi llena', angle: (3 * Math.PI) / 4 },
  { nombre: 'Llena', angle: Math.PI },
  { nombre: 'Menguante', angle: (5 * Math.PI) / 4 },
  { nombre: 'Cuarto menguante', angle: (3 * Math.PI) / 2 },
  { nombre: 'Balsema', angle: (7 * Math.PI) / 4 },
];

/** Iluminación esperada en cada fase, para pintar la etiqueta. */
const iluminacion = (angle: number) => (1 - Math.cos(angle)) / 2;

const TAM = 168;
const FONDO = '#0d0a1c';
const SALIDA = resolve(process.cwd(), 'frontend/.luna/contacto.png');

/** Un disco por PNG, y después una hoja de contacto con todos. */
async function main() {
  await mkdir(dirname(SALIDA), { recursive: true });

  const capas: sharp.OverlayOptions[] = [];
  const celdas: string[] = [];

  const CW = TAM + 24;
  const CH = TAM + 56;

  const variantEngraved = true;

  FASES.forEach((f, i) => {
    const svg = moonDiscSvg({
      size: TAM,
      angle: f.angle,
      illumination: iluminacion(f.angle),
      detail: variantEngraved,
      glow: false,
      uid: `p${i}`,
    });
    /* Cada disco en SU celda. Con `left: 0, top: 0` los ocho quedaban
       apilados en la esquina y la hoja parecía una sola luna repetida. */
    capas.push({
      input: Buffer.from(svg),
      left: (i % 4) * CW + 12,
      top: Math.floor(i / 4) * CH + 12,
    });
    celdas.push(`${f.nombre}`);
  });

  /* Hoja de contacto: 4 × 2, cada celda con su disco y su nombre. El fondo es
     el índigo de la app, que es donde vive la Luna de verdad: un disco que se
     vea bien sobre blanco puede quedar mal arriba. */
  const ancho = CW * 4;
  const alto = CH * 2;

  const svgHoja = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
<rect width="${ancho}" height="${alto}" fill="${FONDO}"/>
${celdas
  .map((nombre, i) => {
    const x = (i % 4) * CW;
    const y = Math.floor(i / 4) * CH;
    return `<text x="${x + CW / 2}" y="${y + TAM + 30}" fill="#e8cd8a" font-size="17" font-family="Georgia, serif" text-anchor="middle">${nombre}</text>`;
  })
  .join('\n')}
</svg>`;

  const lienzo = sharp(Buffer.from(svgHoja)).composite(capas as never);

  await mkdir(resolve(process.cwd(), 'frontend/.luna/fases'), { recursive: true });
  for (let i = 0; i < FASES.length; i += 1) {
    const svg = moonDiscSvg({
      size: 400,
      angle: FASES[i].angle,
      illumination: iluminacion(FASES[i].angle),
      detail: true,
      glow: true,
      uid: `g${i}`,
    });
    await writeFile(
      resolve(process.cwd(), `frontend/.luna/fases/${i}-${FASES[i].nombre.replace(/ /g, '-').toLowerCase()}.png`),
      await sharp(Buffer.from(svg)).png().toBuffer(),
    );
  }

  /* Tiras de tamaño real, que es donde hay que mirar: el calendario pinta a
     20 px y los cráteres que a 168 px son superficie, ahí son manchas. */
  const TAMANOS = [20, 28, 44, 88];
  for (const t of TAMANOS) {
    const cols: sharp.OverlayOptions[] = [];
    FASES.forEach((f, i) => {
      cols.push({
        input: Buffer.from(
          moonDiscSvg({
            size: t,
            angle: f.angle,
            illumination: iluminacion(f.angle),
            /* El componente corta el detalle por tamaño; este es el mismo
               umbral, para que la tira muestre lo que se ve en pantalla. */
            detail: variantEngraved || t >= 44,
            glow: false,
            uid: `t${t}_${i}`,
          }),
        ),
        left: i * (t + 14) + 14,
        top: 20,
      });
    });
    const w = (t + 14) * 8 + 14;
    const MAG = 7;
    await sharp({
      create: { width: w, height: t + 40, channels: 4, background: { r: 13, g: 10, b: 28, alpha: 1 } },
    })
      .composite(cols as never)
      /* Se amplía con `nearest`, o sea sin interpolar. Un reescalado suave
         inventaría un gradiente que a 20 px no existe y haría creer que el
         disco se ve mejor de lo que se ve. Con píxel duro se ven los píxeles
         que de verdad salen. */
      .resize({ width: w * MAG, height: (t + 40) * MAG, kernel: 'nearest' })
      .png()
      .toFile(resolve(process.cwd(), `frontend/.luna/tam-${t}px.png`));
  }

  await lienzo.png().toFile(SALIDA);
  console.log('hoja de contacto:', SALIDA);
  console.log('discos grandes:  frontend/.luna/fases/');
  console.log('tiras de tamaño: frontend/.luna/tam-*px.png');
}

void main();