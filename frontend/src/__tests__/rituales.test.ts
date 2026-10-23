import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReadingStore } from '../store/useReadingStore';
import type { Ritual } from '../types';

/* ==========================================================================
   Rituales de la pantalla Luna, en el store.

   - Lo que se manda a la API lleva los opcionales vacíos como null: el PUT
     deja como está lo que no viene, y omitir una nota borrada la dejaba
     guardada en el servidor.
   - Hecho / pendiente se guarda (completedAt) y se sincroniza.
   - Si el servidor rechaza la creación por el tope del plan (402), el ritual
     NO queda en la lista como si se hubiera guardado.
   ========================================================================== */

const ritual = (over: Partial<Ritual> = {}): Ritual => ({
  id: 'rit_1',
  title: 'Vela de Luna Nueva',
  body: 'Encender y escribir la intención.',
  phase: 'new',
  sourceVerified: false,
  ...over,
});

let pedidos: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let respuesta: { status: number; body: unknown } = { status: 200, body: { success: true, data: {} } };
const original = globalThis.fetch;

beforeEach(() => {
  pedidos = [];
  respuesta = { status: 200, body: { success: true, data: {} } };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    return new Response(JSON.stringify(respuesta.body), {
      status: respuesta.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  useReadingStore.getState().limpiarDatosLocales();
  useReadingStore.setState({ isAuthenticated: true, pendingOps: [], planNotice: null });
});

afterEach(() => {
  globalThis.fetch = original;
});

/** Espera a que terminen las promesas de sincronización. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('guardar un ritual', () => {
  it('manda día, festividad, notas y materiales; los vacíos como null', async () => {
    useReadingStore.getState().saveRitual(
      ritual({ date: '2026-10-31', festivalId: 'samhain', notes: '  ', materials: 'Vela negra' }),
    );
    await esperar();

    const put = pedidos.find((p) => p.method === 'PUT' && p.url.includes('/user/rituals/rit_1'));
    expect(put?.body).toMatchObject({
      date: '2026-10-31',
      festivalId: 'samhain',
      materials: 'Vela negra',
      notes: null,
      source: null,
      completedAt: null,
    });
  });

  it('marcar como hecho guarda la fecha y lo sincroniza; desmarcar lo vuelve a null', async () => {
    useReadingStore.getState().saveRitual(ritual());
    await esperar();

    useReadingStore.getState().toggleRitualDone('rit_1');
    await esperar();
    const hecho = useReadingStore.getState().rituals[0];
    expect(hecho.completedAt).toBeTruthy();
    expect(pedidos[pedidos.length - 1]?.body?.completedAt).toBe(hecho.completedAt);

    useReadingStore.getState().toggleRitualDone('rit_1');
    await esperar();
    expect(useReadingStore.getState().rituals[0].completedAt).toBeNull();
    expect(pedidos[pedidos.length - 1]?.body?.completedAt).toBeNull();
  });
});

describe('el tope del plan', () => {
  it('un ritual rechazado con 402 no queda en la lista y deja el aviso', async () => {
    respuesta = {
      status: 402,
      body: { success: false, error: { code: 'PLAN_LIMIT', message: 'Llegaste al tope de 3 rituales.' } },
    };
    useReadingStore.getState().saveRitual(ritual({ id: 'rit_cuarto' }));
    expect(useReadingStore.getState().rituals).toHaveLength(1);
    await esperar();

    const s = useReadingStore.getState();
    expect(s.rituals).toEqual([]);
    expect(s.planNotice?.key).toBe('ritual:rit_cuarto');
    /* Y no entra en la cola de reintentos: reintentar no puede funcionar. */
    expect(s.pendingOps).toEqual([]);
  });
});
