import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Glyph from '../ui/Glyph';

/* ==========================================================================
   Selector de carta: overlay con búsqueda y filtros por categoría.

   Por qué es un overlay y no una lista en el flujo del formulario:
   con 78 cartas, la lista completa empujaba el resto de la pantalla fuera de
   vista y obligaba a hacer scroll para llegar al botón de continuar. Montada
   en un portal, la lista flota sobre la página, sin ser recortada por los
   contenedores de scroll intermedios.

   Por qué sólo aparece al enfocar: en reposo el campo es un control compacto;
   la lista aparece recién al hacer clic, que es cuando la estás buscando.

   La búsqueda por texto ayuda si te acordás del nombre. Los filtros por
   categoría ayudan cuando no: "era una carta de/arcanos mayores", "era una
   sota de bastos". Para eso están los ejes de `facets`, que define quien usa
   el componente: AcuérdateLa estructura:

   - El campo (`expanded=false`) es un botón compacto con la carta elegida.
   - `open=true` muestra el panel flotante con búsqueda, filtros y resultados.
   - Los resultados son una lista plana con encabezados de grupo, navegable
     con flechas y Enter, y se autoscrollea para mantener visible el elemento
     activo.
   ========================================================================== */

export interface PickerItem {
  id: string;
  /** Nombre principal. */
  label: string;
  /** Texto auxiliar: rango, palo, subtítulo. */
  hint?: string;
  /** Glifo a dibujar. */
  glyph?: string;
  /**
   * URL de la imagen de la carta, si tiene.
   *
   * Opcional: sin imagen se dibuja el glifo, que es como funcionaba antes.
   */
  imageUrl?: string;
  /** Campos extra por los que también se puede buscar (significado, keywords). */
  keywords?: string[];
  /** Texto ya conocido de la carta (significado escrito por el usuario). */
  meaning?: string;
  /** Si ya está en uso en otra posición, no se puede elegir. */
  disabled?: boolean;
  disabledHint?: string;
  /**
   * Valores de los ejes de filtro que aplican a esta carta, indexados por
   * `PickerFacet.key`. Un eje cuyo valor no está en el objeto no aplica.
   * Ej: { arcanaType: 'mayor' } — una carta mayor no tiene palo.
   */
  facets?: Record<string, string | undefined>;
}

export interface PickerGroup {
  label: string;
  items: PickerItem[];
}

/** Eje de filtrado configurable (tipo, palo, rango, lo que haga falta). */
export interface PickerFacet {
  /** Identificador del eje; debe coincidir con la clave en `PickerItem.facets`. */
  key: string;
  /** Etiqueta del grupo de botones. */
  label: string;
  /** Opciones, en el orden en que se muestran. */
  options: { value: string; label: string }[];
}

interface CardPickerProps {
  id: string;
  /** Grupos a mostrar, o lista plana si no se agrupa. */
  groups: PickerGroup[];
  /** Ejes de filtrado. Si se omite, el componente sólo busca por texto. */
  facets?: PickerFacet[];
  /** Id de la carta elegida en esta posición (para marcarla). */
  selectedId?: string;
  placeholder?: string;
  emptyText?: string;
  onSelect: (itemId: string) => void;
}

/** Normaliza: minúsculas y sin acentos, para que "sabiduria" encuentre
 *  "sabiduría" y el usuario no tenga que acordarse de los tildes. */
const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Cuánto texto se busca por carta, una sola vez y normalizado. */
const buildHaystack = (item: PickerItem) =>
  [item.label, item.hint ?? '', item.meaning ?? '', ...(item.keywords ?? [])]
    .map(normalize)
    .join(' ');

/** Margen mínimo contra el borde de la ventana, en píxeles. */
const MARGIN = 8;
/** Separación entre el campo y el panel. */
const GAP = 8;
/** Alto máximo del panel. */
const MAX_HEIGHT = 380;
/** Si abajo no hay al menos esto, se abre hacia arriba. */
const MIN_BELOW = 200;

