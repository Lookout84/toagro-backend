import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listingService } from '../services/listingService';
import { logger } from '../utils/logger';
import {
  createListingSchema,
  updateListingSchema,
  listingQuerySchema,
  listingIdParamSchema,
} from '../schemas/listingSchema';

const prisma = new PrismaClient();

export const listingController = {
  /**
   * Створення нового оголошення
   */
  async createListing(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Спроба створення оголошення');
      logger.debug('Отримані дані:', JSON.stringify(req.body));

      // 1. Перевіряємо наявність тіла запиту
      if (!req.body || Object.keys(req.body).length === 0) {
        logger.warn('Отримано порожнє тіло запиту');
        res.status(400).json({
          status: 'error',
          message: 'Відсутні дані для створення оголошення',
        });
        return;
      }

      // 2. Валідація даних
      const validationResult = createListingSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn('Помилка валідації даних:', JSON.stringify(validationResult.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.format(),
        });
        return;
      }

      // 3. Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба створення оголошення без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // 4. Перетворюємо condition в формат для бази даних (NEW/USED)
      const condition = validationResult.data.condition === 'new' ? 'NEW' : 'USED';
      
      // 5. Створюємо оголошення
      const { listing } = await listingService.createListing({
        ...validationResult.data,
        userId,
        condition,
      });

      // 6. Успішна відповідь
      logger.info(`Створено нове оголошення з ID: ${listing.id}`);
      res.status(201).json({
        status: 'success',
        message: 'Оголошення успішно створено',
        data: { listing },
      });
    } catch (error: any) {
      logger.error(`Помилка створення оголошення: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося створити оголошення',
        details: error.message,
      });
    }
  },

  /**
   * Оновлення існуючого оголошення
   */
  async updateListing(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Спроба оновлення оголошення');
      
      // 1. Валідація ID оголошення
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn('Некоректний ID оголошення:', JSON.stringify(paramsValidation.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.format(),
        });
        return;
      }
      
      const { id } = paramsValidation.data;
      
      // 2. Валідація даних для оновлення
      const validationResult = updateListingSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn('Помилка валідації даних для оновлення:', JSON.stringify(validationResult.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.format(),
        });
        return;
      }
      
      // 3. Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба оновлення оголошення без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }
      
      // 4. Перевіряємо права доступу
      const isOwner = await listingService.isListingOwner(id, userId);
      const isAdmin = (req as any).user?.role === 'ADMIN';
      
      if (!isOwner && !isAdmin) {
        logger.warn(`Користувач ${userId} намагається оновити чуже оголошення ${id}`);
        res.status(403).json({
          status: 'error',
          message: 'У вас немає прав для редагування цього оголошення',
        });
        return;
      }
      
      // 5. Підготовка даних для оновлення
      const updateData: any = { ...validationResult.data };
      
      // Перетворюємо condition в формат для бази даних, якщо він присутній
      if (updateData.condition) {
        updateData.condition = updateData.condition === 'new' ? 'NEW' : 'USED';
      }
      
      // 6. Оновлюємо оголошення
      const { listing } = await listingService.updateListing(id, updateData);
      
      // 7. Успішна відповідь
      logger.info(`Оголошення з ID ${id} успішно оновлено`);
      res.status(200).json({
        status: 'success',
        message: 'Оголошення успішно оновлено',
        data: { listing },
      });
    } catch (error: any) {
      logger.error(`Помилка оновлення оголошення: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося оновити оголошення',
          details: error.message,
        });
      }
    }
  },

  /**
   * Отримання списку оголошень з фільтрами
   */
  async getListings(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Запит на отримання списку оголошень');
      
      // 1. Валідація параметрів запиту
      const queryValidation = listingQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        logger.warn('Некоректні параметри запиту:', JSON.stringify(queryValidation.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.format(),
        });
        return;
      }
      
      // 2. Отримання списку оголошень
      const filters = queryValidation.data;
      const result = await listingService.getListings(filters);
      
      // 3. Успішна відповідь
      logger.info(`Отримано ${result.listings.length} оголошень з ${result.total} загальних`);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання списку оголошень: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список оголошень',
        details: error.message,
      });
    }
  },

  /**
   * Отримання деталей конкретного оголошення
   */
  async getListing(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Запит на отримання оголошення');
      
      // 1. Валідація параметра ID
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn('Некоректний ID оголошення:', JSON.stringify(paramsValidation.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.format(),
        });
        return;
      }
      
      const { id } = paramsValidation.data;
      
      // 2. Отримання оголошення
      const result = await listingService.getListing(id);
      
      // 3. Успішна відповідь
      logger.info(`Отримано оголошення з ID ${id}`);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання оголошення: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося отримати оголошення',
          details: error.message,
        });
      }
    }
  },

  /**
   * Видалення оголошення
   */
  async deleteListing(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Запит на видалення оголошення');
      
      // 1. Валідація параметра ID
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn('Некоректний ID оголошення:', JSON.stringify(paramsValidation.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.format(),
        });
        return;
      }
      
      const { id } = paramsValidation.data;
      
      // 2. Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба видалення оголошення без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }
      
      // 3. Перевіряємо права доступу
      const isOwner = await listingService.isListingOwner(id, userId);
      const isAdmin = (req as any).user?.role === 'ADMIN';
      
      if (!isOwner && !isAdmin) {
        logger.warn(`Користувач ${userId} намагається видалити чуже оголошення ${id}`);
        res.status(403).json({
          status: 'error',
          message: 'У вас немає прав для видалення цього оголошення',
        });
        return;
      }
      
      // 4. Видаляємо оголошення
      await listingService.deleteListing(id);
      
      // 5. Успішна відповідь
      logger.info(`Оголошення з ID ${id} успішно видалено`);
      res.status(200).json({
        status: 'success',
        message: 'Оголошення успішно видалено',
      });
    } catch (error: any) {
      logger.error(`Помилка видалення оголошення: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося видалити оголошення',
          details: error.message,
        });
      }
    }
  },

  /**
   * Отримання оголошень користувача
   */
  async getUserListings(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Запит на отримання оголошень користувача');
      
      // 1. Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба отримання оголошень без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }
      
      // 2. Валідація параметрів запиту
      const queryValidation = listingQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        logger.warn('Некоректні параметри запиту:', JSON.stringify(queryValidation.error.errors));
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.format(),
        });
        return;
      }
      
      // 3. Отримання списку оголошень користувача
      const filters = {
        ...queryValidation.data,
        userId,
      };
      
      const result = await listingService.getListings(filters);
      
      // 4. Успішна відповідь
      logger.info(`Отримано ${result.listings.length} оголошень користувача з ${result.total} загальних`);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання оголошень користувача: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати оголошення користувача',
        details: error.message,
      });
    }
  }
};