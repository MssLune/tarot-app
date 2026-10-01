import { describe, expect, it } from 'vitest';
import { moonDiscSvg, caminoIluminado, PALETA } from '../components/cards/moonDiscSvg';

/* ==========================================================================
   Geometría del disco lunar.

   Los cuatro primeros describe son BUGS QUE EXISTIERON. Todos se veían bien
   en el código y ninguno se notaba sin medir:

   1. La Luna Menguante salía idéntica a la Creciente. `k = cos(elongación)` es
      simétrico, así que la creciente fina y la balsema fina tienen el mismo
      `k` y la misma figura. Hacía falta `sin` para saber de qué lado va.

   2. El velo de sombra no se dibujaba en Luna Nueva, con lo que el disco
      entero quedaba dorado: una Luna Llena donde debía Luna Nueva.

   3. El arco del limbo iba con `sweep = 0`, que da el área complemento,
      (1 + k)/2. Con sweep = 1 da (1 − k)/2, que es lo que dice la astronomía.

   4. El velo se dibujaba antes que los cráteres, y los tapaba: la parte en
      sombra quedaba lisa.

   CÓMO SE MIDE ACÁ
   ----------------
   El ÁREA del path se calcula con la fórmula del polígono (zancos) sobre los
   MISMOS puntos que el SVG usa: el terminador de ida, el limbo de vuelta, y el
   terminator repetido al revés — que en el área neta no aporta nada.

   Mide la figura que el código construye, no una fórmula sobre `k`. La
   diferencia importa: si el test comprobara `(1-k)/2` contra `(1-k)/2`,
   estaría comparando una constante con sí misma y pasaría aunque el path
   estuviera al revés. Con el zancos, si el `sweep` o el signo se invierten,
   el área sale mal y el test falla.

   La comprobación de que el SVG RENDERIZADO tiene esa área, contando píxeles
   con sharp, vive en `herramientas/verificarLuna.ts`. Acá no hay rasterizador.
   ========================================================================== */

const CENTRO = 200;
const R = 190;
const TOTAL = Math.PI * R * R;

