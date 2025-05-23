import { Request, Response, NextFunction } from 'express';
import { campaignService } from '../services/campaignService';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { logger } from '../utils/logger';

export const campaignController = {
  /**
   * Створення нової кампанії
   */
  /**
 * @swagger
 * /api/campaigns:
 *   post:
 *     tags:
 *       - Campaigns
 *     summary: Створення нової кампанії
 *     description: Створює нову маркетингову кампанію
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *                 example: Весняна кампанія 2025
 *               description:
 *                 type: string
 *                 example: Кампанія для залучення фермерів навесні
 *               type:
 *                 type: string
 *                 enum: [EMAIL, SMS, PUSH, MIXED, PROMO, EVENT, NEWSLETTER]
 *                 example: EMAIL
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-03-01T00:00:00Z'
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-04-01T23:59:59Z'
 *               targetAudience:
 *                 type: object
 *                 example: {"role": "USER", "isVerified": true}
 *               goal:
 *                 type: string
 *                 example: Збільшення продажів насіння
 *               budget:
 *                 type: number
 *                 example: 10000
 *     responses:
 *       201:
 *         description: Кампанію успішно створено
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Кампанію успішно створено
 *                 data:
 *                   type: object
 *                   properties:
 *                     campaign:
 *                       $ref: '#/definitions/Campaign'
 *       400:
 *         description: Помилка валідації даних
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 *       401:
 *         description: Користувач не автентифікований
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async createCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        description,
        type,
        startDate,
        endDate,
        targetAudience,
        goal,
        budget,
      } = req.body;

      const createdById = req.userId!;

      // Перетворюємо рядкові дати в об'єкти Date
      const parsedStartDate = startDate ? new Date(startDate) : undefined;
      const parsedEndDate = endDate ? new Date(endDate) : undefined;

      // Валідація дат
      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Дата початку не може бути пізніше дати закінчення'
        });
      }

      const campaign = await campaignService.createCampaign({
        name,
        description,
        type,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        targetAudience,
        goal,
        budget,
        createdById,
      });

      res.status(201).json({
        status: 'success',
        message: 'Кампанію успішно створено',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Оновлення існуючої кампанії
   */
  async updateCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const {
        name,
        description,
        type,
        status,
        startDate,
        endDate,
        targetAudience,
        goal,
        budget,
      } = req.body;

      // Перетворюємо рядкові дати в об'єкти Date або null
      let parsedStartDate = undefined;
      let parsedEndDate = undefined;

      if (startDate === null) {
        parsedStartDate = null;
      } else if (startDate) {
        parsedStartDate = new Date(startDate);
      }

      if (endDate === null) {
        parsedEndDate = null;
      } else if (endDate) {
        parsedEndDate = new Date(endDate);
      }

      // Валідація дат
      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Дата початку не може бути пізніше дати закінчення'
        });
      }

      const campaign = await campaignService.updateCampaign(id, {
        name,
        description,
        type,
        status,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        targetAudience,
        goal,
        budget,
      });

      res.status(200).json({
        status: 'success',
        message: 'Кампанію успішно оновлено',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання кампанії за ID
   */
  async getCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const campaign = await campaignService.getCampaign(id);

      res.status(200).json({
        status: 'success',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання списку кампаній
   */
  /**
 * @swagger
 * /api/campaigns:
 *   get:
 *     tags:
 *       - Campaigns
 *     summary: Отримання списку кампаній
 *     description: Повертає список кампаній з можливістю фільтрації та пагінацією
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED]
 *         description: Фільтр за статусом кампанії
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [EMAIL, SMS, PUSH, MIXED, PROMO, EVENT, NEWSLETTER]
 *         description: Фільтр за типом кампанії
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Пошук за назвою або описом
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер сторінки для пагінації
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Кількість елементів на сторінці
 *     responses:
 *       200:
 *         description: Успішне отримання списку кампаній
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     campaigns:
 *                       type: array
 *                       items:
 *                         $ref: '#/definitions/Campaign'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         pages:
 *                           type: integer
 *                           example: 5
 *       401:
 *         description: Користувач не автентифікований
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async getCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        status,
        type,
        search,
        startDateFrom,
        startDateTo,
        endDateFrom,
        endDateTo,
        page,
        limit,
      } = req.query;

      // Парсимо параметри фільтрації
      const filters: any = {};

      if (status) {
        filters.status = status as CampaignStatus;
      }

      if (type) {
        filters.type = type as CampaignType;
      }

      if (search) {
        filters.search = search as string;
      }

      if (startDateFrom) {
        filters.startDateFrom = new Date(startDateFrom as string);
      }

      if (startDateTo) {
        filters.startDateTo = new Date(startDateTo as string);
      }

      if (endDateFrom) {
        filters.endDateFrom = new Date(endDateFrom as string);
      }

      if (endDateTo) {
        filters.endDateTo = new Date(endDateTo as string);
      }

      if (page) {
        filters.page = parseInt(page as string);
      }

      if (limit) {
        filters.limit = parseInt(limit as string);
      }

      // Для отримання кампаній, створених користувачем (якщо не адміністратор)
      if (req.userRole !== 'ADMIN') {
        filters.createdById = req.userId;
      }

      const result = await campaignService.getCampaigns(filters);

      res.status(200).json({
        status: 'success',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Видалення кампанії
   */
  async deleteCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      await campaignService.deleteCampaign(id);

      res.status(200).json({
        status: 'success',
        message: 'Кампанію успішно видалено'
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Активація кампанії
   */
  async activateCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const campaign = await campaignService.activateCampaign(id);

      res.status(200).json({
        status: 'success',
        message: 'Кампанію успішно активовано',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Призупинення кампанії
   */
  async pauseCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const campaign = await campaignService.deactivateCampaign(id, CampaignStatus.PAUSED);

      res.status(200).json({
        status: 'success',
        message: 'Кампанію успішно призупинено',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Скасування кампанії
   */
  async cancelCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const campaign = await campaignService.deactivateCampaign(id, CampaignStatus.CANCELLED);

      res.status(200).json({
        status: 'success',
        message: 'Кампанію успішно скасовано',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Запуск розсилки для кампанії
   */
  async startCampaignMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const { type } = req.body;

      if (!type || !Object.values(CampaignType).includes(type as CampaignType)) {
        return res.status(400).json({
          status: 'error',
          message: 'Невірний тип розсилки'
        });
      }

      const result = await campaignService.startCampaignMessages(id, type as CampaignType);

      res.status(200).json({
        status: 'success',
        message: 'Розсилку успішно запущено',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Аналітика кампанії
   */
  async getCampaignAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const analytics = await campaignService.getCampaignAnalytics(id);

      res.status(200).json({
        status: 'success',
        data: { analytics }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання типів кампаній
   */
  async getCampaignTypes(req: Request, res: Response, next: NextFunction) {
    try {
      // Повертаємо список всіх типів кампаній
      const types = Object.values(CampaignType);

      res.status(200).json({
        status: 'success',
        data: { types }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання статусів кампаній
   */
  async getCampaignStatuses(req: Request, res: Response, next: NextFunction) {
    try {
      // Повертаємо список всіх статусів кампаній
      const statuses = Object.values(CampaignStatus);

      res.status(200).json({
        status: 'success',
        data: { statuses }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Створення тестової кампанії
   */
  async createTestCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const createdById = req.userId!;
      
      // Створюємо тестову кампанію з мінімальними даними
      const campaign = await campaignService.createCampaign({
        name: `Тестова кампанія ${new Date().toISOString().split('T')[0]}`,
        description: 'Автоматично створена тестова кампанія',
        type: CampaignType.EMAIL,
        targetAudience: { specificIds: [createdById] }, // Тільки для створювача
        createdById,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Тестову кампанію успішно створено',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Дублювання існуючої кампанії
   */
  async duplicateCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const createdById = req.userId!;
      
      // Отримуємо оригінальну кампанію
      const originalCampaign = await campaignService.getCampaign(id);
      
      if (!originalCampaign) {
        return res.status(404).json({
          status: 'error',
          message: 'Кампанію не знайдено'
        });
      }
      
      // Створюємо нову кампанію на основі існуючої
      // Виправлено: додано перевірки на null і конвертацію в правильні типи
      const campaign = await campaignService.createCampaign({
        name: `Копія: ${originalCampaign.name}`,
        description: originalCampaign.description || undefined,
        type: originalCampaign.type as CampaignType,
        targetAudience: originalCampaign.targetAudience,
        goal: originalCampaign.goal || undefined,
        budget: originalCampaign.budget !== null ? originalCampaign.budget : undefined,
        createdById,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Кампанію успішно дубльовано',
        data: { campaign }
      });
    } catch (error) {
      next(error);
    }
  }
};