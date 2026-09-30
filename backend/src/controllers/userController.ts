import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import * as userService from '../services/userService';

/* ---------- Perfil ---------- */

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const profile = await userService.getProfile(userId);
  sendSuccess(res, profile);
};

/* ---------- Mazos ---------- */

export const listDecks = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const decks = await userService.listUserDecks(userId);
  sendSuccess(res, decks);
};

export const getDeck = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const deck = await userService.getUserDeck(userId, req.params.id);
  sendSuccess(res, deck);
};

export const createDeck = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const deck = await userService.createUserDeck(userId, req.body);
  sendSuccess(res, deck, 201);
};

/** Upsert: 201 si lo creó, 200 si actualizó. El frontend no tiene que probar. */
export const updateDeck = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const { deck, created } = await userService.upsertUserDeck(userId, req.params.id, req.body);
  sendSuccess(res, deck, created ? 201 : 200);
};

export const deleteDeck = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  await userService.deleteUserDeck(userId, req.params.id);
  sendSuccess(res, { id: req.params.id });
};

/* ---------- Tiradas ---------- */

export const listSpreads = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const spreads = await userService.listUserSpreads(userId);
  sendSuccess(res, spreads);
};

export const getSpread = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const spread = await userService.getUserSpread(userId, req.params.id);
  sendSuccess(res, spread);
};

export const createSpread = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const spread = await userService.createUserSpread(userId, req.body);
  sendSuccess(res, spread, 201);
};

/** Upsert: 201 si lo creó, 200 si actualizó. */
export const updateSpread = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const { spread, created } = await userService.upsertUserSpread(userId, req.params.id, req.body);
  sendSuccess(res, spread, created ? 201 : 200);
};

export const deleteSpread = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  await userService.deleteUserSpread(userId, req.params.id);
  sendSuccess(res, { id: req.params.id });
};

/* ---------- Lecturas ---------- */

export const listReadings = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const readings = await userService.listUserReadings(userId);
  sendSuccess(res, readings);
};

export const getReading = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const reading = await userService.getUserReading(userId, req.params.id);
  sendSuccess(res, reading);
};

export const createReading = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const reading = await userService.createUserReading(userId, req.body);
  sendSuccess(res, reading, 201);
};

export const deleteReading = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  await userService.deleteUserReading(userId, req.params.id);
  sendSuccess(res, { id: req.params.id });
};

/* ---------- Rituales ---------- */

export const listRituals = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const rituals = await userService.listUserRituals(userId);
  sendSuccess(res, rituals);
};

export const createRitual = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const ritual = await userService.createUserRitual(userId, req.body);
  sendSuccess(res, ritual, 201);
};

/** Upsert: crea el ritual si el id no existe (201) o lo actualiza (200). */
export const updateRitual = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  const { ritual, created } = await userService.upsertUserRitual(userId, req.params.id, req.body);
  sendSuccess(res, ritual, created ? 201 : 200);
};

export const deleteRitual = async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).dbUserId as string;
  await userService.deleteUserRitual(userId, req.params.id);
  sendSuccess(res, { id: req.params.id });
};
