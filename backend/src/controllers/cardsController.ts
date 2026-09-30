import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import * as cardsService from '../services/cardsService';

export const listCards = async (req: Request, res: Response): Promise<void> => {
  const { search, element, axis, energy, arcanaType, suit } = req.query;
  const cards = await cardsService.listCards({
    search: typeof search === 'string' ? search : undefined,
    element: typeof element === 'string' ? element : undefined,
    axis: typeof axis === 'string' ? axis : undefined,
    energy: typeof energy === 'string' ? energy : undefined,
    arcanaType: typeof arcanaType === 'string' ? arcanaType : undefined,
    suit: typeof suit === 'string' ? suit : undefined,
  });
  sendSuccess(res, cards);
};

export const getCard = async (req: Request, res: Response): Promise<void> => {
  const card = await cardsService.getCardById(req.params.id);
  sendSuccess(res, card);
};

export const createCard = async (req: Request, res: Response): Promise<void> => {
  const card = await cardsService.createCard(req.body);
  sendSuccess(res, card, 201);
};

export const updateCard = async (req: Request, res: Response): Promise<void> => {
  const card = await cardsService.updateCard(req.params.id, req.body);
  sendSuccess(res, card);
};

export const deleteCard = async (req: Request, res: Response): Promise<void> => {
  await cardsService.deleteCard(req.params.id);
  sendSuccess(res, { id: req.params.id });
};
