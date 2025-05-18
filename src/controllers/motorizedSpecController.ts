import { Request, Response, NextFunction } from 'express';
import { motorizedSpecService } from '../services/motorizedSpecService';
import { motorizedSpecSchema } from '../schemas/motorizedSpecSchema';

export const motorizedSpecController = {
  async createOrUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      const data = req.body;

      // Валідація
      const parsed = motorizedSpecSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ status: 'error', errors: parsed.error.format() });
      }

      // Якщо вже існує — оновити, інакше створити
      const existing = await motorizedSpecService.getMotorizedSpecByListing(listingId);
      let result;
      if (existing) {
        result = await motorizedSpecService.updateMotorizedSpec(listingId, parsed.data);
      } else {
        result = await motorizedSpecService.createMotorizedSpec(listingId, parsed.data);
      }

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getByListing(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      const result = await motorizedSpecService.getMotorizedSpecByListing(listingId);
      if (!result) {
        return res.status(404).json({ status: 'error', message: 'Не знайдено' });
      }
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      await motorizedSpecService.deleteMotorizedSpec(listingId);
      res.status(200).json({ status: 'success', message: 'Видалено' });
    } catch (error) {
      next(error);
    }
  },
};