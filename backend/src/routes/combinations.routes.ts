import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/clerk';
import * as combinationsController from '../controllers/combinationsController';

export const combinationsRouter = Router();

/* El contenido editorial es público para LEER, pero escribirlo es sólo de
   admin. Sin el `requireAdmin`, cualquiera podía borrar o reescribir el
   contenido con un curl, y con eso romper las lecturas y los PDF de todos. */

combinationsRouter.get('/', asyncHandler(combinationsController.listCombinations));
combinationsRouter.get('/:id', asyncHandler(combinationsController.getCombination));
combinationsRouter.post('/', requireAdmin, asyncHandler(combinationsController.createCombination));
combinationsRouter.put('/:id', requireAdmin, asyncHandler(combinationsController.updateCombination));
combinationsRouter.delete('/:id', requireAdmin, asyncHandler(combinationsController.deleteCombination));
