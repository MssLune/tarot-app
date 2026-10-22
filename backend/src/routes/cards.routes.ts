import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/clerk';
import * as cardsController from '../controllers/cardsController';

export const cardsRouter = Router();

/* El contenido editorial es público para LEER, pero escribirlo es sólo de
   admin. Sin el `requireAdmin`, cualquiera podía borrar o reescribir el
   contenido con un curl, y con eso romper las lecturas y los PDF de todos. */

cardsRouter.get('/', asyncHandler(cardsController.listCards));
cardsRouter.get('/:id', asyncHandler(cardsController.getCard));
cardsRouter.post('/', requireAdmin, asyncHandler(cardsController.createCard));
cardsRouter.put('/:id', requireAdmin, asyncHandler(cardsController.updateCard));
cardsRouter.delete('/:id', requireAdmin, asyncHandler(cardsController.deleteCard));
