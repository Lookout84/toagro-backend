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
import { getImageUrl } from '../utils/fileUpload';
import { imageService } from '../services/imageService';

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

      // 2. Отримуємо ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба створення оголошення без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // Логуємо інформацію про завантажені файли
      const uploadedFiles = req.files as Express.Multer.File[];
      logger.info(`Завантажено ${uploadedFiles?.length || 0} файлів`);

      // Перетворюємо шляхи до завантажених файлів у URL
      const images = uploadedFiles
        ? uploadedFiles.map((file) => getImageUrl(file.filename))
        : [];

      // --- Парсимо location, якщо він приходить як рядок ---
      let { location, ...rest } = req.body;
      if (typeof location === 'string') {
        try {
          location = JSON.parse(location);
        } catch (e) {
          logger.warn('Некоректний формат location');
          location = undefined;
        }
      }

      // Перетворюємо числові поля location на числа
      if (location) {
        location.countryId = Number(location.countryId);
        location.regionId = Number(location.regionId);
        if (location.communityId !== undefined)
          location.communityId = Number(location.communityId);
        if (location.latitude !== undefined)
          location.latitude = Number(location.latitude);
        if (location.longitude !== undefined)
          location.longitude = Number(location.longitude);
      }

      // Якщо location не передано окремо, формуємо з плоских полів (для сумісності)
      if (!location) {
        const {
          countryId,
          regionId,
          communityId,
          settlement,
          latitude,
          longitude,
          ...restFields
        } = rest;

        if (countryId && regionId) {
          location = {
            countryId: Number(countryId),
            regionId: Number(regionId),
            communityId: communityId ? Number(communityId) : undefined,
            settlement: settlement || '',
            latitude: latitude ? Number(latitude) : undefined,
            longitude: longitude ? Number(longitude) : undefined,
          };
        }
        rest = restFields;
      }

      const listingData: any = {
        ...rest,
        images,
        ...(location ? { location } : {}),
      };

      console.log('Дані для створення оголошення:', listingData);

      // 4. Валідація даних
      const validationResult = createListingSchema.safeParse(listingData);
      if (!validationResult.success) {
        logger.warn(
          'Помилка валідації даних:',
          JSON.stringify(validationResult.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.format(),
        });
        return;
      }

      // 5. Створення оголошення
      try {
        // Витягуємо motorizedSpec, якщо є (для моторизованих категорій)
        const { motorizedSpec, ...listingFields } =
          'motorizedSpec' in validationResult.data
            ? (validationResult.data as any)
            : { ...validationResult.data };

        const { listing } = await listingService.createListing({
          ...listingFields,
          userId,
          ...(motorizedSpec ? { motorizedSpec } : {}),
        });

        logger.info(`Оголошення з ID ${listing.id} успішно створено`);
        res.status(201).json({
          status: 'success',
          message: 'Оголошення успішно створено',
          data: {
            id: listing.id,
            title: listing.title,
            createdAt: listing.createdAt,
          },
        });
      } catch (error: any) {
        logger.error(`Помилка створення оголошення: ${error.message}`);
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося створити оголошення',
          details: error.message,
        });
      }
    } catch (error: any) {
      logger.error(`Помилка створення оголошення: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Помилка сервера при створенні оголошення',
        details: error.message,
      });
    }
  },

  /**
   * Оновлення існуючого оголошення
   */
  async updateListing(req: Request, res: Response): Promise<void> {
    try {
      logger.info(`Спроба оновлення оголошення з ID: ${req.params.id}`);

      // 1. Парсимо ID оголошення
      const listingId = parseInt(req.params.id);
      if (isNaN(listingId)) {
        logger.warn('Недійсний ID оголошення');
        res.status(400).json({
          status: 'error',
          message: 'Недійсний ID оголошення',
        });
        return;
      }

      // 2. Отримуємо ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба оновлення оголошення без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // 3. Перевіряємо наявність оголошення та права на редагування
      const isOwner = await listingService.isListingOwner(listingId, userId);
      if (!isOwner) {
        logger.warn(
          `Користувач ${userId} намагається редагувати чуже оголошення ${listingId}`
        );
        res.status(403).json({
          status: 'error',
          message: 'Ви не маєте прав для редагування цього оголошення',
        });
        return;
      }

      // 4. Отримуємо завантажені зображення
      const uploadedFiles = req.files as Express.Multer.File[];
      logger.info(`Завантажено ${uploadedFiles?.length || 0} нових зображень`);

      // 5. Отримуємо поточне оголошення для перевірки наявних зображень
      const existingListing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { images: true },
      });

      if (!existingListing) {
        logger.warn(`Оголошення з ID ${listingId} не знайдено`);
        res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
        return;
      }

      // 6. Визначаємо які зображення зберегти
      let updatedImages = [...(existingListing?.images || [])];

      // 7. Якщо прийшли нові зображення, додаємо їх
      if (uploadedFiles && uploadedFiles.length > 0) {
        const newImages = uploadedFiles.map((file) =>
          getImageUrl(file.filename)
        );
        updatedImages = [...updatedImages, ...newImages];
        logger.info(`Додано ${newImages.length} нових зображень`);
      }

      // 8. Якщо в запиті є поле imagesToRemove, видаляємо їх
      if (req.body.imagesToRemove) {
        const imagesToRemove = Array.isArray(req.body.imagesToRemove)
          ? req.body.imagesToRemove
          : [req.body.imagesToRemove];

        logger.info(`Запит на видалення ${imagesToRemove.length} зображень`);

        // Видаляємо зазначені зображення
        await imageService.deleteImages(imagesToRemove);

        // Оновлюємо список зображень
        updatedImages = updatedImages.filter(
          (img) => !imagesToRemove.includes(img)
        );
        logger.info(
          `Залишилось ${updatedImages.length} зображень після видалення`
        );
      }

      // --- Парсимо location, якщо він приходить як рядок ---
      let { location, ...rest } = req.body;
      if (typeof location === 'string') {
        try {
          location = JSON.parse(location);
        } catch (e) {
          logger.warn('Некоректний формат location');
          location = undefined;
        }
      }

      // Перетворюємо числові поля location на числа
      if (location) {
        location.countryId = Number(location.countryId);
        location.regionId = Number(location.regionId);
        if (location.communityId !== undefined)
          location.communityId = Number(location.communityId);
        if (location.latitude !== undefined)
          location.latitude = Number(location.latitude);
        if (location.longitude !== undefined)
          location.longitude = Number(location.longitude);
      }

      // Якщо location не передано окремо, формуємо з плоских полів (для сумісності)
      if (!location) {
        const {
          countryId,
          regionId,
          communityId,
          settlement,
          latitude,
          longitude,
          ...restFields
        } = rest;

        if (countryId && regionId) {
          location = {
            countryId: Number(countryId),
            regionId: Number(regionId),
            communityId: communityId ? Number(communityId) : undefined,
            settlement: settlement || '',
            latitude: latitude ? Number(latitude) : undefined,
            longitude: longitude ? Number(longitude) : undefined,
          };
        }
        rest = restFields;
      }

      const updateData: any = {
        ...rest,
        images: updatedImages,
        ...(location ? { location } : {}),
      };

      // Видаляємо службове поле
      delete updateData.imagesToRemove;

      // 10. Валідація даних
      const validationResult = updateListingSchema.safeParse(updateData);
      if (!validationResult.success) {
        logger.warn(
          'Помилка валідації даних:',
          JSON.stringify(validationResult.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.format(),
        });
        return;
      }

      // 11. Оновлення оголошення
      try {
        // Витягуємо motorizedSpec, якщо є (для моторизованих категорій)
        let listingFields = { ...validationResult.data };
        let motorizedSpec;
        if ('motorizedSpec' in validationResult.data) {
          // @ts-ignore
          motorizedSpec = validationResult.data.motorizedSpec;
          // @ts-ignore
          delete listingFields.motorizedSpec;
        }

        const { listing } = await listingService.updateListing(listingId, {
          ...listingFields,
          ...(motorizedSpec ? { motorizedSpec } : {}),
        });

        logger.info(`Оголошення з ID ${listingId} успішно оновлено`);
        res.status(200).json({
          status: 'success',
          message: 'Оголошення успішно оновлено',
          data: {
            id: listing.id,
            title: listing.title,
            updatedAt: listing.updatedAt,
            images: listing.images,
          },
        });
      } catch (updateError: any) {
        logger.error(
          `Помилка при оновленні оголошення: ${updateError.message}`
        );
        res.status(400).json({
          status: 'error',
          message: 'Не вдалося оновити оголошення',
          details: updateError.message,
        });
      }
    } catch (error: any) {
      logger.error(`Помилка оновлення оголошення: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Помилка сервера при оновленні оголошення',
        details: error.message,
      });
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
        logger.warn(
          'Некоректні параметри запиту:',
          JSON.stringify(queryValidation.error.errors)
        );
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
      logger.info(
        `Отримано ${result.listings.length} оголошень з ${result.total} загальних`
      );
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
        logger.warn(
          'Некоректний ID оголошення:',
          JSON.stringify(paramsValidation.error.errors)
        );
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
        logger.warn(
          'Некоректний ID оголошення:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID оголошення',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id } = paramsValidation.data;

      // 2. Отримуємо ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
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
        logger.warn(
          `Користувач ${userId} намагається видалити чуже оголошення ${id}`
        );
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
      const userId = req.userId ?? (req as any).user?.id;
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
        logger.warn(
          'Некоректні параметри запиту:',
          JSON.stringify(queryValidation.error.errors)
        );
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
      logger.info(
        `Отримано ${result.listings.length} оголошень користувача з ${result.total} загальних`
      );
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
  },
};
