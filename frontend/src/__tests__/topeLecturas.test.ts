import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReadingStore } from '../store/useReadingStore';
import type { Reading, Spread } from '../types';

/* ==========================================================================
   El tope semanal de lecturas, del lado del navegador.

   El servidor ya rechazaba la tercera lectura de la semana con un 402, pero
   el navegador la dejaba en el historial: parecía guardada y, como el merge
   de `loadUserData` conserva lo que sólo está en el navegador, quedaba ahí
   para siempre. Estos tests fijan que no pase.
   ========================================================================== */

const tirada = {
  id: 'tres',
  name: 'Tres cartas',
  description: '',
  positions: [{ id: 'p1', name: 'Pasado', x: 0, y: 0 }],
} as unknown as Spread;

let status = 200;
const original = globalThis.fetch;

beforeEach(() => {
  status = 200;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify(
        status === 402
          ? { success: false, error: { code: 'PLAN_LIMIT', message: 'Ya guardaste 2 lecturas esta semana.' } }
          : { success: true, data: [] },
      ),
      { status, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;
  useReadingStore.getState().limpiarDatosLocales();
  useReadingStore.setState({
    isAuthenticated: true,
    avisoPro: null,
    planNotice: null,
    pendingOps: [],
    system: 'rider-waite',
    spread: tirada,
    cards: { p1: { positionId: 'p1', arcanaId: 'el-loco', reversed: false } },
    question: '¿Qué viene?',
  });
});

afterEach(() => {
  globalThis.fetch = original;
});

describe('guardar con el tope alcanzado', () => {
  it('la lectura rechazada no queda en el historial y se abre el aviso del Pro', async () => {
    status = 402;
    const r = await useReadingStore.getState().saveReading('Tercera');

    const s = useReadingStore.getState();
    expect(r).toBe('limite');
    expect(s.history).toEqual([]);
    expect(s.avisoPro).toMatchObject({ recurso: 'readings', message: 'Ya guardaste 2 lecturas esta semana.' });
    expect(s.pendingOps).toEqual([]);
  });

  it('dentro del tope se guarda y no hay aviso', async () => {
    const r = await useReadingStore.getState().saveReading('Primera');
    expect(r).toBe('guardada');
    expect(useReadingStore.getState().history).toHaveLength(1);
    expect(useReadingStore.getState().avisoPro).toBeNull();
  });

  it('al abrir la app, las lecturas que el servidor no tiene se reenvían y las rechazadas salen, sin ventana', async () => {
    const huerfana = { id: 'r_vieja', createdAt: 0, system: 'rider-waite', title: 'Vieja' } as unknown as Reading;
    useReadingStore.setState({ history: [huerfana] });
    status = 402;
    /* `loadUserData` pide las listas (que devuelven 402 aquí también y van por
       su catch); el reenvío se prueba directo, como lo hace por dentro. */
    const r = await useReadingStore.getState().syncReading(huerfana, { silencioso: true });
    expect(r).toBe('limite');
    expect(useReadingStore.getState().history).toEqual([]);
    expect(useReadingStore.getState().avisoPro).toBeNull();
  });
});
