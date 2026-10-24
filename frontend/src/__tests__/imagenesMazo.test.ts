import { describe, expect, it } from 'vitest';
import { cardImageUrl, esUrlDeImagenValida, interpret, urlDirectaDeImagen } from '@arcana/tarot-core';
import { parseArchive } from '../lib/archive';
import type { CustomDeck } from '../types';

/* ==========================================================================
   Imágenes por URL en los mazos propios: qué dirección se acepta, cómo se
   resuelve al dibujar la carta y qué pasa al importar un archivo.
   ========================================================================== */

const deck: CustomDeck = {
  id: 'deck_1',
  name: 'Mi oráculo',
  allowReversed: true,
  createdAt: 0,
  updatedAt: 0,
  cards: [
    { id: 'c1', name: 'Luna', imageUrl: 'https://ejemplo.com/luna.webp' },
    { id: 'c2', name: 'Sol' },
    { id: 'c3', name: 'Mar', imageUrl: 'http://ejemplo.com/mar.jpg' },
  ],
};

describe('esUrlDeImagenValida', () => {
  it('acepta https', () => {
    expect(esUrlDeImagenValida('https://i.imgur.com/abc.png')).toBe(true);
    expect(esUrlDeImagenValida('  https://ejemplo.com/a.jpg?v=2  ')).toBe(true);
  });
  it('rechaza http, data:, texto y direcciones larguísimas', () => {
    expect(esUrlDeImagenValida('http://ejemplo.com/a.jpg')).toBe(false);
    expect(esUrlDeImagenValida('data:image/png;base64,AAAA')).toBe(false);
    expect(esUrlDeImagenValida('mi carta')).toBe(false);
    expect(esUrlDeImagenValida('https://a b.com/x.jpg')).toBe(false);
    expect(esUrlDeImagenValida(`https://e.com/${'a'.repeat(2100)}`)).toBe(false);
    expect(esUrlDeImagenValida(undefined)).toBe(false);
  });
});

describe('cardImageUrl con mazo propio', () => {
  const carta = (deckCardId: string) => ({ positionId: 'p1', reversed: false, deckCardId });
  it('usa la imagen de la carta del mazo', () => {
    expect(cardImageUrl(carta('c1'), 'custom-deck', {}, deck)).toBe('https://ejemplo.com/luna.webp');
  });
  it('sin imagen o con una inválida, no hay URL (se dibuja el símbolo)', () => {
    expect(cardImageUrl(carta('c2'), 'custom-deck', {}, deck)).toBeUndefined();
    expect(cardImageUrl(carta('c3'), 'custom-deck', {}, deck)).toBeUndefined();
    expect(cardImageUrl(carta('c1'), 'custom-deck', {})).toBeUndefined();
  });
});

describe('importar un mazo con imágenes', () => {
  it('conserva las https y descarta las inválidas sin rechazar el archivo', () => {
    const vista = parseArchive(
      JSON.stringify({ format: 'arcana-archive', version: 2, decks: [deck] }),
    );
    const [c1, c2, c3] = vista.archive.decks[0].cards;
    expect(c1.imageUrl).toBe('https://ejemplo.com/luna.webp');
    expect(c2).not.toHaveProperty('imageUrl');
    expect(c3).not.toHaveProperty('imageUrl');
    expect(c3.name).toBe('Mar');
  });
});

describe('importar un mazo escrito a mano', () => {
  it('completa lo que falta y descarta cartas sin nombre', () => {
    const vista = parseArchive(
      JSON.stringify({
        format: 'arcana-archive',
        version: 2,
        decks: [{ id: 'd1', name: 'A mano', cards: [{ name: 'Uno' }, { id: 'x' }, 'basura', { id: 'c2', name: 'Dos' }] }],
      }),
    );
    const d = vista.archive.decks[0];
    expect(d.allowReversed).toBe(true);
    expect(typeof d.createdAt).toBe('number');
    expect(d.cards.map((c) => [c.id, c.name])).toEqual([
      ['d1_carta_1', 'Uno'],
      ['c2', 'Dos'],
    ]);
  });
});

describe('temas y sí/no en un mazo propio', () => {
  const celestial: CustomDeck = {
    id: 'deck_cel',
    name: 'Celestial',
    allowReversed: true,
    createdAt: 0,
    updatedAt: 0,
    cards: [
      {
        id: 'sol',
        name: 'El Sol',
        upright: 'Claridad y alegría.',
        loveHint: 'una relación que se muestra sin miedo',
        workHint: 'reconocimiento por tu trabajo',
        yesNo: 'si',
      },
    ],
  };
  const spread = { id: 's1', name: 'Una carta', positions: [{ id: 'p1', name: 'Mensaje', x: 50, y: 50 }] };
  const cartas = { p1: { positionId: 'p1', reversed: false, deckCardId: 'sol' } };

  it('la lectura suma el texto del tema elegido', () => {
    const amor = interpret(spread as never, cartas as never, 'custom-deck', {}, [], 'amor', '', celestial);
    expect(amor.positions[0].text).toContain('En el plano del amor: Una relación que se muestra sin miedo.');
    const salud = interpret(spread as never, cartas as never, 'custom-deck', {}, [], 'salud', '', celestial);
    expect(salud.positions[0].text).not.toContain('En el plano');
  });

  it('al importar entiende love/career/yes de otras apps', () => {
    const vista = parseArchive(
      JSON.stringify({
        format: 'arcana-archive',
        version: 2,
        decks: [
          {
            id: 'd2',
            name: 'Celestial',
            cards: [
              { id: 'luna', name: 'La Luna', love: 'Dudas en la pareja', career: 'Falta información', health: 'Descanso', yesNo: 'Maybe' },
              { id: 'x', name: 'X', yesNo: 'tal vez no' },
            ],
          },
        ],
      }),
    );
    const [luna, x] = vista.archive.decks[0].cards;
    expect(luna).toMatchObject({ loveHint: 'Dudas en la pareja', workHint: 'Falta información', healthHint: 'Descanso', yesNo: 'incierto' });
    expect(luna).not.toHaveProperty('love');
    expect(x).not.toHaveProperty('yesNo');
  });
});

describe('enlaces para compartir → enlace directo', () => {
  it('Google Drive', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
    const directo = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    expect(urlDirectaDeImagen(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(directo);
    expect(urlDirectaDeImagen(`https://drive.google.com/open?id=${id}`)).toBe(directo);
    expect(urlDirectaDeImagen(`https://drive.google.com/uc?export=view&id=${id}`)).toBe(directo);
  });
  it('Dropbox e Imgur', () => {
    expect(urlDirectaDeImagen('https://www.dropbox.com/s/abc/sol.jpg?dl=0')).toBe('https://www.dropbox.com/s/abc/sol.jpg?raw=1');
    expect(urlDirectaDeImagen('https://www.dropbox.com/scl/fi/x/sol.png?rlkey=k&dl=0')).toBe('https://www.dropbox.com/scl/fi/x/sol.png?rlkey=k&raw=1');
    expect(urlDirectaDeImagen('https://imgur.com/aBc123X')).toBe('https://i.imgur.com/aBc123X.jpg');
  });
  it('una dirección directa queda igual', () => {
    expect(urlDirectaDeImagen('https://i.imgur.com/aBc123X.png')).toBe('https://i.imgur.com/aBc123X.png');
    expect(urlDirectaDeImagen('https://ejemplo.com/sol.webp')).toBe('https://ejemplo.com/sol.webp');
  });
});
