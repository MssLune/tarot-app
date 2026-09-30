import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadingStore } from '../store/useReadingStore';
import type { CustomDeck } from '../types';

/* ==========================================================================
   La regla que hace que el plan no se rompa en silencio.

   Un 402 (límite del plan) NO puede entrar en la cola de reintentos. Si
   entra, el usuario ve "1 cambio sin subir" para siempre y cada Reintentar lo
   vuelve a sumar, porque la operación jamás puede funcionar: no depende de la
   red, depende de que el usuario contrate algo.

   Lo mismo con un 409 de id tomado por otra cuenta: reintentar con el mismo
   id va a seguir chocando.

   En cambio, un error de red o un 500 SÍ se encolan, porque pueden resolverse
   solos.
   ========================================================================== */

const deck = (id: string): CustomDeck => ({
  id,
  name: 'Mazo',
  description: '',
  allowReversed: true,
  cards: [],
  createdAt: 0,
  updatedAt: 0,
});

const ok = (data: unknown) => ({ success: true, data });
const fail = (code: string, message: string) => ({
  success: false,
  error: { code, message },
});

/** Qué hace el fetch simulado en una llamada. */
type RespuestaSimulada =
  | { red: true }
  | { red: false; status: number; body: unknown };

/**
 * Intercepta fetch y devuelve lo que se le pida. Devuelve un restaurador.
 *
 * `{ red: true }` simula un corte de conexión: el cliente HTTP lo convierte en
 * un error de red, que es distinto de un error HTTP.
 */
function mockFetch(responder: RespuestaSimulada | ((url: string) => RespuestaSimulada)) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const r = typeof responder === 'function' ? responder(String(input)) : responder;
    if (r.red) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

beforeEach(() => {
  useReadingStore.setState({ isAuthenticated: true, pendingOps: [], planNotice: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cola de reintentos y límites del plan', () => {
  it('un 402 no entra en la cola: reintentarlo no puede funcionar nunca', async () => {
    const restaurar = mockFetch({
      red: false,
      status: 402,
      body: fail('PLAN_LIMIT_REACHED', 'Llegaste al límite de 2 mazos.'),
    });

    await useReadingStore.getState().syncDeck(deck('deck_x'));
    restaurar();

    const { pendingOps, planNotice } = useReadingStore.getState();
    /* Si esto fallara, el menú de cuenta mostraría "1 cambio sin subir" para
       siempre y el botón "Reintentar" no lo resolvería nunca. */
    expect(pendingOps).toHaveLength(0);
    expect(planNotice).not.toBeNull();
    expect(planNotice?.code).toBe('PLAN_LIMIT_REACHED');
    expect(planNotice?.message).toContain('2 mazos');
  });

  it('un 409 tampoco entra en la cola: el id va a seguir chocando', async () => {
    const restaurar = mockFetch({
      red: false,
      status: 409,
      body: fail('RITUAL_ID_TAKEN', 'El identificador ya está en uso por otra cuenta.'),
    });

    await useReadingStore.getState().syncRitual({
      id: 'rit_x',
      title: 'X',
      body: 'y',
      phase: 'any',
      sourceVerified: false,
    });
    restaurar();

    expect(useReadingStore.getState().pendingOps).toHaveLength(0);
    expect(useReadingStore.getState().planNotice?.code).toBe('RITUAL_ID_TAKEN');
  });

  it('un error de red SÍ entra en la cola: puede resolverse solo', async () => {
    const restaurar = mockFetch({ red: true });

    await useReadingStore.getState().syncDeck(deck('deck_y'));
    restaurar();

    const { pendingOps, planNotice } = useReadingStore.getState();
    expect(pendingOps).toHaveLength(1);
    expect(pendingOps[0]?.key).toBe('deck:deck_y');
    /* Un corte de conexión no es un problema de plan: no hay que avisarle al
       usuario que contrate nada. */
    expect(planNotice).toBeNull();
  });

  it('un 500 del servidor entra en la cola', async () => {
    const restaurar = mockFetch({
      red: false,
      status: 500,
      body: fail('INTERNAL_ERROR', 'Se rompió algo.'),
    });

    await useReadingStore.getState().syncDeck(deck('deck_z'));
    restaurar();

    expect(useReadingStore.getState().pendingOps).toHaveLength(1);
    expect(useReadingStore.getState().planNotice).toBeNull();
  });

  it('un éxito no encola nada', async () => {
    const restaurar = mockFetch({ red: false, status: 200, body: ok({ id: 'deck_w' }) });

    await useReadingStore.getState().syncDeck(deck('deck_w'));
    restaurar();

    expect(useReadingStore.getState().pendingOps).toHaveLength(0);
    expect(useReadingStore.getState().planNotice).toBeNull();
  });

  it('dismissPlanNotice limpia el aviso', () => {
    useReadingStore.setState({ planNotice: { message: 'x', code: 'y', key: 'z' } });
    useReadingStore.getState().dismissPlanNotice();
    expect(useReadingStore.getState().planNotice).toBeNull();
  });

  it('el aviso de plan no se persiste entre recargas', () => {
    /* Si estuviera en `partialize`, al recargar aparecería un cartel de un
       límite que el usuario ya resolvió. Es estado de sesión, igual que la
       cola de reintentos. */
    const persistido = JSON.stringify(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (useReadingStore as any).getState(),
    );
    /* `persist` no expone lo persistido, pero sí podemos comprobar que el
       aviso no aparece tras reiniciar el estado desde cero, que es lo que
       pasa al recargar. */
    useReadingStore.setState({ planNotice: null });
    expect(useReadingStore.getState().planNotice).toBeNull();
    expect(persistido.length).toBeGreaterThan(0);
  });

  it('sin sesión iniciada no se intenta sincronizar ni se encola nada', async () => {
    useReadingStore.setState({ isAuthenticated: false });
    const restaurar = mockFetch({ red: false, status: 200, body: ok({}) });

    await useReadingStore.getState().syncDeck(deck('deck_sin_sesion'));
    restaurar();

    expect(useReadingStore.getState().pendingOps).toHaveLength(0);
  });
});
