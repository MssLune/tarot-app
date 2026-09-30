import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/clerk';
import * as userController from '../controllers/userController';

export const userRouter = Router();

// Todas las rutas de usuario requieren autenticación
userRouter.use(requireAuth);

/* ---------- Perfil ---------- */
userRouter.get('/me', asyncHandler(userController.getMe));

/* ---------- Mazos ---------- */
userRouter.get('/decks', asyncHandler(userController.listDecks));
userRouter.get('/decks/:id', asyncHandler(userController.getDeck));
userRouter.post('/decks', asyncHandler(userController.createDeck));
/** Upsert: crea el mazo si el id no existe (201) o lo actualiza (200). */
userRouter.put('/decks/:id', asyncHandler(userController.updateDeck));
userRouter.delete('/decks/:id', asyncHandler(userController.deleteDeck));

/* ---------- Tiradas ---------- */
userRouter.get('/spreads', asyncHandler(userController.listSpreads));
userRouter.get('/spreads/:id', asyncHandler(userController.getSpread));
userRouter.post('/spreads', asyncHandler(userController.createSpread));
/** Upsert: crea la tirada si el id no existe (201) o la actualiza (200). */
userRouter.put('/spreads/:id', asyncHandler(userController.updateSpread));
userRouter.delete('/spreads/:id', asyncHandler(userController.deleteSpread));

/* ---------- Lecturas ---------- */
userRouter.get('/readings', asyncHandler(userController.listReadings));
userRouter.get('/readings/:id', asyncHandler(userController.getReading));
userRouter.post('/readings', asyncHandler(userController.createReading));
userRouter.delete('/readings/:id', asyncHandler(userController.deleteReading));

/* ---------- Rituales ---------- */
userRouter.get('/rituals', asyncHandler(userController.listRituals));
userRouter.post('/rituals', asyncHandler(userController.createRitual));
userRouter.put('/rituals/:id', asyncHandler(userController.updateRitual));
userRouter.delete('/rituals/:id', asyncHandler(userController.deleteRitual));
