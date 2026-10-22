import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/clerk';
import * as spreadsController from '../controllers/spreadsController';

export const spreadsRouter = Router();

/* El contenido editorial es público para LEER, pero escribirlo es sólo de
   admin. Sin el `requireAdmin`, cualquiera podía borrar o reescribir el
   contenido con un curl, y con eso romper las lecturas y los PDF de todos. */

spreadsRouter.get('/', asyncHandler(spreadsController.listSpreads));
spreadsRouter.get('/:id', asyncHandler(spreadsController.getSpread));
spreadsRouter.post('/', requireAdmin, asyncHandler(spreadsController.createSpread));
spreadsRouter.put('/:id', requireAdmin, asyncHandler(spreadsController.updateSpread));
spreadsRouter.delete('/:id', requireAdmin, asyncHandler(spreadsController.deleteSpread));
