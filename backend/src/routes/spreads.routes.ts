import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as spreadsController from '../controllers/spreadsController';

export const spreadsRouter = Router();

spreadsRouter.get('/', asyncHandler(spreadsController.listSpreads));
spreadsRouter.get('/:id', asyncHandler(spreadsController.getSpread));
spreadsRouter.post('/', asyncHandler(spreadsController.createSpread));
spreadsRouter.put('/:id', asyncHandler(spreadsController.updateSpread));
spreadsRouter.delete('/:id', asyncHandler(spreadsController.deleteSpread));
