import { Request, Response } from 'express';
import { communityService } from '../services/communityService';
import { logger } from '../utils/logger';

export const communityController = {
  /**
   * Отримати всі громади для конкретної області (regionId)
   */
  async getCommunitiesByRegion(req: Request, res: Response) {
    try {
      const regionId = Number(req.params.regionId);
      if (isNaN(regionId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Некоректний regionId',
        });
      }
      const communities = await communityService.getCommunitiesByRegion(regionId);
      res.status(200).json({
        status: 'success',
        data: communities,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання громад: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список громад',
        details: error.message,
      });
    }
  },

  /**
   * Отримати громаду за її ID
   */
  async getCommunityById(req: Request, res: Response) {
    try {
      const communityId = Number(req.params.communityId);
      if (isNaN(communityId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Некоректний communityId',
        });
      }
      const community = await communityService.getCommunityById(communityId);
      if (!community) {
        return res.status(404).json({
          status: 'error',
          message: 'Громаду не знайдено',
        });
      }
      res.status(200).json({
        status: 'success',
        data: community,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання громади: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати громаду',
        details: error.message,
      });
    }
  },
};