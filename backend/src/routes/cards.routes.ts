import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as cardsController from '../controllers/cardsController';

export const cardsRouter = Router();

cardsRouter.get('/', asyncHandler(cardsController.listCards));
cardsRouter.get('/:id', asyncHandler(cardsController.getCard));
cardsRouter.post('/', asyncHandler(cardsController.createCard));
cardsRouter.put('/:id', asyncHandler(cardsController.updateCard));
cardsRouter.delete('/:id', asyncHandler(cardsController.deleteCard));
