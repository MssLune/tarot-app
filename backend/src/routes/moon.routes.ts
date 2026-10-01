import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { eclipsesLunares, eclipseVigente, proximoEclipse, type LunarEclipse } from '../services/eclipses';
import { retrogradosDe } from '../services/retrogrados';

export const moonRouter = Router();

/**
 * Eclipses lunares de un año.
 *
 * `?anio=` es opcional: sin él, el de hoy. El rango que devuelve la app
 * es el año pedido más el siguiente, porque el eclipse del 31 de diciembre es
 * del año que viene para cualquier consulta hecha en diciembre.
 */
moonRouter.get(
  '/eclipses',
  asyncHandler(async (req, res) => {
    const pedido = Number(req.query.anio);
    const anio = Number.isFinite(pedido) && pedido > 1000 ? Math.trunc(pedido) : new Date().getFullYear();

    const [este, siguiente] = await Promise.all([eclipsesLunares(anio), eclipsesLunares(anio + 1)]);

    res.json({
      success: true,
      data: {
        anio,
        eclipses: [...este, ...siguiente] as LunarEclipse[],
      },
    });
  }),
);

/**
 * Lo que la pantalla de la luna necesita para decidir qué rotular.
 *
 * Una sola llamada trae el estado de hoy y lo que viene, para que la pantalla
 * no haga dos requests cada vez que se abre.
 */
moonRouter.get(
  '/estado',
  asyncHandler(async (_req, res) => {
    const ahora = new Date();
    const [vigente, proximo] = await Promise.all([eclipseVigente(ahora), proximoEclipse(ahora)]);

    res.json({
      success: true,
      data: {
        /* `hoy` sólo es verdadero si el eclipse cae HOY. Un eclipse total dura unas horas: ayer ya no es y mañana todavía no. Por eso va
           `esHoy` explícito y no alcanza con comparar fechas en el cliente. */
        hoy: vigente?.esHoy ? vigente.eclipse : null,
        proximo: proximo,
      },
    });
  }),
);

/**
 * Retrógrados planetarios de un año.
 *
 * `?anio=` es opcional: sin él, el de hoy. Devuelve los cinco planetas
 * visibles (Mercurio, Venus, Marte, Júpiter y Saturno), ordenados por fecha de
 * inicio.
 *
 * La Luna y el Sol NO aparecen, y no es una omisión: nunca están retrógrados.
 * La Luna orbita la Tierra en 27,55 días siempre hacia adelante, y el Sol no
 * orbita nada. Sus posiciones salen de las efemérides DE441 del JPL y se
 * cachean por año, así que abrir la pantalla no le pega a la NASA.
 */
moonRouter.get(
  '/retrogrados',
  asyncHandler(async (req, res) => {
    const pedido = Number(req.query.anio);
    const anio = Number.isFinite(pedido) && pedido > 1000 ? Math.trunc(pedido) : new Date().getFullYear();

    res.json({
      success: true,
      data: { anio, retrogrados: await retrogradosDe(anio) },
    });
  }),
);
