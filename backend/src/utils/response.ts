import type { Response } from 'express';

/** Respuesta exitosa: { success: true, data }. */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

/** Respuesta de error: { success: false, error: { code, message } }. */
export function sendError(res: Response, statusCode: number, code: string, message: string): void {
  res.status(statusCode).json({ success: false, error: { code, message } });
}
