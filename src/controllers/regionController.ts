import { Request, Response, NextFunction } from 'express';
import { regionsService } from '../services/regionsService';

export const regionController = {
  /**
   * Отримати всі області (регіони) з фільтром по країні
   */
  async getRegions(req: Request, res: Response, next: NextFunction) {
    try {
      const countryId = req.query.countryId
        ? Number(req.query.countryId)
        : undefined;
      const regions = await regionsService.getRegions(countryId);
      res.status(200).json({
        status: 'success',
        data: regions,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримати регіон за ID
   */
  async getRegionById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const region = await regionsService.getRegionById(id);
      if (!region) {
        return res.status(404).json({
          status: 'error',
          message: 'Регіон не знайдено',
        });
      }
      res.status(200).json({
        status: 'success',
        data: region,
      });
    } catch (error) {
      next(error);
    }
  },
  async getRegionsByCountry(req: Request, res: Response, next: NextFunction) {
    try {
      const countryId = Number(req.params.countryId);
      if (isNaN(countryId)) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Некоректний countryId' });
      }
      const regions = await regionsService.getRegions(countryId);
      res.status(200).json({ status: 'success', data: regions });
    } catch (error) {
      next(error);
    }
  },
};
