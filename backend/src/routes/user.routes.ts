import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/clerk';
import { enforceLimit } from '../middleware/planLimits';
import * as pdfService from '../services/pdfService';
import * as userController from '../controllers/userController';

export const userRouter = Router();

// Todas las rutas de usuario requieren autenticación
userRouter.use(requireAuth);

/* ---------- Perfil ---------- */
userRouter.get('/me', asyncHandler(userController.getMe));
/* Plan y uso. Va aquí y no sólo en /api/billing porque los topes del plan
   gratuito se aplican aunque Stripe no esté configurado. */
userRouter.get('/usage', asyncHandler(userController.getUsage));

/* ---------- Mazos ---------- */
/* `enforceLimit` va sólo en crear. En actualizar no: un usuario free que
   llegó al tope tiene que poder editar lo que ya tiene, no quedar trabado. */
userRouter.get('/decks', asyncHandler(userController.listDecks));
userRouter.get('/decks/:id', asyncHandler(userController.getDeck));
userRouter.post('/decks', enforceLimit('decks'), asyncHandler(userController.createDeck));
/** Upsert: crea el mazo si el id no existe (201) o lo actualiza (200). */
userRouter.put('/decks/:id', asyncHandler(userController.updateDeck));
userRouter.delete('/decks/:id', asyncHandler(userController.deleteDeck));

/* ---------- Tiradas ---------- */
userRouter.get('/spreads', asyncHandler(userController.listSpreads));
userRouter.get('/spreads/:id', asyncHandler(userController.getSpread));
userRouter.post(
  '/spreads',
  enforceLimit('spreads'),
  asyncHandler(userController.createSpread),
);
/** Upsert: crea la tirada si el id no existe (201) o la actualiza (200). */
userRouter.put('/spreads/:id', asyncHandler(userController.updateSpread));
userRouter.delete('/spreads/:id', asyncHandler(userController.deleteSpread));

/* ---------- Lecturas ---------- */
userRouter.get('/readings', asyncHandler(userController.listReadings));
userRouter.get('/readings/:id', asyncHandler(userController.getReading));
userRouter.post(
  '/readings',
  enforceLimit('readings'),
  asyncHandler(userController.createReading),
);
userRouter.delete('/readings/:id', asyncHandler(userController.deleteReading));

/* ---------- Rituales ---------- */
userRouter.get('/rituals', asyncHandler(userController.listRituals));
userRouter.post(
  '/rituals',
  enforceLimit('rituals'),
  asyncHandler(userController.createRitual),
);
userRouter.put('/rituals/:id', asyncHandler(userController.updateRitual));
userRouter.delete('/rituals/:id', asyncHandler(userController.deleteRitual));

/* ---------- Notas de festividades ---------- */
/* Una nota por festividad y por año. No cuentan para el tope del plan: son
   texto corto atado a algo que ya existe, no un recurso nuevo. */
userRouter.get('/festival-notes', asyncHandler(userController.listFestivalNotes));
userRouter.put('/festival-notes/:festivalId/:anio', asyncHandler(userController.saveFestivalNote));
userRouter.delete('/festival-notes/:festivalId/:anio', asyncHandler(userController.deleteFestivalNote));

/* ---------- Exportar ---------- */
/* El PDF es GRATIS, a propósito.

   Lo único que hace el producto es leer: es lo que la gente vino a buscar, y
   cobrarlo sería cobrarle a alguien por la razón por la que llegó. Y lo que
   más rinde de esta función es COMPARTIR la lectura, que es de las pocas vías
   por las que alguien se entera de que la app existe. Ponerle candado frenaría
   justo eso.

   Armarlo cuesta milisegundos y cero servidores, así que detrás de la decisión
   no hay un argumento de costo: es una decisión de producto. */
userRouter.get(
  '/readings/:id/pdf',
  asyncHandler(async (req, res) => {
    const userId = (req as any).dbUserId as string;
    const { bytes, filename } = await pdfService.renderReadingPdf(userId, req.params.id);

    /* `inline` y no `attachment`: el navegador abre el PDF en una pestaña y el
       usuario decide guardarlo. Con `attachment` la descarga arranca sola y no
       hay vuelta atrás si se equivoca de lectura. */
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(bytes);
  }),
);
