import { Request, Response } from 'express';
import { regionsService } from '../services/regionsService';
import { logger } from '../utils/logger';

export const regionController = {
  /**
   * Отримати всі області (регіони)
   */
  async getRegions(req: Request, res: Response) {
    try {
      const regions = await regionsService.getRegions();
      res.status(200).json({
        status: 'success',
        data: regions,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання регіонів: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список регіонів',
        details: error.message,
      });
    }
  },
};