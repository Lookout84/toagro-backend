import { Request, Response } from 'express';
import { logger } from '../utils/logger';

export const testController = {
  /**
   * Тестовий endpoint для перевірки отримання даних з фронтенду
   */
  async testGeolocation(req: Request, res: Response): Promise<void> {
    try {
      logger.info('🧪 TEST GEOLOCATION ENDPOINT');
      logger.info('Отримані дані:');
      logger.info('- Body:', JSON.stringify(req.body, null, 2));
      logger.info('- Query:', JSON.stringify(req.query, null, 2));
      logger.info('- Headers:', JSON.stringify(req.headers, null, 2));
      
      if (req.files) {
        logger.info('- Files:', (req.files as Express.Multer.File[]).map(f => ({
          fieldname: f.fieldname,
          originalname: f.originalname,
          size: f.size
        })));
      }

      // Перевіряємо геолокаційні дані
      const { userGeolocation, mapLocation, location } = req.body;
      
      if (userGeolocation) {
        logger.info('✅ UserGeolocation отримано:', userGeolocation);
      }
      
      if (mapLocation) {
        logger.info('✅ MapLocation отримано:', mapLocation);
      }
      
      if (location) {
        logger.info('✅ Location отримано:', location);
      }

      res.json({
        status: 'success',
        message: 'Дані успішно отримано та залоговано',
        received: {
          body: req.body,
          query: req.query,
          hasFiles: !!(req.files && (req.files as Express.Multer.File[]).length > 0),
          filesCount: req.files ? (req.files as Express.Multer.File[]).length : 0
        }
      });
    } catch (error: any) {
      logger.error('Помилка в тестовому endpoint:', error);
      res.status(500).json({
        status: 'error',
        message: 'Помилка сервера',
        details: error.message
      });
    }
  }
};
