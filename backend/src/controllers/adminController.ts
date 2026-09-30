import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { prisma } from '../database/prisma';
import { ApiError } from '../utils/ApiError';

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

  await prisma.user.delete({ where: { id: req.params.id } });
  sendSuccess(res, { id: req.params.id });
};
