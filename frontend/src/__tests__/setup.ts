import { vi } from 'vitest';

/* ==========================================================================
   Entorno de los tests.

   Los tests corren en `node`, no en `jsdom`: son de lógica pura y de
   renderizado con `react-dom/server`, y el DOM no aporta nada ahí. Pero
   zustand `persist` busca `localStorage` al importarse y, si no lo encuentra,
   avisa en stderr en cada escritura. Ese ruido tapa los errores reales, así
   que se le da un almacen inofensivo.

   Este archivo tiene que estar en `setupFiles` y no dentro del propio test:
   los imports se evalúan antes que el código del módulo, así que un stub
   escrito en el test llega tarde y zustand ya capturó el `undefined`.
   ========================================================================== */

const almacenEnMemoria = new Map<string, string>();

const localStorageFalso: Storage = {
  getItem: (k: string) => almacenEnMemoria.get(k) ?? null,
  setItem: (k: string, v: string) => void almacenEnMemoria.set(k, String(v)),
  removeItem: (k: string) => void almacenEnMemoria.delete(k),
  clear: () => almacenEnMemoria.clear(),
  key: (i: number) => [...almacenEnMemoria.keys()][i] ?? null,
  get length() {
    return almacenEnMemoria.size;
  },
};

vi.stubGlobal('localStorage', localStorageFalso);

/* Hace falta `window` además de `localStorage`: el middleware `persist` de
   zustand escribe literalmente `window.localStorage`, no `localStorage`. Con
   sólo el global, el almacen sigue sin existir y cada escritura del store
   avisa por stderr. */
vi.stubGlobal('window', { localStorage: localStorageFalso });

/* Clerk se mockea entero. En estos tests la autenticación es irrelevante, y
   sin este mock el `getToken()` que llama el cliente HTTP busca un contexto de
   Clerk que no existe y la promesa nunca resuelve: los tests dan timeout en
   lugar de fallar. Es peor que un mock: es un cuelgue sin diagnóstico. */
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, signOut: vi.fn() }),
  useClerk: () => ({ user: null, signOut: vi.fn() }),
  useSession: () => ({ session: null }),
  ClerkProvider: ({ children }: { children: unknown }) => children,
  Show: ({ children }: { children: unknown }) => children,
  getToken: vi.fn(async () => null),
}));

/* fetch se sustituye en cada test que lo necesita. Se deja sin tocar por
   defecto para que un test que olvide interceptarlo falle en vez de hacer una
   petición real a la red. */
if (!globalThis.fetch) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(
        'fetch no interceptado en el test. Si querés probar una llamada a la API, ' +
          'reemplazá globalThis.fetch por una versión que devuelva la respuesta.',
      );
    }),
  );
}