export default function CardPicker({
  id,
  groups,
  facets,
  selectedId,
  placeholder = 'Buscar carta…',
  emptyText = 'Ninguna carta coincide.',
  onSelect,
}: CardPickerProps) {
  const [query, setQuery] = useState('');
  /* El panel flotante sólo existe mientras el campo está enfocado. */
  const [open, setOpen] = useState(false);
  /* Valor elegido por eje de filtro. Sin clave o cadena vacía = sin filtrar. */
  const [facetValues, setFacetValues] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const anchorRef = useRef<HTMLDivElement>(null);
  /** Contenedor del panel en el portal: delimita el "clic fuera". */
  const panelRef = useRef<HTMLDivElement>(null);
  /** Lista de resultados con scroll propio. */
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selected = flat.find((item) => item.id === selectedId);

  /* Posición del panel respecto a la ventana. Se recalcula al abrir y en cada
     scroll o resize, porque el campo puede moverse bajo el panel.

     Se ancla por `top` al abrir hacia abajo y por `bottom` al abrir hacia
     arriba. Anclar arriba con `top` no sirve: no sabemos de antemano cuánto
     mide el panel, así que terminaría tapando el campo. Con `bottom` el borde
     inferior queda a `GAP` del campo y el panel crece hacia arriba solo. */
  const [box, setBox] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    /* Si no hay lugar abajo pero sí arriba, se abre hacia arriba. */
    const above = spaceBelow < MIN_BELOW && spaceAbove > spaceBelow;
    setBox({
      ...(above
        ? { bottom: window.innerHeight - r.top + GAP }
        : { top: r.bottom + GAP }),
      left: Math.max(MARGIN, Math.min(r.left, window.innerWidth - r.width - MARGIN)),
      width: r.width,
      maxHeight: Math.max(MIN_BELOW, Math.min(MAX_HEIGHT, above ? spaceAbove : spaceBelow)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    inputRef.current?.focus();
    const onMove = () => measure();
    /* `capture` para escuchar también el scroll de cualquier contenedor
       ancestro: el panel vive en un portal, así que no comparte scroll con
       el campo y sin esto se quedaría descolgado al hacer scroll. */
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

  /* Cerrar al hacer clic fuera o con Escape. Se usa captura porque el menú de
     cuenta también escucha Escape y queremos cerrar primero este panel. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  /* Al cambiar de posición el filtro se reinicia: este componente se remonta
     por position.id, pero lo dejamos explícito para que quede claro que el
     estado NO se comparte entre posiciones. */
  useEffect(() => {
    setQuery('');
    setFacetValues({});
    setOpen(false);
  }, [id]);

  const haystacks = useMemo(() => new Map(flat.map((item) => [item.id, buildHaystack(item)])), [flat]);

  /** ¿El item cumple los filtros de categoría? `skipKey` ignora un eje. */
  const matchesFacets = useCallback(
    (item: PickerItem, values: Record<string, string>, skipKey?: string) =>
      Object.entries(values).every(
        ([key, value]) => key === skipKey || !value || item.facets?.[key] === value,
      ),
    [],
  );

  /**
   * Descarta valores de filtro que ya no dejan ningún resultado.
   *
   * Al elegir "Arcanos Mayores" el eje "Palo" queda sin sentido: ninguna carta
   * mayor tiene palo, así que el filtro de palo se ignora y sus botones
   * desaparecen. Si después se vuelve a "Menores", el palo elegido reaparece
   * solo, que es justo lo que se quiere: te acordabas de la categoría.
   */
  const activeFacets = useMemo(() => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(facetValues)) {
      if (!value) continue;
      const others = { ...facetValues };
      delete others[key];
      if (flat.some((item) => matchesFacets(item, others, key))) next[key] = value;
    }
    return next;
  }, [facetValues, flat, matchesFacets]);

  /** Ejes que tienen al menos un elemento que los respete. */
  const visibleFacets = useMemo(
    () =>
      (facets ?? []).filter((f) => {
        if (activeFacets[f.key]) return true;
        const others = { ...activeFacets };
        delete others[f.key];
        return flat.some((item) => matchesFacets(item, others, f.key));
      }),
    [facets, activeFacets, flat, matchesFacets],
  );

  const hasNarrowing =
    Object.values(activeFacets).some(Boolean) || query.trim().length > 0;

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return groups
      .map((group) => {
        const items = group.items.filter((item) => {
          if (!matchesFacets(item, activeFacets)) return false;
          if (!q) return true;
          return (haystacks.get(item.id) ?? '').includes(q);
        });
        return { label: group.label, items };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, query, activeFacets, matchesFacets, haystacks]);

  /* Lista plana para la navegación con teclado, conservando el encabezado de
     grupo como bandera en el primer elemento de cada grupo. */
  const rows = useMemo(
    () =>
      results.flatMap((group) =>
        group.items.map((item, i) => ({ item, showGroup: i === 0 && results.length > 1, groupLabel: group.label })),
      ),
    [results],
  );

  const total = rows.length;

  /* El índice activo nunca puede quedar fuera de la lista filtrada. */
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  /**
   * Mantiene visible el elemento activo dentro de la lista.
   *
   * Ajustamos `scrollTop` a mano en vez de usar `scrollIntoView`: el panel vive
   * en un portal con `position: fixed`, y `scrollIntoView` también haría scroll
   * del documento, con lo cual la página saltaría al navegar con las flechas.
   */
  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [activeIndex, query, activeFacets]);

  const choose = (item: PickerItem) => {
    if (item.disabled) return;
    onSelect(item.id);
    /* Al elegir, el panel se cierra: la lista ya hizo su trabajo y lo que
       queda es la carta elegida, a la vista. */
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      /* Si no hay nada que elegir, no hay nada que destaca. */
      if (total === 0) return;
      setActiveIndex((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        if (next < 0) return total - 1;
        if (next >= total) return 0;
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      /* Se salta las cartas ya usadas: Enter elige la primera disponible. */
      const pick = row && !row.item.disabled ? row.item : rows.find((r) => !r.item.disabled)?.item;
      if (pick) choose(pick);
    }
  };

  /* Volvemos el foco al buscador después de tocar un filtro: si no, las
     flechas dejan de funcionar hasta que el usuario vuelva a hacer clic. */
  const toggleFacet = (key: string, value: string) => {
    setFacetValues((prev) => ({ ...prev, [key]: prev[key] === value ? '' : value }));
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const resetAll = () => {
    setFacetValues({});
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  /* ---------- Contenido del panel ---------- */
  const panelBody = (
    <>
      {/* Búsqueda */}
      <div className="shrink-0 border-b border-gold-400/15 p-3">
        <div className="relative">
          <input
            ref={inputRef}
            id={`${id}-search`}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className="!py-2 pr-8 !text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              title="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gold-100/40 transition-colors hover:text-gold-100"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtros por categoría */}
        {visibleFacets.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {visibleFacets.map((facet) => (
              <div key={facet.key} className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-gold-100/35">
                  {facet.label}
                </span>
                {facet.options.map((opt) => {
                  const isOn = activeFacets[facet.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleFacet(facet.key, opt.value)}
                      className={`rounded-full border px-2 py-0.5 text-[0.6rem] transition-colors ${
                        isOn
                          ? 'border-gold-300/70 bg-gold-400/20 text-gold-100'
                          : 'border-gold-400/20 text-gold-100/55 hover:border-gold-400/45 hover:text-gold-100/85'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resultados: `flex-1 min-h-0` para que tome el espacio que sobra del
          panel. El alto lo gobierna el `maxHeight` del contenedor, no este
          hijo, así un filtro que ocupa dos líneas no rompe el reparto.
          `relative` para que el `offsetTop` del elemento activo sea relativo a
          esta lista y el ajuste de scroll no mueva la página. */}
      {total > 0 ? (
        <div
          ref={listRef}
          className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {rows.map(({ item, showGroup, groupLabel }, i) => {
            const isSelected = item.id === selectedId;
            const isActive = i === activeIndex;
            return (
              <div key={item.id}>
                {showGroup && <p className="overline px-2 pb-1 pt-2">{groupLabel}</p>}
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  disabled={item.disabled}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(item)}
                  title={
                    item.disabled
                      ? (item.disabledHint ?? 'Ya usada en otra posición')
                      : `Elegir ${item.label}`
                  }
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors ${
                    item.disabled
                      ? 'cursor-not-allowed border-gold-400/10 bg-ink-950/30 opacity-40'
                      : isSelected
                        ? 'border-gold-300/60 bg-gold-400/[0.12]'
                        : isActive
                          ? 'border-gold-400/45 bg-ink-800'
                          : 'border-transparent hover:border-gold-400/30 hover:bg-ink-800/70'
                  }`}
                >
                  {item.imageUrl ? (
                    /* La miniatura reemplaza al glifo cuando hay imagen. Es un
                       24×36, que es chico pero alcanza para reconocer la
                       carta: el buscador es justo donde se las busca. */
                    <img
                      src={item.imageUrl}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      draggable={false}
                      className="h-9 w-6 shrink-0 rounded border border-gold-400/20 object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gold-400/20 text-[0.65rem] text-gold-300/80">
                      <Glyph>{item.glyph ?? '✦'}</Glyph>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-xs ${
                        isSelected ? 'text-gold-100' : 'text-gold-100/80'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="block truncate text-[0.6rem] text-gold-100/40">{item.hint}</span>
                    )}
                  </span>
                  {item.disabled && (
                    <span className="shrink-0 text-[0.55rem] uppercase tracking-[0.12em] text-gold-100/40">
                      {item.disabledHint ?? 'Usada'}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-gold-100/40">
            {groups.length === 0 ? 'Este mazo todavía no tiene cartas.' : emptyText}
          </p>
          {hasNarrowing && (
            <button
              type="button"
              onClick={resetAll}
              className="mt-2 text-[0.6rem] uppercase tracking-[0.14em] text-gold-300/70 underline-offset-2 hover:text-gold-200 hover:underline"
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      {/* Pie: cuántas hay y cómo limpiar */}
      {total > 0 && (
        <div className="flex items-center gap-2 border-t border-gold-400/15 px-3 py-1.5">
          <span className="text-[0.58rem] text-gold-100/40">
            {total} {total === 1 ? 'carta' : 'cartas'}
          </span>
          {hasNarrowing && (
            <button
              type="button"
              onClick={resetAll}
              className="ml-auto text-[0.58rem] uppercase tracking-[0.12em] text-gold-300/60 transition-colors hover:text-gold-200"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </>
  );

  /* ---------- Campo: con carta elegida muestra el resumen ---------- */
  return (
    <div ref={anchorRef} className="relative">
      {selected ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-gold-300/40 bg-gold-400/[0.07] px-3 py-2 text-left transition-colors hover:border-gold-300/70"
        >
          {selected.imageUrl ? (
            <img
              src={selected.imageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              draggable={false}
              className="h-12 w-8 shrink-0 rounded border border-gold-300/30 object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-300/30 text-base text-gold-200">
              <Glyph>{selected.glyph ?? '✦'}</Glyph>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-gold-100">{selected.label}</span>
            {selected.hint && (
              <span className="block truncate text-[0.6rem] uppercase tracking-[0.12em] text-gold-100/40">
                {selected.hint}
              </span>
            )}
          </span>
          <span className="shrink-0 rounded-full border border-gold-400/25 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-gold-200/75 transition-colors hover:border-gold-300/60 hover:text-gold-100">
            Cambiar
          </span>
        </button>
      ) : (
        /* Sin carta elegida, el disparador se lee como "elegí algo", NO como un
           campo de texto. Antes imitando un input, y como el panel abre con un
           input real de búsqueda con el mismo placeholder, parecía el mismo
           control en dos lugares. Ahora son dos cosas distintas: este pide una
           carta, el del panel filtra la lista. */
        <button
          type="button"
          /* El <label> de la pantalla apunta a este id: un <button> es un
             elemento etiquetable, así que el rótulo queda asociado igual. El
             input del panel lleva un id propio para no duplicarlo. */
          id={id}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-gold-400/30 bg-ink-900/40 px-3.5 py-2.5 text-left text-sm text-gold-100/40 transition-colors hover:border-gold-400/60 hover:bg-ink-900/70 hover:text-gold-100/70"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gold-400/25 text-[0.7rem] text-gold-300/60">
            <Glyph>✦</Glyph>
          </span>
          <span className="min-w-0 flex-1">Elegí la carta</span>
          <span className="shrink-0 text-[0.6rem] text-gold-100/35" aria-hidden="true">
            ▾
          </span>
        </button>
      )}

      {/* El panel se monta en document.body: así flota por encima de la página
          y ningún contenedor con overflow lo recorta. */}
      {open &&
        box &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
              ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }),
            }}
            className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-gold-400/35 bg-ink-900 shadow-[0_28px_70px_-20px_rgba(0,0,0,0.95)]"
          >
            {panelBody}
          </div>,
          document.body,
        )}
    </div>
  );
}
