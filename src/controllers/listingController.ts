import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { listingService } from '../services/listingService';
import { logger } from '../utils/logger';
import { reverseGeocode } from '../services/geocodingService';
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
      logger.info('=== ПОЧАТОК СТВОРЕННЯ ОГОЛОШЕННЯ ===');
      logger.info('HTTP Method:', req.method);
      logger.info('URL:', req.originalUrl);
      logger.info('Headers:', JSON.stringify(req.headers, null, 2));
      logger.info('Raw Body:', JSON.stringify(req.body, null, 2));
      logger.info('Files:', req.files ? (req.files as Express.Multer.File[]).map(f => ({ 
        fieldname: f.fieldname, 
        originalname: f.originalname, 
        filename: f.filename,
        size: f.size
      })) : 'No files');

      // 1. Перевіряємо наявність тіла запиту
      if (!req.body || Object.keys(req.body).length === 0) {
        logger.warn('❌ Отримано порожнє тіло запиту');
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

      // --- Обробка геолокації та локації товару ---
      let { location, mapLocation, userGeolocation, ...rest } = req.body;
      
      logger.info('📍 ОТРИМАНІ ДАНІ ГЕОЛОКАЦІЇ:');
      logger.info('location:', JSON.stringify(location, null, 2));
      logger.info('mapLocation:', JSON.stringify(mapLocation, null, 2));
      logger.info('userGeolocation:', JSON.stringify(userGeolocation, null, 2));
      logger.info('rest (інші поля):', Object.keys(rest));
      
      // Парсимо location, якщо він приходить як рядок
      if (typeof location === 'string') {
        try {
          logger.info('🔄 Парсинг location з рядка...');
          location = JSON.parse(location);
          logger.info('✅ Location успішно парсено:', JSON.stringify(location, null, 2));
        } catch (e) {
          logger.warn('❌ Некоректний формат location:', e);
          location = undefined;
        }
      }

      // Визначаємо координати для товару:
      // 1. Пріоритет: координати з карти (якщо користувач вибрав місце на карті)
      // 2. Якщо не вибрано місце на карті - використовуємо геолокацію користувача
      let finalLatitude: number | undefined;
      let finalLongitude: number | undefined;
      let useUserGeolocation = false;

      logger.info('🎯 ВИЗНАЧЕННЯ КООРДИНАТ:');

      // Якщо є дані з карти OpenStreetMap - використовуємо їх
      if (mapLocation) {
        logger.info('🗺️ Обробка даних з карти...');
        try {
          const mapLocationData =
            typeof mapLocation === 'string'
              ? JSON.parse(mapLocation)
              : mapLocation;

          logger.info('mapLocationData після парсингу:', JSON.stringify(mapLocationData, null, 2));

          if (mapLocationData.lat && mapLocationData.lon) {
            finalLatitude = Number(mapLocationData.lat);
            finalLongitude = Number(mapLocationData.lon);
            
            logger.info(`✅ Використано координати з карти: (${finalLatitude}, ${finalLongitude})`);
            
            // Створюємо або доповнюємо локацію даними з OSM
            location = location || {};
            location.settlement =
              mapLocationData.name ||
              (mapLocationData.display_name &&
                mapLocationData.display_name.split(',')[0]) ||
              location.settlement ||
              '';

            location.latitude = finalLatitude;
            location.longitude = finalLongitude;

            // Додаємо OSM специфічні поля
            location.osmId = mapLocationData.osm_id
              ? Number(mapLocationData.osm_id)
              : undefined;
            location.osmType = mapLocationData.osm_type;
            location.placeId = mapLocationData.place_id
              ? Number(mapLocationData.place_id)
              : undefined;
            location.displayName = mapLocationData.display_name;
            location.addressType = mapLocationData.addresstype;

            // Додаємо boundingBox як масив рядків
            if (
              mapLocationData.boundingbox &&
              Array.isArray(mapLocationData.boundingbox)
            ) {
              location.boundingBox = mapLocationData.boundingbox;
            }

            // Зберігаємо повні дані OSM
            location.osmJsonData = mapLocationData;

            // Отримуємо регіон і район з адреси OSM
            if (mapLocationData.address) {
              location.region = mapLocationData.address.state || location.region || '';
              location.district =
                mapLocationData.address.district ||
                mapLocationData.address.county ||
                location.district ||
                '';
            }

            logger.info('📍 Локація після обробки карти:', JSON.stringify(location, null, 2));
          } else {
            logger.warn('❌ mapLocation не містить lat/lon');
          }
        } catch (e) {
          logger.warn('❌ Помилка обробки даних з карти:', e);
        }
      }

      // Якщо координати ще не визначені і є геолокація користувача - використовуємо її
      if (!finalLatitude && !finalLongitude && userGeolocation && 
          userGeolocation.latitude && userGeolocation.longitude) {
        logger.info('👤 Обробка геолокації користувача...');
        logger.info('userGeolocation:', JSON.stringify(userGeolocation, null, 2));
        
        finalLatitude = parseFloat(userGeolocation.latitude);
        finalLongitude = parseFloat(userGeolocation.longitude);
        useUserGeolocation = true;
        
        logger.info(`✅ Використано геолокацію користувача: (${finalLatitude}, ${finalLongitude})`);
        
        // Якщо location не було створено раніше, створюємо його з геолокації користувача
        if (!location) {
          location = {};
        }
        location.latitude = finalLatitude;
        location.longitude = finalLongitude;
        
        logger.info('📍 Локація після обробки геолокації користувача:', JSON.stringify(location, null, 2));
      }

      logger.info(`🎯 ФІНАЛЬНІ КООРДИНАТИ: (${finalLatitude}, ${finalLongitude}), джерело: ${useUserGeolocation ? 'геолокація користувача' : 'карта'}`);

      // Виконуємо reverse geocoding для отримання адресних даних
      if (finalLatitude && finalLongitude) {
        logger.info('🔄 Виконання reverse geocoding...');
        try {
          const geocodedInfo = await reverseGeocode(finalLatitude, finalLongitude);
          logger.info('✅ Результат reverse geocoding:', JSON.stringify(geocodedInfo, null, 2));
          
          // Доповнюємо location геокодованими даними, якщо вони ще не встановлені
          location = location || {};
          location.country = location.country || geocodedInfo.country || '';
          location.region = location.region || geocodedInfo.region || '';
          location.district = location.district || geocodedInfo.district || '';
          
          // Якщо settlement не встановлено, використовуємо city або settlement з geocoding
          if (!location.settlement) {
            location.settlement = geocodedInfo.settlement || geocodedInfo.city || '';
          }
          
          // Якщо displayName не встановлено з OSM, використовуємо з geocoding
          if (!location.displayName && geocodedInfo.displayName) {
            location.displayName = geocodedInfo.displayName;
          }
          
          logger.info(`📍 ФІНАЛЬНА ЛОКАЦІЯ:`, {
            country: location.country,
            region: location.region,
            district: location.district,
            settlement: location.settlement,
            coordinates: `(${finalLatitude}, ${finalLongitude})`,
            source: useUserGeolocation ? 'user_geolocation' : 'map_selection'
          });
        } catch (error) {
          logger.warn('❌ Помилка reverse geocoding:', error);
        }
      } else {
        logger.warn('❗ Координати не визначено, reverse geocoding пропущено');
      }

      // Перетворюємо числові поля location на числа
      if (location) {
        if (location.countryId) location.countryId = Number(location.countryId);
        if (location.latitude !== undefined)
          location.latitude = Number(location.latitude);
        if (location.longitude !== undefined)
          location.longitude = Number(location.longitude);
        if (location.osmId !== undefined)
          location.osmId = Number(location.osmId);
        if (location.placeId !== undefined)
          location.placeId = Number(location.placeId);
      }

      // Якщо location не передано окремо, формуємо з плоских полів (для сумісності)
      if (!location) {
        const {
          countryId,
          settlement,
          latitude,
          longitude,
          region,
          district,
          ...restFields
        } = rest;

        if (countryId || settlement) {
          location = {
            countryId: countryId ? Number(countryId) : undefined,
            settlement: settlement || '',
            latitude: latitude ? Number(latitude) : undefined,
            longitude: longitude ? Number(longitude) : undefined,
            region,
            district,
          };
        }
        rest = restFields;
      }

      const listingData: any = {
        ...rest,
        images,
        ...(location ? { location } : {}),
      };

      // Видаляємо службові поля
      delete listingData.mapLocation;
      delete listingData.userGeolocation;

      logger.info('🔧 ДАНІ ДЛЯ СТВОРЕННЯ ОГОЛОШЕННЯ:');
      logger.info('listingData:', JSON.stringify(listingData, null, 2));

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

        logger.info(`✅ Оголошення з ID ${listing.id} успішно створено`);
        logger.info('Створене оголошення:', JSON.stringify({
          id: listing.id,
          title: listing.title,
          locationId: listing.locationId,
          createdAt: listing.createdAt
        }, null, 2));
        
        res.status(201).json({
          status: 'success',
          message: 'Оголошення успішно створено',
          data: {
            id: listing.id,
            title: listing.title,
            createdAt: listing.createdAt,
          },
        });
        
        logger.info('=== СТВОРЕННЯ ОГОЛОШЕННЯ ЗАВЕРШЕНО ===');
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

      // --- Обробка геолокації та локації товару при оновленні ---
      let { location, mapLocation, userGeolocation, ...rest } = req.body;
      
      // Парсимо location, якщо він приходить як рядок
      if (typeof location === 'string') {
        try {
          location = JSON.parse(location);
        } catch (e) {
          logger.warn('Некоректний формат location');
          location = undefined;
        }
      }

      // Визначаємо координати для товару при оновленні:
      // 1. Пріоритет: координати з карти (якщо користувач вибрав нове місце на карті)
      // 2. Якщо не вибрано місце на карті - використовуємо геолокацію користувача
      let finalLatitude: number | undefined;
      let finalLongitude: number | undefined;
      let useUserGeolocation = false;

      // Якщо є дані з карти OpenStreetMap - використовуємо їх
      if (mapLocation) {
        try {
          const mapLocationData =
            typeof mapLocation === 'string'
              ? JSON.parse(mapLocation)
              : mapLocation;

          if (mapLocationData.lat && mapLocationData.lon) {
            finalLatitude = Number(mapLocationData.lat);
            finalLongitude = Number(mapLocationData.lon);
            
            // Створюємо або доповнюємо локацію даними з OSM
            location = location || {};
            location.settlement =
              mapLocationData.name ||
              (mapLocationData.display_name &&
                mapLocationData.display_name.split(',')[0]) ||
              location.settlement ||
              '';

            location.latitude = finalLatitude;
            location.longitude = finalLongitude;

            // Додаємо OSM специфічні поля
            location.osmId = mapLocationData.osm_id
              ? Number(mapLocationData.osm_id)
              : undefined;
            location.osmType = mapLocationData.osm_type;
            location.placeId = mapLocationData.place_id
              ? Number(mapLocationData.place_id)
              : undefined;
            location.displayName = mapLocationData.display_name;
            location.addressType = mapLocationData.addresstype;

            // Додаємо boundingBox як масив рядків
            if (
              mapLocationData.boundingbox &&
              Array.isArray(mapLocationData.boundingbox)
            ) {
              location.boundingBox = mapLocationData.boundingbox;
            }

            // Зберігаємо повні дані OSM
            location.osmJsonData = mapLocationData;

            // Отримуємо регіон і район з адреси OSM
            if (mapLocationData.address) {
              location.region = mapLocationData.address.state || location.region || '';
              location.district =
                mapLocationData.address.district ||
                mapLocationData.address.county ||
                location.district ||
                '';
            }

            logger.info('Використано нові координати з карти для оновлення товару');
          }
        } catch (e) {
          logger.warn('Помилка обробки даних з карти при оновленні:', e);
        }
      }

      // Якщо координати ще не визначені і є геолокація користувача - використовуємо її
      if (!finalLatitude && !finalLongitude && userGeolocation && 
          userGeolocation.latitude && userGeolocation.longitude) {
        finalLatitude = parseFloat(userGeolocation.latitude);
        finalLongitude = parseFloat(userGeolocation.longitude);
        useUserGeolocation = true;
        
        // Якщо location не було створено раніше, створюємо його з геолокації користувача
        if (!location) {
          location = {};
        }
        location.latitude = finalLatitude;
        location.longitude = finalLongitude;
        
        logger.info('Використано геолокацію користувача для оновлення товару');
      }

      // Виконуємо reverse geocoding для нових координат
      if (finalLatitude && finalLongitude) {
        try {
          const geocodedInfo = await reverseGeocode(finalLatitude, finalLongitude);
          
          // Доповнюємо location геокодованими даними, якщо вони ще не встановлені
          location = location || {};
          location.country = location.country || geocodedInfo.country || '';
          location.region = location.region || geocodedInfo.region || '';
          location.district = location.district || geocodedInfo.district || '';
          
          // Якщо settlement не встановлено, використовуємо settlement з geocoding
          if (!location.settlement) {
            location.settlement = geocodedInfo.settlement || geocodedInfo.city || '';
          }
          
          // Якщо displayName не встановлено з OSM, використовуємо з geocoding
          if (!location.displayName && geocodedInfo.displayName) {
            location.displayName = geocodedInfo.displayName;
          }
          
          logger.info(`Виконано reverse geocoding для нових координат (${finalLatitude}, ${finalLongitude}):`, {
            country: location.country,
            region: location.region,
            district: location.district,
            settlement: location.settlement,
            source: useUserGeolocation ? 'user_geolocation' : 'map_selection'
          });
        } catch (error) {
          logger.warn('Помилка reverse geocoding при оновленні:', error);
        }
      }

      // Перетворюємо числові поля location на числа
      if (location) {
        if (location.countryId) location.countryId = Number(location.countryId);
        if (location.latitude !== undefined)
          location.latitude = Number(location.latitude);
        if (location.longitude !== undefined)
          location.longitude = Number(location.longitude);
        if (location.osmId !== undefined)
          location.osmId = Number(location.osmId);
        if (location.placeId !== undefined)
          location.placeId = Number(location.placeId);
      }

      // Якщо location не передано окремо, формуємо з плоских полів (для сумісності)
      if (!location) {
        const {
          countryId,
          settlement,
          latitude,
          longitude,
          region,
          district,
          ...restFields
        } = rest;

        if (countryId || settlement || latitude || longitude) {
          location = {
            countryId: countryId ? Number(countryId) : undefined,
            settlement: settlement || '',
            latitude: latitude ? Number(latitude) : undefined,
            longitude: longitude ? Number(longitude) : undefined,
            region,
            district,
          };
        }
        rest = restFields;
      }

      const updateData: any = {
        ...rest,
        images: updatedImages,
        ...(location ? { location } : {}),
      };

      // Видаляємо службові поля
      delete updateData.imagesToRemove;
      delete updateData.mapLocation;
      delete updateData.userGeolocation;

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

        // Перевіряємо, що motorizedSpec має необхідні поля або не передаємо його взагалі
        const updatePayload = {
          ...listingFields,
          ...(motorizedSpec &&
          typeof motorizedSpec === 'object' &&
          Object.keys(motorizedSpec).length > 0 &&
          'model' in motorizedSpec &&
          'year' in motorizedSpec
            ? {
                motorizedSpec: {
                  ...motorizedSpec,
                  model: String(motorizedSpec.model), // Ensure model is a string
                  year: Number(motorizedSpec.year), // Ensure year is a number
                  listingId, // Add listingId to satisfy type requirements
                },
              }
            : {}),
        };

        const { listing } = await listingService.updateListing(
          listingId,
          updatePayload
        );

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

      // 2. Отримання ID поточного користувача для перевірки обраних оголошень
      const currentUserId = req.userId ?? (req as any).user?.id;

      // 3. Отримання списку оголошень
      const filters = queryValidation.data;
      const result = (await listingService.getListings(
        filters,
        currentUserId
      )) as {
        listings: any[];
        pagination: {
          total: number;
          page: number;
          limit: number;
        };
      };

      // 4. Успішна відповідь
      logger.info(
        `Отримано ${result.listings.length} оголошень з ${result.pagination.total} загальних`
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

      // 2. Отримання ID поточного користувача для перевірки обраних оголошень
      const currentUserId = req.userId ?? (req as any).user?.id;

      // 3. Отримання оголошення
      const result = await listingService.getListing(id, currentUserId);

      // 4. Успішна відповідь
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

      // Використовуємо ID користувача як currentUserId для визначення обраних оголошень
      const result = (await listingService.getListings(filters, userId)) as {
        listings: any[];
        pagination: {
          total: number;
          page: number;
          limit: number;
        };
      };

      // 4. Успішна відповідь
      logger.info(
        `Отримано ${result.listings.length} оголошень користувача з ${result.pagination.total} загальних`
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

  /**
   * Додавання/видалення оголошення з обраних
   */
  async toggleFavorite(req: Request, res: Response): Promise<void> {
    try {
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
        logger.warn('Спроба додавання в обрані без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // 3. Додавання/видалення з обраних
      const result = await listingService.toggleFavorite(id, userId);

      // 4. Успішна відповідь
      const action = result.isFavorite ? 'додано до' : 'видалено з';
      logger.info(
        `Оголошення з ID ${id} ${action} обраних користувача ${userId}`
      );

      res.status(200).json({
        status: 'success',
        message: `Оголошення ${action} обраних`,
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка роботи з обраними: ${error.message}`);

      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося оновити статус обраного',
          details: error.message,
        });
      }
    }
  },

  /**
   * Отримання списку обраних оголошень
   */
  async getFavorites(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Запит на отримання обраних оголошень');

      // 1. Отримуємо ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Спроба отримання обраних оголошень без автентифікації');
        res.status(401).json({
          status: 'error',
          message: 'Користувач не автентифікований',
        });
        return;
      }

      // 2. Отримання параметрів пагінації
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // 3. Отримання списку обраних оголошень
      const result = await listingService.getFavorites(userId, page, limit);

      // 4. Успішна відповідь
      logger.info(
        `Отримано ${result.listings.length} обраних оголошень з ${result.pagination.total} загальних`
      );

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Помилка отримання обраних оголошень: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати обрані оголошення',
        details: error.message,
      });
    }
  },
};

