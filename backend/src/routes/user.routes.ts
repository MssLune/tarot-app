import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/clerk';
import { enforceLimit, requirePro } from '../middleware/planLimits';
import * as userController from '../controllers/userController';

export const userRouter = Router();

// Todas las rutas de usuario requieren autenticación
userRouter.use(requireAuth);

/* ---------- Perfil ---------- */
userRouter.get('/me', asyncHandler(userController.getMe));

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

/* ---------- Exportar ---------- */
/* El PDF no es "crear un objeto más" sino una operación cara, así que va con
   `requirePro` en vez de un contador. Este endpoint todavía no existe: está
   declarado para que la interfaz pueda ofrecerlo y fallar con un mensaje
   claro en vez de un 404 de "ruta inexistente". */
userRouter.get('/readings/:id/pdf', requirePro(), (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'PDF_NOT_IMPLEMENTED',
      message: 'La exportación a PDF todavía no está implementada.',
    },
  });
});
