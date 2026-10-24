import fs from 'node:fs';
import path from 'node:path';

/* ==========================================================================
   Imágenes de las cartas.

   La app funciona sin ellas y funciona con ellas: si una carta no tiene
   imagen, se dibuja el símbolo del palo o el número romano como siempre. Eso
   es lo que hace que se puedan ir bajando de a una sin que la app se rompa a
   mitad de camino.

   Los archivos viven en el disco y en la base sólo está el NOMBRE. No una
   ruta: una ruta guardada en la base es una forma de que alguien lea un
   archivo de fuera, y por eso el nombre se valida antes de construir la ruta.
   ========================================================================== */

/**
 * Carpeta con los archivos: `backend/assets/cards`.
 *
 * Se busca entre varias ubicaciones porque el código no corre siempre desde
 * el mismo lugar: en desarrollo es `src/services/` (dos niveles arriba), y en
 * Vercel el backend va empaquetado en un solo archivo en `dist-vercel/` (un
 * nivel arriba). Se usa la primera que exista.
 */
function carpetaDeCartas(): string {
  const candidatas = [
    path.resolve(__dirname, '..', '..', 'assets', 'cards'),
    path.resolve(__dirname, '..', 'assets', 'cards'),
    path.resolve(process.cwd(), 'assets', 'cards'),
  ];
  return candidatas.find((c) => fs.existsSync(c)) ?? candidatas[0];
}
export const CARDS_DIR = carpetaDeCartas();

/** Ruta pública con la que se sirven. Debe coincidir con la de `app.ts`. */
export const CARDS_ROUTE = '/assets/cards';

const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Un JPEG de una carta a 150 dpi no pasa de 30 kB; 400 kB ya es un error. */
const TAMANO_MAXIMO = 400 * 1024;

export class ImagenDeCartaInvalida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ImagenDeCartaInvalida';
  }
}

/**
 * Valida un nombre de archivo y devuelve la ruta completa.
 *
 * Se rechazan los nombres con separadores de ruta, los que suben de nivel
 * (`..`) y los que no tienen una extensión de imagen. Con eso, un nombre
 * guardado en la base sólo puede apuntar a un archivo de la carpeta de
 * cartas.
 */
export function rutaDeImagen(nombre: string | null | undefined): string | null {
  if (!nombre) return null;

  const base = path.basename(nombre);
  if (base !== nombre.trim() || nombre.includes('/') || nombre.includes('\\')) {
    throw new ImagenDeCartaInvalida(
      `El nombre de la imagen tiene una ruta dentro: "${nombre}". Se espera sólo el nombre del archivo.`,
    );
  }
  if (base.startsWith('.')) {
    throw new ImagenDeCartaInvalida(`El nombre de la imagen no puede empezar con punto: "${nombre}".`);
  }
  /* Caracteres de control, y en particular el byte nulo. Un nombre con un
     nulo puede pasar la comprobación de extensión (`a.jpg\0.png` termina en
     `.png`) y llegar a un `open()` donde termina el string, que es una forma
     clásica de leer un archivo que no es el que se pidió. */
  if (/[\x00-\x1f\x7f]/.test(nombre)) {
    throw new ImagenDeCartaInvalida(
      `El nombre de la imagen tiene un carácter de control: "${nombre.replace(/[\x00-\x1f\x7f]/g, '?')}".`,
    );
  }
  const ext = path.extname(base).toLowerCase();
  if (!EXTENSIONES.has(ext)) {
    throw new ImagenDeCartaInvalida(
      `La extensión "${ext || '(ninguna)'}" no está permitida. Se aceptan ${[...EXTENSIONES].join(', ')}.`,
    );
  }
  return path.join(CARDS_DIR, base);
}

/** La ruta completa, o null si el archivo no está en la carpeta. */
export function imagenDeCarta(nombre: string | null | undefined): string | null {
  const ruta = rutaDeImagen(nombre);
  if (!ruta) return null;
  return fs.existsSync(ruta) ? ruta : null;
}

/** La URL que consume el frontend, o null si la carta no tiene imagen. */
export function urlDeImagen(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const ruta = rutaDeImagen(nombre);
  if (!ruta) return null;
  return fs.existsSync(ruta) ? `${CARDS_ROUTE}/${encodeURIComponent(nombre)}` : null;
}

/** Todas las imágenes que hay en la carpeta, por nombre de archivo. */
export function imagenesDisponibles(): string[] {
  if (!fs.existsSync(CARDS_DIR)) return [];
  return fs
    .readdirSync(CARDS_DIR)
    .filter((f) => EXTENSIONES.has(path.extname(f).toLowerCase()))
    .sort();
}

/**
 * Copia un archivo a la carpeta de cartas y devuelve el nombre.
 *
 * El nombre se deriva del id de la carta, no del archivo que se pasó: un
 * archivo llamado `final_v2_bueno.jpg` colgaría en el servidor para siempre y
 * nadie sabría cuál es cuál.
 */
export function guardarImagenDeCarta(cardId: string, origen: string): string {
  const ext = path.extname(origen).toLowerCase();
  if (!EXTENSIONES.has(ext)) {
    throw new ImagenDeCartaInvalida(
      `"${path.basename(origen)}" no es una imagen (${ext || 'sin extensión'}).`,
    );
  }
  const stat = fs.statSync(origen);
  if (stat.size > TAMANO_MAXIMO) {
    throw new ImagenDeCartaInvalida(
      `La imagen pesa ${(stat.size / 1024).toFixed(0)} kB y el máximo es ` +
        `${(TAMANO_MAXIMO / 1024).toFixed(0)} kB. Una carta a 150 dpi no necesita más: ` +
        `en el PDF mide 1,1 pulgadas de ancho.`,
    );
  }

  const nombre = `${cardId}${ext}`;
  fs.mkdirSync(CARDS_DIR, { recursive: true });
  fs.copyFileSync(origen, path.join(CARDS_DIR, nombre));
  return nombre;
}
