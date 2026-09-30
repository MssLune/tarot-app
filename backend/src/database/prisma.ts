import { PrismaClient } from '@prisma/client';

/** Instancia única de Prisma para todo el proceso. */
export const prisma = new PrismaClient();
