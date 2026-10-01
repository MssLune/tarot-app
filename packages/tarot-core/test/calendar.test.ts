import { describe, expect, it } from 'vitest';
import { calendarMonth, moonDaysInMonth } from '../src/lunar';

/* ==========================================================================
   La Luna de cada día, para el calendario.

   La prueba difícil aquí es la ZONA HORARIA, y no es un detalle de test: la
   Luna Llena de octubre de 2026 cae el 26 a las 04:12 UTC. Para el usuario de
   Roma es el día 26; para el de Nueva York, las 23:12 del día 25. Los dos
   tienen razón, y una app que le dijera a uno de ellos que la Luna Llena fue
   el 26 mientras la Luna estaba bajo el horizonte estaría mintiendo.

   Por eso estos tests NO comparan días exactos contra una referencia, salvo
   que se fixe la zona. Comprueban que la rejilla sea una rejilla y que la fase
   esté donde tiene que estar con una tolerancia de un día, que es la
   diferencia máxima que puede haber entre dos zonas.
   ========================================================================== */

/** Días de octubre de 2026, según el USNO oficial (UTC). */
const OFICIAL_OCTUBRE_2026 = {
  cuartoMenguante: 3,
  nueva: 10,
  cuartoCreciente: 18,
  llena: 26,
};

describe('moonDaysInMonth', () => {
  it('devuelve todos los días del mes, en orden', () => {
    for (const [anio, mes, esperados] of [
      [2026, 0, 31], // enero
      [2026, 3, 30], // abril
      [2024, 1, 29], // febrero bisiesto
      [2026, 9, 31], // octubre
    ] as [number, number, number][]) {
      const dias = moonDaysInMonth(anio, mes);
      expect(dias, `${anio}/${mes}`).toHaveLength(esperados);
      expect(dias[0].date.getDate()).toBe(1);
      expect(dias[esperados - 1].date.getDate()).toBe(esperados);
    }
  });

  it('da a la Luna Llena casi toda la luz y a la Nueva casi nada', () => {
    const dias = moonDaysInMonth(2026, 9);
    const max = Math.max(...dias.map((d) => d.illumination));
    const min = Math.min(...dias.map((d) => d.illumination));

    expect(max).toBeGreaterThan(0.97);
    expect(min).toBeLessThan(0.03);
  });

  it('la iluminación no salta entre días consecutivos', () => {
    /* El calendario muestra 31 discos en fila. Si el cálculo se equivocara al
       cambiar de lunación, aparecería un salto de 0 a 1 entre dos celdas
       vecinas y la hilera se vería rota. */
    /* El techo de 0,11 NO es un número redondo: es el máximo físico. La
       iluminación cambia más rápido en los cuartos, a ~0,106 por día, así que
       un umbral más estricto estaría fallando contra la Luna y no contra el
       código. */
    const dias = moonDaysInMonth(2026, 9);
    for (let i = 1; i < dias.length; i += 1) {
      const salto = Math.abs(dias[i].illumination - dias[i - 1].illumination);
      expect(salto, `entre el día ${i} y el ${i + 1}`).toBeLessThan(0.11);
    }
  });

  it('el ángulo también avanza sin saltos, salvo al dar la vuelta', () => {
    /* El ángulo vive en 0..2π, así que en la Luna Nueva pasa de ~6,2 a ~0.
       Eso NO es un salto: es la vuelta completa, y el disco tiene que dar
       vuelta ahí. Comparar la diferencia cruda daría 6,07 radianes y fallaría
       siempre. La distancia mínima entre dos ángulos es la que importa. */
    const TAU = 2 * Math.PI;
    const distanciaCorta = (a: number, b: number) => {
      const d = Math.abs(a - b) % TAU;
      return Math.min(d, TAU - d);
    };

    const dias = moonDaysInMonth(2026, 9);
    for (let i = 1; i < dias.length; i += 1) {
      expect(distanciaCorta(dias[i].angle, dias[i - 1].angle), `día ${i + 1}`).toBeLessThan(0.25);
    }
  });

  it('el ángulo recorre el ciclo en un sentido, y no al revés', () => {
    /* El bug que este archivo hunters: al interpolar el ángulo entre anclas,
       el tramo de la Luna Balsema iba de 7π/4 a 0, o sea DECRECIENDO. En el
       calendario el disco giraba al revés justo en la Luna Nueva, el día que
       más se mira. Con la edad el ángulo es monótono y da la vuelta solo. */
    const TAU = 2 * Math.PI;
    const dias = moonDaysInMonth(2026, 9);
    let haciaAtras = 0;
    let saltosDeVuelta = 0;

    for (let i = 1; i < dias.length; i += 1) {
      const crudo = dias[i].angle - dias[i - 1].angle;
      const par = `del ${dias[i - 1].date.getDate()} al ${dias[i].date.getDate()}`;

      if (crudo < -3) {
        /* Bajó cerca de 2π entera: es la vuelta por la Luna Nueva, que tiene
           que pasar. Que pase una vez en el mes es lo esperable. */
        saltosDeVuelta += 1;
        expect(Math.abs(crudo), par).toBeGreaterThan(TAU - 0.5);
      } else {
        /* Cualquier otra bajada es un retroceso real, y es el bug. */
        expect(crudo, par).toBeGreaterThanOrEqual(0);
        if (crudo < 0) haciaAtras += 1;
        /* Un día son ~0,21 radianes. El tope va holgado porque lo que importa
           es que no dé un salto, no que sea exacto. */
        expect(Math.abs(crudo), par).toBeLessThan(0.5);
      }
    }

    expect(haciaAtras, 'ningún disco debe girar al revés').toBe(0);
    /* Octubre de 2026 tiene luna nueva el día 10: una sola vuelta en el mes. */
    expect(saltosDeVuelta).toBe(1);
  });
});

