import { describe, expect, it } from 'vitest';
import { buildArchive, nombreDeArchivo } from '../lib/archive';
import type { CustomDeck, Reading, Ritual, Spread } from '../types';

/* El archivo exportado se llama según lo que lleva: antes todos eran
   `arcana-FECHA.json` y no se distinguía un mazo de un respaldo completo. */

const mazo = { id: 'd1', name: 'Mi Oráculo Lunar', cards: [] } as unknown as CustomDeck;
const tirada = { id: 's1', name: 'Cruz simple', positions: [] } as unknown as Spread;
const lectura = { id: 'r1' } as unknown as Reading;
const ritual = { id: 't1' } as unknown as Ritual;
const fecha = new Date().toISOString().slice(0, 10);

const arch = (d: CustomDeck[], s: Spread[], r: Reading[], t: Ritual[]) =>
  buildArchive({ customDecks: d, customSpreads: s, history: r, rituals: t });

describe('nombreDeArchivo', () => {
  it('un solo mazo lleva su nombre, sin tildes ni espacios', () => {
    expect(nombreDeArchivo(arch([mazo], [], [], []))).toBe(`arcana-mazo-mi-oraculo-lunar-${fecha}.json`);
  });
  it('una sola tirada lleva su nombre', () => {
    expect(nombreDeArchivo(arch([], [tirada], [], []))).toBe(`arcana-tirada-cruz-simple-${fecha}.json`);
  });
  it('sólo lecturas', () => {
    expect(nombreDeArchivo(arch([], [], [lectura], []))).toBe(`arcana-lecturas-${fecha}.json`);
  });
  it('todo es un respaldo', () => {
    expect(nombreDeArchivo(arch([mazo], [tirada], [lectura], [ritual]))).toBe(`arcana-respaldo-${fecha}.json`);
  });
  it('una mezcla lista lo que incluye', () => {
    expect(nombreDeArchivo(arch([mazo, mazo], [], [lectura], []))).toBe(`arcana-mazos-lecturas-${fecha}.json`);
  });
});
