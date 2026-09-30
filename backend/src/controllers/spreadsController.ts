import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import * as spreadsService from '../services/spreadsService';

export const listSpreads = async (req: Request, res: Response): Promise<void> => {
  const { search } = req.query;
  const spreads = await spreadsService.listSpreads({
    search: typeof search === 'string' ? search : undefined,
  });
  sendSuccess(res, spreads);
};

export const getSpread = async (req: Request, res: Response): Promise<void> => {
  const spread = await spreadsService.getSpreadById(req.params.id);
  sendSuccess(res, spread);
};

export const createSpread = async (req: Request, res: Response): Promise<void> => {
  const spread = await spreadsService.createSpread(req.body);
  sendSuccess(res, spread, 201);
};

export const updateSpread = async (req: Request, res: Response): Promise<void> => {
  const spread = await spreadsService.updateSpread(req.params.id, req.body);
  sendSuccess(res, spread);
};

export const deleteSpread = async (req: Request, res: Response): Promise<void> => {
  await spreadsService.deleteSpread(req.params.id);
  sendSuccess(res, { id: req.params.id });
};
