import { describe, expect, it } from 'vitest';
import { createUserDeck, upsertUserDeck } from '../services/userService';

/* ==========================================================================
   Imágenes de las cartas de un mazo propio.

   La validación corre antes de tocar la base, así que una imagen mala se
   rechaza con 400 y el mazo no llega a escribirse.
   ========================================================================== */

const mazo = (imageUrl: unknown) => ({
  name: 'Mazo con imágenes',
  allowReversed: true,
  cards: [{ id: 'c1', name: 'La Sanadora' }, { id: 'c2', name: 'Lobo', imageUrl }],
});

describe('imageUrl en las cartas', () => {
  it.each([
    ['http://ejemplo.com/a.jpg'],
    ['data:image/png;base64,AAAA'],
    ['javascript:alert(1)'],
    ['no es una dirección'],
    [`https://ejemplo.com/${'a'.repeat(2100)}.jpg`],
    [42],
  ])('rechaza %s', async (url) => {
    await expect(createUserDeck('user_x', mazo(url) as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'DECK_INVALID',
      message: expect.stringContaining('carta 2'),
    });
    await expect(upsertUserDeck('user_x', 'deck_x', mazo(url) as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
