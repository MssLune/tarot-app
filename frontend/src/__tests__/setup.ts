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
   avisa por stderr.

   OJO con pisar `window` entero. En los tests que corren con `jsdom` —los que
   renderizan pantallas con `framer-motion`— ya hay un `window` real, y
   reemplazarlo por `{ localStorage }` le saca `addEventListener` y compañía:
   el fallo sale como "target.addEventListener is not a function" en un test que
   no tiene nada que ver con el DOM. Así que acá sólo se COMPLETA el window que
   ya exista, y se lo pisa entero únicamente en `node`, donde no hay ninguno. */
if (typeof globalThis.window === 'undefined') {
  vi.stubGlobal('window', { localStorage: localStorageFalso });
} else {
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: localStorageFalso,
    configurable: true,
    writable: true,
  });
}

/* `framer-motion` consulta `SVGElement` al renderizar, para distinguir si un
   nodo es SVG o HTML. En `node` ese constructor no existe y revienta con
   "SVGElement is not defined" antes de que el test pueda afirmar nada.

   Se define una clase vacía en vez de cambiar el entorno a `jsdom`: estos tests
   van con `react-dom/server`, que no necesita DOM, y `jsdom` los haría más
   lentos sin aportar nada. La clase no se usa para nada: sólo tiene que
   existir y que `instanceof` no tire. */
if (typeof globalThis.SVGElement === 'undefined') {
  class SVGElementFalso {}
  vi.stubGlobal('SVGElement', SVGElementFalso);
}

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
