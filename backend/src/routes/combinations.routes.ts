import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as combinationsController from '../controllers/combinationsController';

export const combinationsRouter = Router();

combinationsRouter.get('/', asyncHandler(combinationsController.listCombinations));
combinationsRouter.get('/:id', asyncHandler(combinationsController.getCombination));
combinationsRouter.post('/', asyncHandler(combinationsController.createCombination));
combinationsRouter.put('/:id', asyncHandler(combinationsController.updateCombination));
combinationsRouter.delete('/:id', asyncHandler(combinationsController.deleteCombination));