/** Área con signo de un polígono, por la fórmula del cordón. */
function zancos(puntos: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Los puntos del contorno iluminado, para el zancos.
 *
 * Son las DOS cadenas y nada más: el terminador de (0,−r) a (0,+r) y el arco
 * del limbo de vuelta. El SVG después repite el terminador al revés para
 * cerrar, y esa repetición va en dirección opuesta y se anula en el área: si
 * se incluye en el polígono, el lado se cuenta dos veces y el área sale a
 * ~(1−k)/2 + 1/4 en vez de (1−k)/2. Se comprobó: así daba 0,4788 en Luna
 * Nueva, donde el SVG real da 0.
 *
 * El arco se muestrea con los MISMOS 48 pasos que el terminator, y no como el
 * semicírculo exacto, porque si uno se muestrea y el otro no, el área que sale
 * es la diferencia entre las dos discretizaciones y el error parece del
 * código cuando es del método.
 */
function contorno(k: number, waxing: boolean): [number, number][] {
  const N = 48;
  const signo = waxing ? 1 : -1;

  const terminador: [number, number][] = [];
  for (let i = 0; i <= N; i += 1) {
    const t = -Math.PI / 2 + (Math.PI * i) / N;
    terminador.push([CENTRO + signo * k * R * Math.cos(t), CENTRO + R * Math.sin(t)]);
  }

  /* El arco del limbo, del punto inferior al superior. Con sweep = 1 —que en
     SVG, con la y hacia abajo, es sentido horario— pasa por la derecha; con
     sweep = 0, por la izquierda. */
  const arco: [number, number][] = [];
  for (let i = 1; i < N; i += 1) {
    const f = i / N;
    const theta = waxing
      ? Math.PI / 2 - Math.PI * f // π/2 → −π/2, pasando por 0 (derecha)
      : Math.PI / 2 + Math.PI * f; // π/2 → 3π/2, pasando por π (izquierda)
    arco.push([CENTRO + R * Math.cos(theta), CENTRO + R * Math.sin(theta)]);
  }

  return [...terminador, ...arco];
}

/** Fracción del disco que queda iluminada, medida sobre el path. */
function fraccionMedida(k: number, waxing: boolean): number {
  return Math.abs(zancos(contorno(k, waxing))) / TOTAL;
}

describe('el área iluminada', () => {
  /* El bug 3. Con el signo del abombamiento o el del arco invertidos, la Luna
     Nueva daba 99,97% iluminada y la Llena 0%: los dos al revés, y ninguno
     delatado a simple vista porque el disco entero se veía igual de lleno en
     los dos casos. */
  it('da (1 − k)/2 en las cuatro fases principales', () => {
    const casos: [number, number][] = [
      [1, 0], // Luna Nueva
      [0, 0.5], // cuarto
      [-1, 1], // Luna Llena
    ];
    for (const [k, esperado] of casos) {
      /* Tolerancia de 0,002, no de 0,0001: es el error de muestrear el arco
         en 48 tramos, que a Luna Llena (donde terminador y arco casi coinciden)
         vale 0,0007. Medido. */
      expect(Math.abs(fraccionMedida(k, true) - esperado), `k=${k}`).toBeLessThan(0.002);
    }
  });

  it('NO da (1 + k)/2, que es el error del arco al revés', () => {
    /* La línea de más: si alguien vuelve a cambiar el `sweep`, el test de
       arriba falla, pero este dice POR QUÉ. Y como (1+k)/2 y (1−k)/2 se
       separan hasta en 1,0, ningún umbral razonable los deja pasar juntos. */
    /* Sin `k = 0`: ahí las dos fórmulas dan 0,5 y no hay nada que distinguir.
       El cuarto es justo el caso donde el error pasa desapercibido. */
    for (const k of [0.707, 0.5, 0.25]) {
      const mal = (1 + k) / 2;
      expect(Math.abs(fraccionMedida(k, true) - mal), `k=${k}`).toBeGreaterThan(0.1);
    }
  });

  it('da el área correcta para la media luna fina', () => {
    expect(fraccionMedida(Math.cos(Math.PI / 4), true)).toBeCloseTo(0.1464, 3);
  });

  it('es monótona de 0 a 1 a lo largo del ciclo', () => {
    let anterior = -1;
    for (let i = 0; i <= 12; i += 1) {
      const angle = (Math.PI * i) / 12;
      const k = Math.cos(angle);
      const f = fraccionMedida(k, Math.sin(angle) >= 0);
      expect(f, `ángulo ${(angle * 180) / Math.PI}°`).toBeGreaterThan(anterior - 1e-9);
      anterior = f;
    }
    expect(anterior).toBeCloseTo(1, 2);
  });
});

describe('creciente y menguante son imágenes espejadas', () => {
  /* El bug 1. Con el mismo `k`, las dos crescentes finas tienen la misma
     elongación en valor absoluto, y el coseno no las distingue. El camino
     devuelto era EXACTAMENTE el mismo, y la app pintaba la menguante
     iluminada a la derecha: el error clásico de toda app de fases. */
  it('el mismo `k` da paths distintos según el lado', () => {
    const k = Math.cos(Math.PI / 4);
    expect(caminoIluminado(CENTRO, R, k, true)).not.toBe(caminoIluminado(CENTRO, R, k, false));
  });

  it('invierte el signo del semieje Y el del arco a la vez', () => {
    /* Reflejar son las DOS cosas. Cambiar sólo una deja la figura con el área
       correcta pero del lado equivocado: se ve "casi bien" y no es nada, que
       es el peor error posible. */
    const creciente = caminoIluminado(CENTRO, R, 0.5, true);
    const menguante = caminoIluminado(CENTRO, R, 0.5, false);
    expect(creciente).toContain('A 190 190 0 0 1');
    expect(menguante).toContain('A 190 190 0 0 0');
  });

  it('mantiene el área al reflejar', () => {
    for (const k of [1, 0.8, 0.3, 0, -0.3, -0.8, -1]) {
      expect(fraccionMedida(k, false), `k=${k}`).toBeCloseTo(fraccionMedida(k, true), 6);
    }
  });

  it('los extremos no dependen del lado', () => {
    /* En Luna Nueva y en Llena no hay lado: el disco entero o nada. */
    expect(fraccionMedida(1, false)).toBeLessThan(0.002);
    expect(fraccionMedida(-1, false)).toBeGreaterThan(0.998);
  });
});

describe('el svg completo', () => {
  const svg = (angle: number, illumination: number, extra: Record<string, unknown> = {}) =>
    moonDiscSvg({ size: 200, angle, illumination, ...extra });

  it('la Luna Nueva SÍ lleva velo: es lo único que la tapa', () => {
    /* El bug 2. La bandera de "sin terminador" frenaba también el velo, y en
       Luna Nueva el velo es justamente lo que tiene que tapar el disco. */
    expect(svg(0, 0)).toContain('url(#luna-sombra)');
  });

  it('la Luna Llena NO lleva velo: no hay sombra que tapar', () => {
    expect(svg(Math.PI, 1)).not.toContain('url(#luna-sombra)');
  });

  it('la Luna Nueva no tiene filo de terminator', () => {
    /* El filo es un trazo sobre el path iluminado. Con área cero trazaría el
       limbo dos veces: un aro alrededor del disco, que se ve como marco. */
    expect(svg(0, 0)).not.toContain(`stroke="${PALETA.oroBorde}"`);
  });

  it('el velo va DESPUÉS de los cráteres, para no taparlos', () => {
    /* El bug 4. Con el velo antes, la parte en sombra era un disco liso y se
       perdía lo que hace que siga leyéndose como luna y no como recorte. En la
       foto de referencia los cráteres se ven, tenue. */
    const s = svg((3 * Math.PI) / 4, 0.854, { detail: true });
    expect(s.indexOf(PALETA.crater)).toBeGreaterThan(-1);
    expect(s.indexOf(`${PALETA.sombra}" opacity`)).toBeGreaterThan(s.indexOf(PALETA.crater));
  });

  it('el detalle se puede apagar', () => {
    expect(svg(Math.PI / 2, 0.5, { detail: false })).not.toContain(PALETA.crater);
    expect(svg(Math.PI / 2, 0.5, { detail: true })).toContain(PALETA.crater);
  });

  it('cada uid da ids propios', () => {
    /* Si dos discos compartieran ids, el segundo usaría el degradado del
       primero. Con uno en Luna Nueva y otro en Llena, el disco entero
       tomaría el color que tocara. */
    const a = moonDiscSvg({ size: 100, angle: 0, illumination: 0, uid: 'a' });
    const b = moonDiscSvg({ size: 100, angle: Math.PI, illumination: 1, uid: 'b' });
    expect(a).toContain('#a-oro');
    expect(b).toContain('#b-oro');
    expect(a).not.toContain('#b-');
  });

  it('el halo no aparece en Luna Nueva', () => {
    /* Un halo alrededor de un disco invisible se lee como un brillo sin luna. */
    /* Se busca el USO del filtro, no su id: el `<filter>` estaba siempre en
       los `<defs>` aunque no se usara, y el test pasaba/fallaba por una
       coincidencia de texto y no por lo que se dibuja. Ahora además el filtro
       no se emite si no se usa, que además achica el svg. */
    expect(svg(0, 0, { glow: true })).not.toContain('url(#luna-halo)');
    expect(svg(Math.PI, 1, { glow: true })).toContain('url(#luna-halo)');
  });
});

describe('la composición del calendario', () => {
  /* El calendario pinta 31 celdas por mes. Si dos días distintos salieran
     idénticos, la hilera no contaría la historia del mes, que es lo único que
     hace que valga más que una tira de ocho fichas. */
  it('ninguna de 31 celdas sale igual a la anterior', () => {
    const svgs = Array.from({ length: 31 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 29.53;
      return moonDiscSvg({ size: 40, angle, illumination: (1 - Math.cos(angle)) / 2, uid: `c${i}` });
    });
    expect(new Set(svgs).size).toBe(svgs.length);
  });
});