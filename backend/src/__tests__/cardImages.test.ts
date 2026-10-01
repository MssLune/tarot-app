import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CARDS_DIR,
  ImagenDeCartaInvalida,
  imagenDeCarta,
  imagenesDisponibles,
  rutaDeImagen,
  urlDeImagen,
} from '../services/cardImages';

/* ==========================================================================
   Las imágenes de las cartas.

   El campo de la base es un NOMBRE de archivo y no una ruta, justamente para
   que un nombre no pueda apuntar a un archivo de fuera. Eso sólo sirve si la
   validación aguanta: si alguien puede escribir "../../.env" en la base y la
   app lo sirve o el PDF lo incrusta, se terminó la garantía.

   Por eso la mitad de estos tests son de nombres maliciosos.
   ========================================================================== */

const NOMBRES_BUENOS = ['la-torre.jpg', 'el-mago.png', 'reina-de-espadas.webp'];

describe('un nombre de archivo válido', () => {
  it('devuelve la ruta dentro de la carpeta de cartas', () => {
    const ruta = rutaDeImagen('la-torre.jpg');
    expect(ruta).not.toBeNull();
    expect(path.dirname(ruta!)).toBe(CARDS_DIR);
  });

  it('acepta jpg, jpeg, png y webp', () => {
    for (const n of NOMBRES_BUENOS) {
      expect(rutaDeImagen(n), n).not.toBeNull();
    }
  });

  it('no le importa la mayúscula de la extensión', () => {
    expect(rutaDeImagen('la-torre.JPG')).not.toBeNull();
  });
});

describe('un nombre que tries salir de la carpeta', () => {
  /* Cada caso es un intento real de leer un archivo de otro lado. */
  const ATAQUES = [
    '../package.json',
    '../../.env',
    '....//....//etc/passwd',
    'sub/carpeta.jpg',
    'sub\\carpeta.jpg',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
  ];

  for (const ataque of ATAQUES) {
    it(`rechaza "${ataque}"`, () => {
      expect(() => rutaDeImagen(ataque)).toThrow(ImagenDeCartaInvalida);
    });
  }

  it('rechaza un archivo escondido', () => {
    /* Un archivo que empieza con punto es un `.env`, un `.git/config` o
       cualquier cosa que no debería servirse por una URL de carta. */
    expect(() => rutaDeImagen('.env')).toThrow(ImagenDeCartaInvalida);
  });

  it('rechaza una extensión que no es de imagen', () => {
    /* Sin esto, `image = "../../package.json"` no serviría por la ruta, pero
       `image = "package.json"` sí. */
    for (const n of ['package.json', 'script.sh', 'notas.txt', 'archivo.pdf', 'sin-extension']) {
      expect(() => rutaDeImagen(n), n).toThrow(ImagenDeCartaInvalida);
    }
  });

  it('rechaza una extensión con espacios o rarezas', () => {
    expect(() => rutaDeImagen('a.jpg.exe')).toThrow(ImagenDeCartaInvalida);
    expect(() => rutaDeImagen('a.jpg\x00.png')).toThrow(ImagenDeCartaInvalida);
  });
});

describe('nada de imagen', () => {
  it('no es un error: la carta se dibuja con su símbolo', () => {
    expect(rutaDeImagen(null)).toBeNull();
    expect(rutaDeImagen(undefined)).toBeNull();
    expect(rutaDeImagen('')).toBeNull();
    expect(imagenDeCarta(null)).toBeNull();
    expect(urlDeImagen(null)).toBeNull();
  });
});

describe('una referencia rota', () => {
  it('devuelve null, no una ruta que no existe', () => {
    /* La base puede decir que hay imagen y el archivo no estar, si alguien lo
       borró de la carpeta. Devolver la ruta haría que el PDF fallara al
       incrustar. Devolver null deja que la carta se dibuje con su símbolo. */
    expect(imagenDeCarta('no-existe-esta-carta.jpg')).toBeNull();
    expect(urlDeImagen('no-existe-esta-carta.jpg')).toBeNull();
  });

  it('pero un nombre inválido sí es un error, aunque el archivo falte', () => {
    /* La diferencia importa: un nombre malicioso es un error de datos que hay
       que ver; un archivo que falta es una referencia vieja. */
    expect(() => imagenDeCarta('../package.json')).toThrow(ImagenDeCartaInvalida);
  });
});

describe('la carpeta de imágenes', () => {
  it('se puede listar, y no incluye los archivos que no son imágenes', () => {
    const hay = imagenesDisponibles();
    for (const n of hay) {
      expect(/\.(jpe?g|png|webp)$/i.test(n), n).toBe(true);
    }
    /* El README está en la carpeta y no es una imagen. */
    expect(hay).not.toContain('README.md');
  });
});

describe('con una imagen posta en la carpeta', () => {
  const nombre = 'zzz-carta-de-prueba.png';
  /* Un PNG de 1x1, válido y mínimo. */
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeAll(() => {
    fs.mkdirSync(CARDS_DIR, { recursive: true });
    fs.writeFileSync(path.join(CARDS_DIR, nombre), PNG_1x1);
  });

  afterAll(() => {
    fs.rmSync(path.join(CARDS_DIR, nombre), { force: true });
  });

  it('se encuentra el archivo y se arma la URL', () => {
    expect(imagenDeCarta(nombre)).not.toBeNull();
    const url = urlDeImagen(nombre);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^\/assets\/cards\//);
    expect(url).toContain(encodeURIComponent(nombre));
  });

  it('aparece en el listado', () => {
    expect(imagenesDisponibles()).toContain(nombre);
  });
});
