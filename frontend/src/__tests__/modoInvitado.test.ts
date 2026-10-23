import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadingStore } from '../store/useReadingStore';
import type { Spread } from '../types';

/* ==========================================================================
   Modo invitado.

   Sin sesión la app se usa (lecturas con tiradas predeterminadas, la Luna),
   pero NADA se guarda en el navegador: lo vería quien use el equipo después.
   Lo que se guarda pide cuenta, y la lectura que el invitado quiso guardar se
   guarda en cuanto inicia sesión, aunque la página se recargue en el medio.
   ========================================================================== */

/* sessionStorage simulado: el setup de los tests sólo trae localStorage. */
const sesion = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sesion.get(k) ?? null,
  setItem: (k: string, v: string) => void sesion.set(k, v),
  removeItem: (k: string) => void sesion.delete(k),
  clear: () => sesion.clear(),
  key: () => null,
  length: 0,
} as Storage);

/* Las llamadas a la API no importan aquí: respuesta vacía siempre. */
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })),
);

const tirada: Spread = {
  id: 'tres-cartas',
  name: 'Tres cartas',
  description: '',
  positions: [{ id: 'p1', name: 'Pasado', meaning: '', x: 0, y: 0 }],
} as unknown as Spread;

/** Deja una lectura a medio hacer, como en la pantalla de resultado. */
function lecturaEnCurso() {
  useReadingStore.setState({
    system: 'rider-waite',
    spread: tirada,
    cards: { p1: { positionId: 'p1', arcanaId: 'el-loco', reversed: false } },
    question: '¿Qué viene?',
    screen: 'result',
  });
}

beforeEach(() => {
  sesion.clear();
  useReadingStore.getState().limpiarDatosLocales();
  useReadingStore.setState({ isAuthenticated: false, authView: null, authMotivo: null });
});

describe('sin sesión', () => {
  it('guardar una lectura NO la guarda: abre el inicio de sesión con el motivo', () => {
    lecturaEnCurso();
    useReadingStore.getState().saveReading('Mi lectura');

    const s = useReadingStore.getState();
    expect(s.history).toEqual([]);
    expect(s.authView).toBe('sign-in');
    expect(s.authMotivo).toMatch(/guardar esta lectura/);
    /* Y nada en el navegador que vea el próximo usuario. */
    expect(localStorage.getItem('arcana-storage-v1') ?? '').not.toContain('Mi lectura');
  });

  it('"Seguir sin cuenta" cierra la pantalla y descarta la lectura apartada', () => {
    lecturaEnCurso();
    useReadingStore.getState().saveReading();
    useReadingStore.getState().cerrarCuenta();

    expect(useReadingStore.getState().authView).toBeNull();
    expect(sesion.size).toBe(0);
  });

  it('el mazo propio, la tirada personalizada y los rituales piden cuenta', () => {
    const store = useReadingStore.getState();

    store.chooseSystem('custom-deck');
    expect(useReadingStore.getState().screen).not.toBe('decks');
    expect(useReadingStore.getState().authView).toBe('sign-in');

    useReadingStore.setState({ authView: null });
    store.startNewSpread();
    expect(useReadingStore.getState().screen).not.toBe('builder');
    expect(useReadingStore.getState().authView).toBe('sign-in');

    useReadingStore.setState({ authView: null });
    store.saveRitual({ id: 'r1', title: 'Ritual', body: '...', phase: 'any' } as never);
    expect(useReadingStore.getState().rituals).toEqual([]);
    expect(useReadingStore.getState().authView).toBe('sign-in');
  });

  it('Rider-Waite y Oráculo se usan sin cuenta', () => {
    useReadingStore.getState().chooseSystem('rider-waite');
    expect(useReadingStore.getState().screen).toBe('spread');
    expect(useReadingStore.getState().authView).toBeNull();
  });

  it('navegar a otra pantalla cierra la pantalla de cuenta', () => {
    useReadingStore.getState().pedirCuenta();
    useReadingStore.getState().goTo('rituals');
    expect(useReadingStore.getState().authView).toBeNull();
  });
});

describe('al iniciar sesión después de tocar Guardar', () => {
  it('la lectura apartada se guarda en la cuenta y se vuelve a ella', () => {
    lecturaEnCurso();
    useReadingStore.getState().saveReading('Mi lectura');

    /* Simula la recarga que puede hacer Clerk al iniciar sesión: el estado
       de la lectura en curso se pierde, sólo queda lo apartado. */
    useReadingStore.setState({ spread: null, cards: {}, system: null, screen: 'system' });

    useReadingStore.setState({ isAuthenticated: true });
    useReadingStore.getState().completarGuardadoPendiente();

    const s = useReadingStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].title).toBe('Mi lectura');
    expect(s.history[0].question).toBe('¿Qué viene?');
    expect(s.screen).toBe('result');
    expect(s.spread?.id).toBe('tres-cartas');
    expect(s.lecturaRecienGuardada).toBe(true);
    expect(sesion.size).toBe(0);
  });

  it('sin lectura apartada, iniciar sesión no guarda nada', () => {
    useReadingStore.setState({ isAuthenticated: true });
    useReadingStore.getState().completarGuardadoPendiente();
    expect(useReadingStore.getState().history).toEqual([]);
  });
});
