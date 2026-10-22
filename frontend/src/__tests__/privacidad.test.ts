import { beforeEach, describe, expect, it } from 'vitest';
import { useReadingStore } from '../store/useReadingStore';
import type { Reading } from '../types';

/* ==========================================================================
   Los datos del navegador tienen dueño.

   Antes el historial, los mazos, las tiradas y los rituales se guardaban en
   el navegador sin saber de quién eran: seguían visibles después de cerrar
   sesión, y si otra persona iniciaba sesión en el mismo equipo, se SUBÍAN A
   SU CUENTA. Estos tests fijan la regla nueva.
   ========================================================================== */

const lectura = (id: string) => ({ id, createdAt: 0, system: 'rider-waite' }) as unknown as Reading;

/** Lo que quedó escrito en localStorage (lo que lee `migrateLocalData`). */
function enElNavegador(): { history: Reading[]; ownerId: string | null } {
  const raw = localStorage.getItem('arcana-storage-v1');
  const state = raw ? (JSON.parse(raw).state as { history?: Reading[]; ownerId?: string | null }) : {};
  return { history: state.history ?? [], ownerId: state.ownerId ?? null };
}

beforeEach(() => {
  useReadingStore.getState().limpiarDatosLocales();
});

describe('al iniciar sesión', () => {
  it('si los datos son de OTRA cuenta, se descartan antes de subir nada', () => {
    useReadingStore.setState({ history: [lectura('de_ana')], ownerId: 'user_ana' });

    useReadingStore.getState().prepararSesion('user_beto');

    expect(useReadingStore.getState().history).toEqual([]);
    expect(useReadingStore.getState().ownerId).toBe('user_beto');
    /* Y en el navegador tampoco: `migrateLocalData` lee de acá. */
    expect(enElNavegador().history).toEqual([]);
  });

  it('si son de la misma cuenta, se conservan', () => {
    useReadingStore.setState({ history: [lectura('mia')], ownerId: 'user_ana' });

    useReadingStore.getState().prepararSesion('user_ana');

    expect(useReadingStore.getState().history.map((r) => r.id)).toEqual(['mia']);
  });

  it('los datos de antes de las cuentas (sin dueño) se adoptan una vez', () => {
    useReadingStore.setState({ history: [lectura('vieja')], ownerId: null });

    useReadingStore.getState().prepararSesion('user_ana');

    expect(useReadingStore.getState().history.map((r) => r.id)).toEqual(['vieja']);
    expect(enElNavegador().ownerId).toBe('user_ana');

    /* Y a partir de ahí son de Ana: si entra otra persona, no los ve. */
    useReadingStore.getState().prepararSesion('user_beto');
    expect(useReadingStore.getState().history).toEqual([]);
  });
});

describe('al cerrar sesión', () => {
  it('limpiarDatosLocales borra todo lo de la cuenta del navegador', () => {
    useReadingStore.setState({
      history: [lectura('a')],
      customDecks: [{ id: 'd' }] as never,
      customSpreads: [{ id: 's' }] as never,
      rituals: [{ id: 'r' }] as never,
      ownerId: 'user_ana',
    });

    useReadingStore.getState().limpiarDatosLocales();

    const s = useReadingStore.getState();
    expect([s.history, s.customDecks, s.customSpreads, s.rituals]).toEqual([[], [], [], []]);
    expect(s.ownerId).toBeNull();
    expect(enElNavegador()).toEqual({ history: [], ownerId: null });
  });
});
