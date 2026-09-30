import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/clerk';
import * as adminController from '../controllers/adminController';

export const adminRouter = Router();

// Todas las rutas de administración requieren rol 'admin'
adminRouter.use(requireAdmin);

adminRouter.get('/users', asyncHandler(adminController.listUsers));
adminRouter.get('/users/:id', asyncHandler(adminController.getUser));
adminRouter.put('/users/:id', asyncHandler(adminController.updateUser));
adminRouter.delete('/users/:id', asyncHandler(adminController.deleteUser));
