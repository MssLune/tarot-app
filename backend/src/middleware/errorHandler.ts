import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { sendError } from '../utils/response';

/** Middleware central de errores: toda respuesta de error pasa por acá con formato consistente. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 409, 'DUPLICATE_ENTRY', 'Ya existe un registro con ese identificador.');
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'El recurso solicitado no existe.');
      return;
    }
  }

  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado en el servidor.');
}