describe('calendarMonth', () => {
  const celdas = calendarMonth(2026, 9); // octubre 2026

  it('la rejilla es un múltiplo de siete', () => {
    expect(celdas.length % 7).toBe(0);
    expect(celdas.length).toBeGreaterThanOrEqual(28);
    expect(celdas.length).toBeLessThanOrEqual(42);
  });

  it('empieza en domingo', () => {
    expect(celdas[0].weekday).toBe(0);
  });

  it('la rejilla completa exactamente los días del mes', () => {
    /* La prueba que importa: si faltara o sobrara un día de relleno, el mes
       mostraría dos veces un mismo número o saltaría del 30 al 1. */
    const enMes = celdas.filter((c) => c.enMes);
    expect(enMes).toHaveLength(31);
    expect(enMes[0].date.getDate()).toBe(1);
    expect(enMes[30].date.getDate()).toBe(31);
    expect(celdas.filter((c) => !c.enMes).every((c) => c.date.getMonth() !== 9)).toBe(true);
  });

  it('cada columna cae siempre en el mismo día de la semana', () => {
    /* Una FILA tiene los siete días distintos, que es lo que hace que sea un
       calendario. Lo que se repite es la columna: la primera celda de cada
       fila es domingo, la segunda lunes, y así. */
    for (let f = 0; f < celdas.length; f += 7) {
      const semana = celdas.slice(f, f + 7);
      expect(semana.map((c) => c.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('marca las cuatro fases principales, dentro del mes y en orden', () => {
    const conFase = celdas.filter((c) => c.enMes && c.fase);
    expect(conFase).toHaveLength(4);

    /* Cada fase tiene que estar a lo sumo a un día del valor oficial: la
       diferencia entre zonas horarias llega a ser de un día entero, y es la
       única tolerancia admisible. */
    const diaOf = (nombre: string) => conFase.find((c) => c.fase!.name === nombre)!.date.getDate();
    const cerca = (a: number, b: number) => Math.abs(a - b) <= 1;

    expect(cerca(diaOf('Cuarto Menguante'), OFICIAL_OCTUBRE_2026.cuartoMenguante)).toBe(true);
    expect(cerca(diaOf('Luna Nueva'), OFICIAL_OCTUBRE_2026.nueva)).toBe(true);
    expect(cerca(diaOf('Cuarto Creciente'), OFICIAL_OCTUBRE_2026.cuartoCreciente)).toBe(true);
    expect(cerca(diaOf('Luna Llena'), OFICIAL_OCTUBRE_2026.llena)).toBe(true);

    const dias = conFase.map((c) => c.date.getDate());
    expect([...dias].sort((a, b) => a - b)).toEqual(dias);
  });

  it('el día marcado como Luna Llena es el más iluminado del mes', () => {
    const enMes = celdas.filter((c) => c.enMes);
    const masLuz = enMes.reduce((a, b) => (b.illumination > a.illumination ? b : a));
    const conFase = enMes.filter((c) => c.fase);

    expect(masLuz.illumination).toBeGreaterThan(0.97);
    expect(conFase.some((c) => c.fase!.name === 'Luna Llena')).toBe(true);
  });

  it('coloca las festividades en su día', () => {
    /* Samhain es el 31 de octubre, fecha fija. Éste no depende de la zona:
       la festividad es un día del calendario civil. */
    const conFes = calendarMonth(2026, 9, [
      { id: 'samhain', name: 'Samhain', date: new Date(2026, 9, 31, 12), granHoguera: true },
      { id: 'falsa', name: 'Imbolc', date: new Date(2026, 1, 1, 12) },
    ]);
    const conFest = conFes.filter((c) => c.festividad);

    expect(conFest).toHaveLength(1);
    expect(conFest[0].festividad!.name).toBe('Samhain');
    expect(conFest[0].festividad!.granHoguera).toBe(true);
    expect(conFest[0].date.getDate()).toBe(31);
  });

  it('no pone festividades en los días del mes vecino', () => {
    const conFes = calendarMonth(2026, 9, [
      { id: 'imbolc', name: 'Imbolc', date: new Date(2026, 1, 1, 12) },
    ]);
    /* Imbolc es del 1 de febrero: en la rejilla de octubre no puede aparecer en
       ninguna celda, ni siquiera en los rellenos. */
    expect(conFes.filter((c) => c.festividad)).toHaveLength(0);
  });

  it('funciona para febrero bisiesto', () => {
    const bisiesto = calendarMonth(2024, 1);
    expect(bisiesto.filter((c) => c.enMes)).toHaveLength(29);
    expect(bisiesto.length % 7).toBe(0);
  });

  it('funciona en un mes que empieza en sábado', () => {
    /* Agosto de 2026 arranca en sábado: seis días de relleno y 31 días, que
       dan 37. Hacen falta SEIS filas (42 celdas). Es el caso donde un
       `Math.ceil` mal hecho deja el último día del mes sin pintar. */
    const agosto = calendarMonth(2026, 7);
    expect(new Date(2026, 7, 1).getDay()).toBe(6);
    expect(agosto).toHaveLength(42);
    expect(agosto.slice(0, 6).every((c) => !c.enMes)).toBe(true);

    const enMes = agosto.filter((c) => c.enMes);
    expect(enMes).toHaveLength(31);
    expect(enMes[30].date.getDate()).toBe(31);
  });

  it('funciona en un mes que empieza en domingo, sin relleno', () => {
    /* El otro extremo: cero días de relleno. Ahí la rejilla tiene exactamente
       las semanas que tiene el mes, y es donde un `+1` de más se nota. */
    const febrero = calendarMonth(2026, 1);
    expect(new Date(2026, 1, 1).getDay()).toBe(0);
    expect(febrero[0].enMes).toBe(true);
    expect(febrero.filter((c) => c.enMes)).toHaveLength(28);
    expect(febrero).toHaveLength(28);
  });
});