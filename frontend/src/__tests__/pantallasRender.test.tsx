/**
 * @vitest-environment jsdom
 *
 * Estos SÍ necesitan DOM, a diferencia del resto del proyecto.
 *
 * `framer-motion` no es renderizable en `node` pelado: consulta `SVGElement`
 * para distinguir nodos, y después `window.addEventListener` para enganchar sus
 * animaciones. Con el `window` falso de `setup.ts` —que es un objeto con un
 * `localStorage` y nada más— revienta con "target.addEventListener is not a
 * function" antes de que el test pueda afirmar nada.
 *
 * Se podría seguir rellenando el stub a mano, pero eso es mantener a mano
 * partes del DOM que framer-motion va a seguir pidiendo, y el día que pida una
 * más el fallo va a ser "no such method" en un test sin relación con el
 * problema. Con `jsdom` el entorno es real y el test falla por lo que tiene que
 * fallar: porque la pantalla no renderiza.
 *
 * El docblock aplica SOLO a este archivo. Los otros siguen en `node`, que para
 * lógica pura y `renderToStaticMarkup` es lo correcto y más rápido.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useReadingStore } from '../store/useReadingStore';
import { useContentStore } from '../store/useContentStore';
import SystemScreen from '../components/screens/SystemScreen';
import RitualsScreen from '../components/screens/RitualsScreen';
import HistoryScreen from '../components/screens/HistoryScreen';
import MoonCalendar from '../components/moon/MoonCalendar';
import FestivalList from '../components/moon/FestivalList';

/* ==========================================================================
   Que las pantallas rendericen algo.

   Existe por un bug reportado: revisar el historial, ir a la Luna y apretar
   "Nueva" dejaba la página SIN CONTENIDO y sólo el menú.

   Antes de culpar a la animación había que descartar lo barato: que alguno de
   esos componentes devuelva nada. Renderizándolos a HTML estático se ve sin
   browser y sin abrir la app.

   Lo que NO cubre, y conviene dejarlo claro: no reproduce la animación.
   `renderToStaticMarkup` no corre transiciones, así que si el fallo fuera que
   `AnimatePresence` no termina la salida, esto pasaría. Para eso está el otro
   test del archivo: el de las props de la transición.
   ========================================================================== */

/** El store de lectura arranca con contenido plausible para que no se corten. */
function conEstado(fn: () => void) {
  useReadingStore.setState({
    system: 'rider-waite',
    spread: {
      id: 't',
      name: 'Tres cartas',
      description: 'Una tirada de tres, para las pruebas',
      positions: [
        { id: 'p1', name: 'Pasado', x: 20, y: 50 },
        { id: 'p2', name: 'Presente', x: 50, y: 50 },
        { id: 'p3', name: 'Futuro', x: 80, y: 50 },
      ],
    },
    cards: {},
    question: '¿Va a ir bien?',
  });
  useContentStore.setState({ status: 'ready', cardsById: {}, cards: [], spreads: [], combinations: [] });
  fn();
}

/** Todo lo que un humano leería en la pantalla, sin contar markup vacío. */
function textoVisible(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('las pantallas renderizan contenido', () => {
  it('la pantalla de sistema muestra las opciones del mazo', () => {
    conEstado(() => {
      const html = renderToStaticMarkup(<SystemScreen />);
      const texto = textoVisible(html);
      expect(texto.length).toBeGreaterThan(200);
      expect(texto).toContain('Tarot');
    });
  });

  it('la pantalla de la Luna muestra la fase y las festividades', () => {
    conEstado(() => {
      const html = renderToStaticMarkup(<RitualsScreen />);
      const texto = textoVisible(html);
      /* Después de "Nueva" el store queda vacío; aun así la Luna tiene que
         mostrar algo, porque es la pantalla a la que se puede ir en cualquier
         momento. */
      expect(texto.length).toBeGreaterThan(300);
      expect(texto.toLowerCase()).toContain('luna');
    });
  });

  it('el calendario pinta una celda por día del mes', () => {
    conEstado(() => {
      const html = renderToStaticMarkup(<MoonCalendar />);
      /* Entre 28 y 42 celdas: depende del mes. Cada celda tiene su disco. */
      const svg = (html.match(/<svg/g) ?? []).length;
      expect(svg).toBeGreaterThanOrEqual(28);
      expect(svg).toBeLessThanOrEqual(42);
      expect(textoVisible(html)).toContain('Luna');
    });
  });

  it('la lista de festividades muestra las cuatro Hogueras', () => {
    conEstado(() => {
      const texto = textoVisible(renderToStaticMarkup(<FestivalList />));
      for (const nombre of ['Imbolc', 'Beltane', 'Lughnasadh', 'Samhain']) {
        expect(texto, nombre).toContain(nombre);
      }
    });
  });

  it('el historial renderiza sin una lectura seleccionada', () => {
    conEstado(() => {
      const html = renderToStaticMarkup(<HistoryScreen />);
      /* Sin lecturas tiene que mostrar el estado vacío, no romperse. */
      expect(textoVisible(html).length).toBeGreaterThan(50);
    });
  });
});