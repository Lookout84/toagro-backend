import { Request, Response, NextFunction } from 'express';
import { listingService } from '../services/listingService';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import {
  createListingSchema,
  updateListingSchema,
  listingQuerySchema,
  listingIdParamSchema,
} from '../schemas/listingSchema';
import { CreateListingInput } from '../schemas/listingSchema';

const prisma = new PrismaClient();

export const listingController = {
  /**
   * @swagger
   * /api/listings:
   *   post:
   *     tags:
   *       - Listings
   *     summary: Створення нового оголошення
   *     description: Створює нове оголошення для автентифікованого користувача
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/definitions/CreateListingRequest'
   *     responses:
   *       201:
   *         description: Оголошення успішно створено
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
   *                   example: Оголошення успішно створено
   *                 data:
   *                   type: object
   *                   properties:
   *                     listing:
   *                       $ref: '#/definitions/Listing'
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
  async createListing(req: Request, res: Response): Promise<void> {
    try {
      // Логуємо отримані дані для діагностики
      console.log('Отримані дані:', req.body);
      console.log('Content-Type:', req.headers['content-type']);

      // Перевіряємо наявність тіла запиту
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Відсутні дані для створення оголошення',
        });
        return;
      }

      // Перевірка наявності обов'язкових полів
      const requiredFields = [
        'title',
        'description',
        'price',
        'location',
        'category',
        'categoryId',
      ];
      const missingFields = requiredFields.filter(
        (field) => req.body[field] === undefined
      );

      if (missingFields.length > 0) {
        res.status(400).json({
          status: 'error',
          message: `Відсутні обов'язкові поля: ${missingFields.join(', ')}`,
          receivedData: req.body,
        });
        return;
      }

      // Перетворення типів даних перед валідацією
      const preprocessedData = {
        ...req.body,
        title: String(req.body.title || ''),
        description: String(req.body.description || ''),
        price:
          typeof req.body.price === 'string'
            ? Number(req.body.price)
            : req.body.price,
        location: String(req.body.location || ''),
        category: String(req.body.category || ''),
        categoryId:
          typeof req.body.categoryId === 'string'
            ? Number(req.body.categoryId)
            : req.body.categoryId,
        brandId: req.body.brandId
          ? typeof req.body.brandId === 'string'
            ? Number(req.body.brandId)
            : req.body.brandId
          : undefined,
        images: Array.isArray(req.body.images)
          ? req.body.images
          : req.body.images
            ? [req.body.images]
            : [],
        condition: req.body.condition?.toLowerCase() || 'used',
      };

      console.log('Препроцесовані дані:', preprocessedData);

      // Валідація тіла запиту
      const validationResult = createListingSchema.safeParse(preprocessedData);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.errors,
          receivedData: preprocessedData,
        });
        return;
      }

      // Отримуємо ID користувача з JWT токена
      if (!(req as any).user || !(req as any).user.id) {
        res.status(401).json({
          status: 'error',
          message:
            'Користувач не автентифікований або відсутній ID користувача',
        });
        return;
      }

      const userId = (req as any).user.id;

      // Логуємо валідовані дані
      console.log('Валідовані дані:', validationResult.data);

      // Створюємо оголошення
      const { listing } = await listingService.createListing({
        ...validationResult.data,
        userId,
        condition: ((): 'NEW' | 'USED' => {
          const cond = validationResult.data.condition?.toLowerCase();
          return cond === 'new' ? 'NEW' : 'USED';
        })(),
      });

      res.status(201).json({
        status: 'success',
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
  // async createListing(req: Request, res: Response): Promise<void> {
  //   try {
  //     // Перевіряємо наявність тіла запиту
  //     if (!req.body || Object.keys(req.body).length === 0) {
  //       res.status(400).json({
  //         status: 'error',
  //         message: 'Відсутні дані для створення оголошення',
  //       });
  //       return;
  //     }

  //     // Перетворення типів даних перед валідацією
  //     const preprocessedData = {
  //       ...req.body,
  //       title: String(req.body.title || ''),
  //       description: String(req.body.description || ''),
  //       price:
  //         typeof req.body.price === 'string'
  //           ? Number(req.body.price)
  //           : req.body.price,
  //       location: String(req.body.location || ''),
  //       category: String(req.body.category || ''),
  //       categoryId:
  //         typeof req.body.categoryId === 'string'
  //           ? Number(req.body.categoryId)
  //           : req.body.categoryId,
  //       brandId: req.body.brandId
  //         ? typeof req.body.brandId === 'string'
  //           ? Number(req.body.brandId)
  //           : req.body.brandId
  //         : undefined,
  //       images: Array.isArray(req.body.images)
  //         ? req.body.images
  //         : req.body.images
  //           ? [req.body.images]
  //           : [],
  //       condition: req.body.condition?.toLowerCase() || 'used',
  //     };

  //     // Валідація тіла запиту
  //     const validationResult = createListingSchema.safeParse(preprocessedData);
  //     if (!validationResult.success) {
  //       res.status(400).json({
  //         status: 'error',
  //         message: 'Помилка валідації',
  //         errors: validationResult.error.errors,
  //       });
  //       return;
  //     }

  //     // Отримуємо ID користувача з JWT токена
  //     if (!(req as any).user || !(req as any).user.id) {
  //       res.status(401).json({
  //         status: 'error',
  //         message:
  //           'Користувач не автентифікований або відсутній ID користувача',
  //       });
  //       return;
  //     }

  //     const userId = (req as any).user.id;

  //     // Створюємо оголошення
  //     const { listing } = await listingService.createListing({
  //       ...validationResult.data,
  //       userId,
  //       condition: ((): 'NEW' | 'USED' => {
  //         const cond = validationResult.data.condition?.toLowerCase();
  //         return cond === 'new' ? 'NEW' : 'USED';
  //       })(),
  //     });

  //     res.status(201).json({
  //       status: 'success',
  //       data: { listing },
  //     });
  //   } catch (error: any) {
  //     logger.error(`Помилка створення оголошення: ${error.message}`);
  //     res.status(500).json({
  //       status: 'error',
  //       message: 'Не вдалося створити оголошення',
  //       details: error.message,
  //     });
  //   }
  // },

  // Додайте цей новий метод до listingController
  async createListingSimple(req: Request, res: Response): Promise<void> {
    try {
      console.log('=== SIMPLE LISTING CREATION ===');
      console.log('Отримані дані:', req.body);

      // Перевіряємо наявність тіла запиту
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Відсутні дані для створення оголошення',
        });
        return;
      }

      // Отримуємо ID користувача з JWT токена
      if (!(req as any).user || !(req as any).user.id) {
        res.status(401).json({
          status: 'error',
          message:
            'Користувач не автентифікований або відсутній ID користувача',
        });
        return;
      }

      const userId = (req as any).user.id;

      // Перетворення типів та встановлення дефолтних значень
      const listingData = {
        title: String(req.body.title || ''),
        description: String(req.body.description || ''),
        price: Number(req.body.price || 0),
        location: String(req.body.location || ''),
        category: String(req.body.category || ''),
        categoryId: Number(req.body.categoryId || 0),
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        images: Array.isArray(req.body.images)
          ? req.body.images
          : req.body.images
            ? [req.body.images]
            : [],
        condition: req.body.condition?.toLowerCase() === 'new' ? 'NEW' : 'USED',
        userId: userId,
      };

      console.log('Оброблені дані:', listingData);

      // Мінімальна валідація
      const requiredFields: (keyof typeof listingData)[] = [
        'title',
        'description',
        'price',
        'location',
        'category',
        'categoryId',
      ];
      const missingFields = requiredFields.filter(
        (field) => !listingData[field]
      );

      if (missingFields.length > 0) {
        res.status(400).json({
          status: 'error',
          message: `Відсутні обов'язкові поля: ${missingFields.join(', ')}`,
        });
        return;
      }

      // Створення оголошення напряму через prisma
      const listing = await prisma.listing.create({
        data: {
          title: listingData.title,
          description: listingData.description,
          price: listingData.price,
          location: listingData.location,
          category: listingData.category,
          categoryId: listingData.categoryId,
          brandId: listingData.brandId,
          images: listingData.images,
          condition: listingData.condition as any,
          userId: userId,
          active: true,
        },
      });

      res.status(201).json({
        status: 'success',
        message: 'Оголошення створено успішно',
        data: { listing },
      });
    } catch (error: any) {
      console.error('Simple creation error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося створити оголошення',
        details: error.message,
      });
    }
  },

  async updateListing(req: Request, res: Response): Promise<void> {
    try {
      // Валідація параметра ID
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.errors,
        });
        return;
      }

      const { id } = paramsValidation.data;

      // Перетворення типів даних перед валідацією
      const preprocessedData = {
        ...req.body,
        price:
          typeof req.body.price === 'string'
            ? Number(req.body.price)
            : req.body.price,
        categoryId: req.body.categoryId
          ? typeof req.body.categoryId === 'string'
            ? Number(req.body.categoryId)
            : req.body.categoryId
          : undefined,
        brandId: req.body.brandId
          ? typeof req.body.brandId === 'string'
            ? Number(req.body.brandId)
            : req.body.brandId
          : undefined,
        images: Array.isArray(req.body.images)
          ? req.body.images
          : req.body.images
            ? [req.body.images]
            : undefined,
        condition: req.body.condition?.toLowerCase(),
      };

      // Валідація тіла запиту
      const validationResult = updateListingSchema.safeParse(preprocessedData);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.errors,
        });
        return;
      }

      // Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // Перевіряємо, чи є користувач власником оголошення або адміністратором
      const isOwner = await listingService.isListingOwner(id, userId);
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        res.status(403).json({
          status: 'error',
          message: 'У вас немає прав для редагування цього оголошення',
        });
        return;
      }

      // Формуємо updateData без undefined для обов'язкових полів
      const updateData: any = {
        userId, // Додаємо userId, оскільки він є обов'язковим у UpdateListingData
        ...Object.fromEntries(
          Object.entries(validationResult.data).filter(
            ([_, v]) => v !== undefined
          )
        ),
      };

      // Примусово приводимо до string, якщо поля присутні
      if (updateData.title !== undefined)
        updateData.title = String(updateData.title);
      if (updateData.description !== undefined)
        updateData.description = String(updateData.description);
      if (updateData.location !== undefined)
        updateData.location = String(updateData.location);
      if (updateData.category !== undefined)
        updateData.category = String(updateData.category);

      if (updateData.condition) {
        updateData.condition = updateData.condition.toLowerCase() as
          | 'new'
          | 'used';
      }

      // Оновлюємо оголошення
      const { listing } = await listingService.updateListing(id, updateData);

      res.status(200).json({
        status: 'success',
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
  async getListings(req: Request, res: Response): Promise<void> {
    try {
      // Валідація параметрів запиту
      const queryValidation = listingQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.errors,
        });
        return;
      }

      const filters = queryValidation.data;
      const result = await listingService.getListings(filters);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання списку оголошень: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список оголошень',
      });
    }
  },
  async getListing(req: Request, res: Response): Promise<void> {
    try {
      // Валідація параметра ID
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.errors,
        });
        return;
      }

      const { id } = paramsValidation.data;

      const result = await listingService.getListing(id);

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
        });
      }
    }
  },
  async deleteListing(req: Request, res: Response): Promise<void> {
    try {
      // Валідація параметра ID
      const paramsValidation = listingIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.errors,
        });
        return;
      }

      const { id } = paramsValidation.data;

      // Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // Перевіряємо, чи є користувач власником оголошення або адміністратором
      const isOwner = await listingService.isListingOwner(id, userId);
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        res.status(403).json({
          status: 'error',
          message: 'У вас немає прав для видалення цього оголошення',
        });
        return;
      }

      await listingService.deleteListing(id);

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

  async getUserListings(req: Request, res: Response): Promise<void> {
    try {
      // Отримуємо ID користувача з JWT токена
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // Валідація параметрів запиту
      const queryValidation = listingQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.errors,
        });
        return;
      }

      const filters = {
        ...queryValidation.data,
        userId, // Додаємо фільтрацію за ID користувача
      };

      const result = await listingService.getListings(filters);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання оголошень користувача: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати оголошення користувача',
      });
    }
  },
  // Додайте цей метод до контролера
  async createListingDirect(req: Request, res: Response): Promise<void> {
    try {
      console.log('=== DIRECT CREATION ===');
      console.log('Отримані дані:', req.body);

      // Перевіряємо наявність тіла запиту
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'Відсутні дані для створення оголошення',
        });
        return;
      }

      // Отримуємо ID користувача з JWT токена
      if (!(req as any).user || !(req as any).user.id) {
        res.status(401).json({
          status: 'error',
          message:
            'Користувач не автентифікований або відсутній ID користувача',
        });
        return;
      }

      const userId = (req as any).user.id;

      // Обробка обов'язкових полів та перетворення типів
      const listingData = {
        title: String(req.body.title || 'Без назви'),
        description: String(req.body.description || 'Без опису'),
        price: Number(req.body.price || 0),
        location: String(req.body.location || 'Не вказано'),
        category: String(req.body.category || 'Інше'),
        categoryId: Number(req.body.categoryId || 1),
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        images: Array.isArray(req.body.images) ? req.body.images : [],
        condition:
          req.body.condition?.toLowerCase() === 'new'
            ? ('NEW' as 'NEW')
            : ('USED' as 'USED'),
        userId: userId,
      };

      console.log('Оброблені дані:', listingData);

      // Створюємо оголошення напряму через сервіс
      const { listing } = await listingService.createListing(listingData);

      // Повертаємо успішну відповідь
      res.status(201).json({
        status: 'success',
        message: 'Оголошення створено без валідації',
        data: { listing },
      });
    } catch (error: any) {
      console.error('Direct creation error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося створити оголошення',
        details: error.message,
      });
    }
  },
};
