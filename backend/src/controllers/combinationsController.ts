import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import * as combinationsService from '../services/combinationsService';

export const listCombinations = async (_req: Request, res: Response): Promise<void> => {
  const combinations = await combinationsService.listCombinations();
  sendSuccess(res, combinations);
};

export const getCombination = async (req: Request, res: Response): Promise<void> => {
  const combination = await combinationsService.getCombinationById(req.params.id);
  sendSuccess(res, combination);
};

export const createCombination = async (req: Request, res: Response): Promise<void> => {
  const combination = await combinationsService.createCombination(req.body);
  sendSuccess(res, combination, 201);
};

export const updateCombination = async (req: Request, res: Response): Promise<void> => {
  const combination = await combinationsService.updateCombination(req.params.id, req.body);
  sendSuccess(res, combination);
};

export const deleteCombination = async (req: Request, res: Response): Promise<void> => {
  await combinationsService.deleteCombination(req.params.id);
  sendSuccess(res, { id: req.params.id });
};
