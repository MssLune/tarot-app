import type { LayoutPreset } from '../types';

/* ==========================================================================
   Generadores de layout para el creador de tiradas personalizadas.
   Esto es lógica de UI, no contenido: las tiradas predefinidas en sí
   (nombre, descripción, posiciones) ahora se sirven desde la API — ver
   `services/spreadsService.ts` y `store/useContentStore.ts`.
   Devuelven coordenadas en % listas para el lienzo.
   -------------------------------------------------------------------------- */

export const LAYOUT_PRESETS: { id: LayoutPreset; label: string; hint: string }[] = [
  { id: 'line', label: 'Línea', hint: 'Horizontal, tipo línea de tiempo' },
  { id: 'cross', label: 'Cruz', hint: 'Centro con brazos alrededor' },
  { id: 'circle', label: 'Círculo', hint: 'Ciclo cerrado' },
  { id: 'grid', label: 'Grilla', hint: 'Filas y columnas ordenadas' },
  { id: 'pyramid', label: 'Pirámide', hint: 'Base amplia hacia una cima' },
  { id: 'free', label: 'Libre', hint: 'Ubicás cada carta a mano' },
];

/**
 * Calcula las coordenadas de `count` posiciones según el layout pedido.
 * Todos los valores quedan dentro de un margen seguro (12-88) para que
 * las cartas nunca se corten en los bordes del lienzo.
 */
export function generateLayout(preset: LayoutPreset, count: number): { x: number; y: number }[] {
  const clamp = (v: number) => Math.max(10, Math.min(90, Math.round(v * 10) / 10));

  if (count <= 0) return [];
  if (count === 1) return [{ x: 50, y: 50 }];

  switch (preset) {
    case 'line': {
      // Si son muchas, parte en dos filas para no comprimir demasiado.
      if (count <= 5) {
        const step = 76 / (count - 1);
        return Array.from({ length: count }, (_, i) => ({ x: clamp(12 + step * i), y: 50 }));
      }
      const perRow = Math.ceil(count / 2);
      return Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const inRow = row === 0 ? perRow : count - perRow;
        const step = inRow > 1 ? 74 / (inRow - 1) : 0;
        return { x: clamp(inRow > 1 ? 13 + step * col : 50), y: row === 0 ? 30 : 72 };
      });
    }

    case 'cross': {
      // Centro + brazos (arriba, derecha, abajo, izquierda) y luego diagonales.
      const ring = [
        { x: 50, y: 50 },
        { x: 50, y: 18 },
        { x: 84, y: 50 },
        { x: 50, y: 82 },
        { x: 16, y: 50 },
        { x: 78, y: 24 },
        { x: 78, y: 76 },
        { x: 22, y: 76 },
        { x: 22, y: 24 },
      ];
      return Array.from({ length: count }, (_, i) =>
        i < ring.length ? ring[i] : { x: clamp(30 + (i % 3) * 20), y: clamp(40 + Math.floor(i / 3) * 14) },
      );
    }

    case 'circle': {
      // Elipse más ancha que alta: separa las cartas horizontalmente para que
      // el rótulo de una no quede tapado por la carta siguiente del círculo.
      const rx = 38;
      const ry = 29;
      return Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        return { x: clamp(50 + rx * Math.cos(angle)), y: clamp(50 + ry * Math.sin(angle)) };
      });
    }

    case 'pyramid': {
      // Filas crecientes desde la cima: 1, 2, 3, 4...
      const rows: number[][] = [];
      let placed = 0;
      let size = 1;
      while (placed < count) {
        const take = Math.min(size, count - placed);
        rows.push(Array.from({ length: take }, (_, i) => placed + i));
        placed += take;
        size += 1;
      }
      const coords: { x: number; y: number }[] = [];
      const rowStep = rows.length > 1 ? 62 / (rows.length - 1) : 0;
      rows.forEach((row, rIdx) => {
        const y = rows.length > 1 ? 18 + rowStep * rIdx : 50;
        const colStep = row.length > 1 ? 66 / (row.length - 1) : 0;
        row.forEach((_, cIdx) => {
          coords.push({ x: clamp(row.length > 1 ? 17 + colStep * cIdx : 50), y: clamp(y) });
        });
      });
      return coords;
    }

    case 'grid':
    default: {
      const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
      const rows = Math.ceil(count / cols);
      return Array.from({ length: count }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const xStep = cols > 1 ? 66 / (cols - 1) : 0;
        const yStep = rows > 1 ? 62 / (rows - 1) : 0;
        return {
          x: clamp(cols > 1 ? 17 + xStep * c : 50),
          y: clamp(rows > 1 ? 19 + yStep * r : 50),
        };
      });
    }
  }
}
