import type { Request, Response } from 'express';
import { sendError } from '../utils/response';

/** Handler final para rutas que no matchean ningún endpoint conocido. */
export function notFound(req: Request, res: Response): void {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No existe la ruta ${req.method} ${req.originalUrl}.`);
}
