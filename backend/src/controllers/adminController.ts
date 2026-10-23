import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';
import { borrarCuenta } from '../services/accounts';

/* ==========================================================================
   Controlador de administración: gestión de usuarios.
   ========================================================================== */

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  sendSuccess(res, users);
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'No existe un usuario con ese id.');
  sendSuccess(res, user);
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    throw ApiError.badRequest('INVALID_ROLE', 'El rol debe ser "user" o "admin".');
  }
  /* Quitarse el admin a uno mismo puede dejar la app sin ningún admin, y
     entonces no hay desde dónde devolverlo sin tocar la base a mano. */
  if (req.params.id === (req as any).dbUserId && role !== 'admin') {
    throw ApiError.badRequest('CANNOT_DEMOTE_SELF', 'No puedes quitarte el rol de admin a ti mismo.');
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  sendSuccess(res, user);
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'No existe un usuario con ese id.');

  if (req.params.id === (req as any).dbUserId) {
    throw ApiError.badRequest('CANNOT_DELETE_SELF', 'No puedes borrar tu propia cuenta desde el panel.');
  }

  /* Borrado completo: cancela la suscripción en Stripe, borra la cuenta en
     Clerk y después la fila. Ver `borrarCuenta`. */
  await borrarCuenta(req.params.id, { borrarEnClerk: true });
  sendSuccess(res, { id: req.params.id });
};
