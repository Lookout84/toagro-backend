import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { notificationService } from './notificationService';
import { imageService } from './imageService';
import validator from 'validator';
import NodeCache from 'node-cache';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Ініціалізація DOMPurify для санітизації HTML
const { window } = new JSDOM('');
const domPurify = DOMPurify(window);

const prisma = new PrismaClient();
const listingCache = new NodeCache({ stdTTL: 3600 }); // Кеш на 1 годину

// Типи та інтерфейси
interface MotorizedSpec {
  make?: string;
  model?: string;
  year?: number;
  engineSize?: number;
  mileage?: number;
  fuelType?: string;
  transmission?: string;
  color?: string;
  vin?: string;
}

interface LocationData {
  countryId: number;
  settlement: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  district?: string;
  osmId?: number;
  osmType?: string;
  placeId?: string;
  displayName?: string;
  addressType?: string;
  boundingBox?: number[];
  osmJsonData?: Prisma.JsonValue;
}

interface CreateListingData {
  title: string;
  description: string;
  price: number;
  currency: string;
  location?: LocationData;
  category: string;
  categoryId?: number;
  brandId?: number;
  images: string[];
  condition: 'new' | 'used';
  userId: number;
  motorizedSpec?: MotorizedSpec;
  priceType?: string;
  vatIncluded?: boolean;
  phone?: string;
  telegram?: string;
  viber?: string;
  whatsapp?: string;
}

interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  location?: LocationData;
  category?: string;
  categoryId?: number;
  brandId?: number | null;
  images?: string[];
  condition?: 'new' | 'used';
  active?: boolean;
  motorizedSpec?: MotorizedSpec;
  priceType?: string;
  vatIncluded?: boolean;
  phone?: string;
  telegram?: string;
  viber?: string;
  whatsapp?: string;
}

interface ListingQueryFilters {
  search?: string;
  category?: string;
  condition?: 'new' | 'used';
  minPrice?: number;
  maxPrice?: number;
  countryId?: number;
  regionId?: number;
  communityId?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  userId?: number;
  currency?: string;
  active?: boolean;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

interface ListingResult {
  listing: Prisma.ListingGetPayload<{
    include: {
      user: true;
      location: true;
      brand: true;
      motorizedSpec: true;
    };
  }>;
}

interface ListingWithDetails extends ListingResult {
  similarListings: Prisma.ListingGetPayload<{
    include: {
      location: true;
      brand: true;
    };
  }>[];
}

// Валідатор для оголошень
class ListingValidator {
  static validateCreateData(data: CreateListingData): void {
    // Валідація заголовка
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Title is required');
    }
    if (data.title.length > 100) {
      throw new Error('Title must be less than 100 characters');
    }

    // Валідація опису
    if (data.description && data.description.length > 2000) {
      throw new Error('Description must be less than 2000 characters');
    }

    // Валідація ціни
    if (typeof data.price !== 'number' || data.price <= 0) {
      throw new Error('Price must be a positive number');
    }

    // Валідація зображень
    if (!data.images || data.images.length === 0) {
      throw new Error('At least one image is required');
    }
    if (data.images.length > 10) {
      throw new Error('Maximum 10 images allowed');
    }

    // Санітизація тексту
    data.title = domPurify.sanitize(data.title);
    if (data.description) {
      data.description = domPurify.sanitize(data.description);
    }
  }

  static validateUpdateData(data: UpdateListingData): void {
    if (data.title !== undefined) {
      if (!data.title || data.title.trim().length === 0) {
        throw new Error('Title cannot be empty');
      }
      if (data.title.length > 100) {
        throw new Error('Title must be less than 100 characters');
      }
      data.title = domPurify.sanitize(data.title);
    }

    if (data.description !== undefined) {
      if (data.description && data.description.length > 2000) {
        throw new Error('Description must be less than 2000 characters');
      }
      if (data.description) {
        data.description = domPurify.sanitize(data.description);
      }
    }

    if (data.price !== undefined && (typeof data.price !== 'number' || data.price <= 0)) {
      throw new Error('Price must be a positive number');
    }
  }
}

// Сервіс для роботи з локаціями
class LocationService {
  async findOrCreate(data: LocationData, tx: Prisma.TransactionClient): Promise<{ id: number }> {
    try {
      const where: Prisma.LocationWhereInput = {
        settlement: data.settlement.trim(),
      };

      if (data.latitude !== undefined && data.longitude !== undefined) {
        where.latitude = data.latitude;
        where.longitude = data.longitude;
      } else if (data.osmId !== undefined) {
        where.osmId = data.osmId;
      }

      let location = await tx.location.findFirst({
        where,
      });

      if (!location) {
        location = await tx.location.create({
          data: {
            countryId: data.countryId,
            settlement: data.settlement.trim(),
            latitude: data.latitude,
            longitude: data.longitude,
            region: data.region,
            district: data.district,
            osmId: data.osmId,
            osmType: data.osmType,
            placeId: data.placeId !== undefined ? Number(data.placeId) : undefined,
            displayName: data.displayName,
            addressType: data.addressType,
            boundingBox: data.boundingBox ? data.boundingBox.map(String) : [],
            osmJsonData: data.osmJsonData as Prisma.InputJsonValue,
          },
        });
      }

      return { id: location.id };
    } catch (error) {
      logger.error('Failed to find or create location', { error, data });
      throw error;
    }
  }
}

// Сервіс для роботи з моторизованою технікою
class MotorizedSpecService {
  async createSpec(
    listingId: number,
    data: MotorizedSpec,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.create({
        data: {
          ...data,
          listingId,
        },
      });
    } catch (error) {
      logger.error('Failed to create motorized spec', { error, listingId, data });
      throw error;
    }
  }

  async updateSpec(
    listingId: number,
    data: MotorizedSpec,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.update({
        where: { listingId },
        data,
      });
    } catch (error) {
      logger.error('Failed to update motorized spec', { error, listingId, data });
      throw error;
    }
  }

  async upsertSpec(
    listingId: number,
    data: MotorizedSpec,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      const existing = await tx.motorizedSpec.findUnique({
        where: { listingId },
      });

      if (existing) {
        await this.updateSpec(listingId, data, tx);
      } else {
        await this.createSpec(listingId, data, tx);
      }
    } catch (error) {
      logger.error('Failed to upsert motorized spec', { error, listingId, data });
      throw error;
    }
  }
}

// Головний сервіс для роботи з оголошеннями
class ListingService {
  private locationService = new LocationService();
  private motorizedSpecService = new MotorizedSpecService();

  async createListing(data: CreateListingData): Promise<ListingResult> {
    try {
      ListingValidator.validateCreateData(data);

      return await prisma.$transaction(async (tx) => {
        // Перевірка категорії
        if (data.categoryId) {
          await this.validateCategory(data.categoryId, tx);
        }

        // Перевірка бренду
        if (data.brandId) {
          await this.validateBrand(data.brandId, tx);
        }

        // Обробка локації
        let locationId: number | undefined;
        if (data.location) {
          locationId = (await this.locationService.findOrCreate(data.location, tx)).id;
        }

        // Створення оголошення
        const listing = await tx.listing.create({
          data: {
            title: data.title,
            description: data.description,
            price: data.price,
            currency: data.currency,
            locationId,
            category: data.category,
            categoryId: data.categoryId,
            brandId: data.brandId,
            images: data.images,
            condition: data.condition,
            userId: data.userId,
            active: true,
            priceType: data.priceType,
            vatIncluded: data.vatIncluded,
            phone: data.phone,
            telegram: data.telegram,
            viber: data.viber,
            whatsapp: data.whatsapp,
          },
          include: {
            user: true,
            location: true,
            brand: true,
            motorizedSpec: true,
          },
        });

        // Додаткові дані для моторизованої техніки
        if (data.motorizedSpec) {
          await this.motorizedSpecService.createSpec(listing.id, data.motorizedSpec, tx);
        }

        // Логування дії
        await this.logUserActivity(
          data.userId,
          'CREATE_LISTING',
          listing.id,
          tx
        );

        // Очистити кеш
        listingCache.del('recent_listings');

        return { listing };
      });
    } catch (error) {
      logger.error('Failed to create listing', { error, data });
      throw error;
    }
  }

  async updateListing(id: number, data: UpdateListingData): Promise<ListingResult> {
    try {
      ListingValidator.validateUpdateData(data);

      const existingListing = await prisma.listing.findUnique({
        where: { id },
      });

      if (!existingListing) {
        throw new Error('Listing not found');
      }

      return await prisma.$transaction(async (tx) => {
        // Перевірка категорії
        if (data.categoryId) {
          await this.validateCategory(data.categoryId, tx);
        }

        // Перевірка бренду
        if (data.brandId !== undefined) {
          if (data.brandId === null) {
            // Видалити бренд
          } else {
            await this.validateBrand(data.brandId, tx);
          }
        }

        // Обробка локації
        let locationId: number | undefined;
        if (data.location) {
          locationId = (await this.locationService.findOrCreate(data.location, tx)).id;
        }

        // Оновлення оголошення
        const updateData: Prisma.ListingUpdateInput = {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.currency !== undefined && { currency: data.currency }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.condition !== undefined && { condition: data.condition }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.priceType !== undefined && { priceType: data.priceType }),
          ...(data.vatIncluded !== undefined && { vatIncluded: data.vatIncluded }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.telegram !== undefined && { telegram: data.telegram }),
          ...(data.viber !== undefined && { viber: data.viber }),
          ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
          ...(locationId !== undefined && { locationId }),
          ...(data.brandId !== undefined && {
            brand: data.brandId === null ? { disconnect: true } : { connect: { id: data.brandId } },
          }),
          ...(data.images !== undefined && { images: data.images }),
        };

        const listing = await tx.listing.update({
          where: { id },
          data: updateData,
          include: {
            user: true,
            location: true,
            brand: true,
            motorizedSpec: true,
          },
        });

        // Оновлення додаткових даних для моторизованої техніки
        if (data.motorizedSpec) {
          await this.motorizedSpecService.upsertSpec(listing.id, data.motorizedSpec, tx);
        }

        // Логування дії
        await this.logUserActivity(
          listing.userId,
          'UPDATE_LISTING',
          listing.id,
          tx
        );

        // Очистити кеш
        listingCache.del(`listing_${id}`);
        listingCache.del('recent_listings');

        return { listing };
      });
    } catch (error) {
      logger.error('Failed to update listing', { error, id, data });
      throw error;
    }
  }

  async getListing(id: number): Promise<ListingWithDetails> {
    try {
      // Спроба отримати з кешу
      const cached = listingCache.get<ListingWithDetails>(`listing_${id}`);
      if (cached) {
        return cached;
      }

      const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              phone: true,
              createdAt: true,
              telegram: true,
              viber: true,
              whatsapp: true,
            },
          },
          location: true,
          brand: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
          motorizedSpec: true,
        },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      // Оновлення лічильника переглядів
      await prisma.listing.update({
        where: { id },
        data: { views: { increment: 1 } },
      });

      // Отримання схожих оголошень
      const similarListings = await prisma.listing.findMany({
        where: {
          id: { not: id },
          active: true,
          OR: [
            { category: listing.category },
            { brandId: listing.brandId || undefined },
          ],
        },
        take: 6,
        include: {
          location: true,
          brand: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
      });

      const result = {
        listing,
        similarListings,
      };

      // Збереження в кеш
      listingCache.set(`listing_${id}`, result);

      return result;
    } catch (error) {
      logger.error('Failed to get listing', { error, id });
      throw error;
    }
  }

  async getListings(filters: ListingQueryFilters) {
    try {
      const cacheKey = this.generateCacheKey(filters);
      const cached = listingCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const {
        search,
        category,
        condition,
        minPrice,
        maxPrice,
        countryId,
        regionId,
        communityId,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
        userId,
        currency,
        active = true,
        location,
      } = filters;

      // Формування умов where для фільтрації
      const where: Prisma.ListingWhereInput = {
        active,
      };

      // Пошук за текстом
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Фільтр за категорією
      if (category) {
        where.category = category;
      }

      // Фільтр за станом
      if (condition) {
        where.condition = condition;
      }

      // Фільтр за ціною
      if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {};
        if (minPrice !== undefined) {
          where.price.gte = minPrice;
        }
        if (maxPrice !== undefined) {
          where.price.lte = maxPrice;
        }
      }

      // Фільтр за валютою
      if (currency) {
        where.currency = currency;
      }

      // Фільтр за користувачем
      if (userId) {
        where.userId = userId;
      }

      // Фільтр за місцезнаходженням
      if (location || countryId || regionId || communityId) {
        where.location = {};

        if (countryId) {
          where.location.countryId = countryId;
        }

        if (regionId) {
          where.location.region = { contains: String(regionId), mode: 'insensitive' };
        }

        if (communityId) {
          where.location.district = { contains: String(communityId), mode: 'insensitive' };
        }

        // Геопошук по координатах (якщо потрібно)
        if (location?.latitude && location?.longitude) {
          // TODO: Додати реалізацію геопошуку
        }
      }

      // Отримання загальної кількості
      const total = await prisma.listing.count({ where });

      // Отримання сторінки даних
      const listings = await prisma.listing.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              phoneNumber: true,
              createdAt: true,
            },
          },
          location: true,
          brand: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Формування результату
      const result = {
        listings,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };

      // Збереження в кеш (тільки перші 5 сторінок)
      if (page <= 5) {
        listingCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.error('Failed to get listings', { error, filters });
      throw error;
    }
  }

  async deleteListing(id: number): Promise<void> {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id },
        select: { images: true, userId: true },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      await prisma.$transaction(async (tx) => {
        // Видалення зображень
        if (listing.images && listing.images.length > 0) {
          await imageService.deleteImages(listing.images);
        }

        // Видалення пов'язаних даних
        await tx.motorizedSpec.deleteMany({ where: { listingId: id } });
        await tx.favorite.deleteMany({ where: { listingId: id } });

        // Видалення оголошення
        await tx.listing.delete({ where: { id } });

        // Логування дії
        await tx.userActivity.create({
          data: {
            userId: listing.userId,
            action: 'DELETE_LISTING',
            resourceId: id,
            resourceType: 'LISTING',
            metadata: { listingId: id },
          },
        });
      });

      // Очистити кеш
      listingCache.del(`listing_${id}`);
      listingCache.del('recent_listings');
    } catch (error) {
      logger.error('Failed to delete listing', { error, id });
      throw error;
    }
  }

  async isListingOwner(listingId: number, userId: number): Promise<boolean> {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { userId: true },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      return listing.userId === userId;
    } catch (error) {
      logger.error('Failed to check listing owner', { error, listingId, userId });
      throw error;
    }
  }

  async toggleFavorite(
    listingId: number,
    userId: number
  ): Promise<{ isFavorite: boolean }> {
    try {
      const existingFavorite = await prisma.favorite.findUnique({
        where: {
          userId_listingId: {
            userId,
            listingId,
          },
        },
      });

      if (existingFavorite) {
        await prisma.favorite.delete({
          where: {
            userId_listingId: {
              userId,
              listingId,
            },
          },
        });
        return { isFavorite: false };
      } else {
        await prisma.favorite.create({
          data: {
            userId,
            listingId,
          },
        });

        // Повідомлення власнику оголошення
        const listing = await prisma.listing.findUnique({
          where: { id: listingId },
          select: { userId: true, title: true },
        });

        if (listing && listing.userId !== userId) {
          await notificationService.createNotification({
            userId: listing.userId,
            type: 'FAVORITE_ADDED',
            title: 'Нове додавання в обрані',
            message: `Ваше оголошення "${listing.title}" додано в обрані`,
            data: { listingId },
          });
        }

        return { isFavorite: true };
      }
    } catch (error) {
      logger.error('Failed to toggle favorite', { error, listingId, userId });
      throw error;
    }
  }

  async getFavorites(userId: number, page = 1, limit = 20) {
    try {
      const total = await prisma.favorite.count({
        where: { userId },
      });

      const favorites = await prisma.favorite.findMany({
        where: { userId },
        include: {
          listing: {
            include: {
              location: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                  logo: true,
                },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      const listings = favorites
        .filter((fav) => fav.listing !== null)
        .map((fav) => ({
          ...fav.listing,
          isFavorite: true,
        }));

      return {
        listings,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get favorites', { error, userId });
      throw error;
    }
  }

  async checkExpiredListings(): Promise<void> {
    try {
      const expireDays = 30; // Термін активності оголошення в днях
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - expireDays);

      const expiredListings = await prisma.listing.findMany({
        where: {
          active: true,
          updatedAt: {
            lt: expirationDate,
          },
        },
        select: { id: true, userId: true, title: true },
      });

      if (expiredListings.length > 0) {
        logger.info(`Deactivating ${expiredListings.length} expired listings`);

        await prisma.listing.updateMany({
          where: {
            id: { in: expiredListings.map((l) => l.id) },
          },
          data: { active: false },
        });

        // Надсилання повідомлень
        for (const listing of expiredListings) {
          await notificationService.createNotification({
            userId: listing.userId,
            type: 'LISTING_EXPIRED',
            title: 'Оголошення деактивовано',
            message: `Ваше оголошення "${listing.title}" було деактивовано через ${expireDays} днів неактивності`,
            data: { listingId: listing.id },
          });
        }

        // Очистити кеш
        listingCache.flushAll();
      }
    } catch (error) {
      logger.error('Failed to check expired listings', { error });
    }
  }

  private async validateCategory(categoryId: number, tx: Prisma.TransactionClient): Promise<void> {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new Error('Category not found');
    }
  }

  private async validateBrand(brandId: number, tx: Prisma.TransactionClient): Promise<void> {
    const brand = await tx.brand.findUnique({
      where: { id: brandId },
    });
    if (!brand) {
      throw new Error('Brand not found');
    }
  }

  private async logUserActivity(
    userId: number,
    action: string,
    resourceId: number,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    await tx.userActivity.create({
      data: {
        userId,
        action,
        resourceId,
        resourceType: 'LISTING',
        metadata: { listingId: resourceId },
      },
    });
  }

  private generateCacheKey(filters: ListingQueryFilters): string {
    const keyParts = [];
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        keyParts.push(`${key}=${value}`);
      }
    }
    return `listings_${keyParts.join('&')}`;
  }
}

export const listingService = new ListingService();


// import { Prisma, PrismaClient } from '@prisma/client';
// import { logger } from '../utils/logger';
// import {
//   ListingResult,
//   CreateListingData,
//   UpdateListingData,
//   ListingQueryFilters,
//   ListingWithDetails,
// } from '../types/listing';
// import { notificationService } from './notificationService';
// import { differenceInDays } from 'date-fns';
// import { imageService } from './imageService';

// const prisma = new PrismaClient();

// export const listingService = {
//   /**
//    * Створення нового оголошення
//    */
//   async createListing(data: CreateListingData): Promise<ListingResult> {
//     try {
//       logger.info('Створення нового оголошення');
      
//       return await prisma.$transaction(async (tx) => {
//         logger.debug('Розпочато транзакцію для створення оголошення');
        
//         // 1. Перевірка категорії
//         if (data.categoryId) {
//           const category = await tx.category.findUnique({
//             where: { id: data.categoryId },
//           });
//           if (!category) throw new Error('Категорія не знайдена');
//         }
        
//         // 2. Перевірка бренду, якщо вказано
//         if (data.brandId) {
//           const brand = await tx.brand.findUnique({
//             where: { id: data.brandId },
//           });
//           if (!brand) throw new Error('Бренд не знайдений');
//         }

//         // 3. Створення або пошук Location, якщо потрібно
//         let locationId: number | undefined = undefined;
        
//         if (data.location) {
//           const {
//             countryId,
//             settlement,
//             latitude,
//             longitude,
//             region,
//             district,
//             osmId,
//             osmType,
//             placeId,
//             displayName,
//             addressType,
//             boundingBox,
//             osmJsonData,
//           } = data.location;

//           // Формуємо базовий пошуковий фільтр по ключових полях
//           let locationFilter: any = {
//             settlement: settlement.trim(),
//           };
          
//           // Додаємо додаткові поля для унікальності, якщо вони є
//           if (latitude !== undefined && longitude !== undefined) {
//             locationFilter.latitude = latitude;
//             locationFilter.longitude = longitude;
//           } else if (osmId !== undefined) {
//             locationFilter.osmId = osmId;
//           }

//           // Шукаємо локацію з такими ж параметрами
//           let location = await tx.location.findFirst({
//             where: locationFilter,
//           });
          
//           // Якщо не знайдено, створюємо нову
//           if (!location) {
//             logger.info('Створення нового Location для оголошення');
            
//             location = await tx.location.create({
//               data: {
//                 countryId,
//                 settlement: settlement.trim(),
//                 latitude,
//                 longitude,
//                 region,
//                 district,
//                 osmId,
//                 osmType,
//                 placeId,
//                 displayName,
//                 addressType,
//                 boundingBox: boundingBox || [],
//                 osmJsonData,
//               },
//             });
//           }
          
//           locationId = location.id;
//         }

//         // 4. Створення оголошення
//         const listing = await tx.listing.create({
//           data: {
//             title: data.title,
//             description: data.description,
//             price: data.price,
//             currency: data.currency as any,
//             locationId,
//             category: data.category,
//             categoryId: data.categoryId,
//             brandId: data.brandId,
//             images: data.images,
//             condition: data.condition,
//             userId: data.userId,
//             active: true,
//             priceType: data.priceType as any,
//             vatIncluded: data.vatIncluded,
//             phone: data.phone,
//             telegram: data.telegram,
//             viber: data.viber,
//             whatsapp: data.whatsapp,
//           },
//         });

//         // 5. Якщо категорія моторизована — створити MotorizedSpec
//         if (data.motorizedSpec) {
//           await tx.motorizedSpec.create({
//             data: {
//               ...data.motorizedSpec,
//               listingId: listing.id,
//             },
//           });
//         }

//         // 6. Логування дії
//         await tx.userActivity.create({
//           data: {
//             userId: data.userId,
//             action: 'CREATE_LISTING',
//             resourceId: listing.id,
//             resourceType: 'LISTING',
//             metadata: { listingId: listing.id },
//           },
//         });

//         logger.info(`Оголошення з ID ${listing.id} успішно створено`);
//         return { listing };
//       });
//     } catch (error: any) {
//       logger.error(`Помилка створення оголошення: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Оновлення існуючого оголошення
//    */
//   async updateListing(
//     id: number,
//     data: UpdateListingData
//   ): Promise<ListingResult> {
//     try {
//       // 1. Перевіряємо чи існує оголошення
//       const existingListing = await prisma.listing.findUnique({
//         where: { id },
//       });

//       if (!existingListing) {
//         throw new Error(`Оголошення з ID ${id} не знайдено`);
//       }

//       // 2. Перевірка категорії
//       if (data.categoryId) {
//         const category = await prisma.category.findUnique({
//           where: { id: data.categoryId },
//         });
//         if (!category) throw new Error('Категорія не знайдена');
//       }

//       // 3. Перевірка бренду, якщо вказано
//       if (data.brandId) {
//         const brand = await prisma.brand.findUnique({
//           where: { id: data.brandId },
//         });
//         if (!brand) throw new Error('Бренд не знайдений');
//       }

//       // 4. Оновлення Location, якщо потрібно
//       let locationId: number | undefined = undefined;
//       if (data.location) {
//         const {
//           countryId,
//           settlement,
//           latitude,
//           longitude,
//           region,
//           district,
//           osmId,
//           osmType,
//           placeId,
//           displayName,
//           addressType,
//           boundingBox,
//           osmJsonData,
//         } = data.location;

//         // Формуємо базовий пошуковий фільтр
//         let locationFilter: any = {
//           settlement: settlement.trim(),
//         };
        
//         // Додаємо додаткові поля для унікальності, якщо вони є
//         if (latitude !== undefined && longitude !== undefined) {
//           locationFilter.latitude = latitude;
//           locationFilter.longitude = longitude;
//         } else if (osmId !== undefined) {
//           locationFilter.osmId = osmId;
//         }

//         // Шукаємо локацію з такими ж параметрами
//         let location = await prisma.location.findFirst({
//           where: locationFilter,
//         });
        
//         // Якщо не знайдено, створюємо нову
//         if (!location) {
//           location = await prisma.location.create({
//             data: {
//               countryId,
//               settlement: settlement.trim(),
//               latitude,
//               longitude,
//               region,
//               district,
//               osmId,
//               osmType,
//               placeId,
//               displayName,
//               addressType,
//               boundingBox: boundingBox || [],
//               osmJsonData,
//             },
//           });
//         }
        
//         locationId = location.id;
//       }

//       // 5. Оновлення оголошення
//       const { location, motorizedSpec, ...dataWithoutLocation } = data;
//       const updateData: Prisma.ListingUpdateInput = {
//         ...dataWithoutLocation,
//         ...(typeof data.price === 'number'
//           ? { price: data.price }
//           : {}),
//         ...(data.currency !== undefined
//           ? { currency: data.currency as any }
//           : {}),
//         ...(data.condition !== undefined ? { condition: data.condition } : {}),
//         ...(data.categoryId !== undefined
//           ? { categoryId: data.categoryId }
//           : {}),
//         ...(data.brandId !== undefined
//           ? {
//               brand:
//                 data.brandId === null
//                   ? { disconnect: true }
//                   : { connect: { id: data.brandId } },
//             }
//           : {}),
//         ...(locationId !== undefined ? { locationId } : {}),
//       };

//       // 6. Оновлюємо оголошення в транзакції
//       return await prisma.$transaction(async (tx) => {
//         // 6.1. Оновлюємо оголошення
//         const updatedListing = await tx.listing.update({
//           where: { id },
//           data: updateData,
//         });

//         // 6.2. Оновлюємо motorizedSpec, якщо надані
//         if (motorizedSpec) {
//           // Перевіряємо чи існує запис
//           const existingSpec = await tx.motorizedSpec.findUnique({
//             where: { listingId: id },
//           });

//           if (existingSpec) {
//             // Оновлюємо існуючий запис
//             await tx.motorizedSpec.update({
//               where: { listingId: id },
//               data: motorizedSpec,
//             });
//           } else {
//             // Створюємо новий запис
//             await tx.motorizedSpec.create({
//               data: {
//                 ...motorizedSpec,
//                 listingId: id,
//               },
//             });
//           }
//         }

//         // 6.3. Логуємо дію
//         await tx.userActivity.create({
//           data: {
//             userId: updatedListing.userId,
//             action: 'UPDATE_LISTING',
//             resourceId: id,
//             resourceType: 'LISTING',
//             metadata: { listingId: id },
//           },
//         });

//         return { listing: updatedListing };
//       });
//     } catch (error: any) {
//       logger.error(`Помилка оновлення оголошення: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Отримання списку оголошень з фільтрами
//    */
//   async getListings(filters: ListingQueryFilters) {
//     try {
//       const {
//         search,
//         category,
//         condition,
//         minPrice,
//         maxPrice,
//         countryId,
//         regionId,
//         communityId,
//         sortBy = 'createdAt',
//         sortOrder = 'desc',
//         page = 1,
//         limit = 20,
//         userId,
//         currency,
//         active,
//         location,
//       } = filters;

//       // 1. Формування умов where для фільтрації
//       let where: any = {
//         active: active === undefined ? true : active,
//       };

//       // Додаємо умови залежно від наданих фільтрів
//       if (search) {
//         where.OR = [
//           { title: { contains: search, mode: 'insensitive' } },
//           { description: { contains: search, mode: 'insensitive' } },
//         ];
//       }

//       if (category) {
//         where.category = category;
//       }

//       if (condition) {
//         where.condition = condition;
//       }

//       if (minPrice !== undefined || maxPrice !== undefined) {
//         where.price = {};
//         if (minPrice !== undefined) {
//           where.price.gte = minPrice;
//         }
//         if (maxPrice !== undefined) {
//           where.price.lte = maxPrice;
//         }
//       }

//       if (currency) {
//         where.currency = currency;
//       }

//       if (userId) {
//         where.userId = userId;
//       }

//       // Фільтр за місцезнаходженням
//       if (location || countryId || regionId) {
//         where.location = {};
        
//         if (countryId) {
//           where.location.countryId = countryId;
//         }
        
//         // Для зворотної сумісності, тепер шукаємо по текстових полях
//         if (regionId) {
//           where.OR = [
//             { location: { region: { contains: String(regionId), mode: 'insensitive' } } },
//           ];
//         }
        
//         if (communityId) {
//           where.OR = [
//             { location: { district: { contains: String(communityId), mode: 'insensitive' } } },
//           ];
//         }
        
//         // Якщо передано новий формат location з координатами
//         if (location?.latitude && location?.longitude) {
//           // TODO: додати геопошук по координатах (наприклад, в радіусі N км)
//         }
//       }

//       // 2. Отримання загальної кількості оголошень
//       const total = await prisma.listing.count({ where });

//       // 3. Отримання сторінки оголошень
//       const listings = await prisma.listing.findMany({
//         where,
//         include: {
//           user: {
//             select: {
//               id: true,
//               name: true,
//               email: true,
//               avatar: true,
//               phoneNumber: true,
//               createdAt: true,
//             },
//           },
//           location: true,
//           brand: {
//             select: {
//               id: true,
//               name: true,
//               logo: true,
//             },
//           },
//           favorites: {
//             select: {
//               userId: true,
//             },
//           },
//           motorizedSpec: true,
//         },
//         orderBy: {
//           [sortBy]: sortOrder,
//         },
//         skip: (page - 1) * limit,
//         take: limit,
//       });

//       // Трансформація для клієнта: додати поле "isFavorite" і приховати непотрібні деталі
//       const transformedListings = listings.map((listing) => {
//         const { favorites, ...rest } = listing;
//         return {
//           ...rest,
//           favoriteCount: favorites.length,
//         };
//       });

//       // 4. Формування результату
//       return {
//         listings: transformedListings,
//         pagination: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//       };
//     } catch (error: any) {
//       logger.error(`Помилка отримання списку оголошень: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Отримання деталей конкретного оголошення
//    */
//   async getListing(id: number): Promise<ListingWithDetails> {
//     try {
//       // 1. Пошук оголошення з усіма зв'язками
//       const listing = await prisma.listing.findUnique({
//         where: { id },
//         include: {
//           user: {
//             select: {
//               id: true,
//               name: true,
//               email: true,
//               avatar: true,
//               phone: true,
//               createdAt: true,
//               telegram: true,
//               viber: true,
//               whatsapp: true,
//             },
//           },
//           location: true,
//           brand: {
//             select: {
//               id: true,
//               name: true,
//               logo: true,
//             },
//           },
//           motorizedSpec: true,
//         },
//       });

//       // Якщо оголошення не знайдено
//       if (!listing) {
//         throw new Error(`Оголошення з ID ${id} не знайдено`);
//       }

//       // 2. Оновлення лічильника переглядів
//       await prisma.listing.update({
//         where: { id },
//         data: { views: { increment: 1 } },
//       });

//       // 3. Отримання схожих оголошень
//       const similarListings = await prisma.listing.findMany({
//         where: {
//           id: { not: id },
//           active: true,
//           OR: [
//             { category: listing.category },
//             { brandId: listing.brandId || 0 },
//           ],
//         },
//         include: {
//           location: true,
//           brand: {
//             select: {
//               id: true,
//               name: true,
//               logo: true,
//             },
//           },
//           favorites: {
//             select: {
//               userId: true,
//             },
//           },
//         },
//         take: 6,
//       });

//       // Трансформація для клієнта
//       const { favorites, ...rest } = listing;

//       return {
//         ...rest,
//         favoriteCount: favorites.length,
//         similarListings: similarListings.map((simListing) => {
//           const { favorites: simFavorites, ...simRest } = simListing;
//           return {
//             ...simRest,
//             favoriteCount: simFavorites.length,
//           };
//         }),
//       };
//     } catch (error: any) {
//       logger.error(`Помилка отримання оголошення: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Видалення оголошення
//    */
//   async deleteListing(id: number): Promise<void> {
//     try {
//       // 1. Перевіряємо чи існує оголошення
//       const listing = await prisma.listing.findUnique({
//         where: { id },
//         select: { images: true },
//       });

//       if (!listing) {
//         throw new Error(`Оголошення з ID ${id} не знайдено`);
//       }

//       // 2. Видаляємо всі пов'язані сутності (транзакція)
//       await prisma.$transaction(async (tx) => {
//         // Видаляємо зображення
//         if (listing.images && listing.images.length > 0) {
//           await imageService.deleteImages(listing.images);
//         }

//         // Видаляємо пов'язані дані
//         await tx.motorizedSpec.deleteMany({ where: { listingId: id } });
//         await tx.favorite.deleteMany({ where: { listingId: id } });

//         // Видаляємо оголошення
//         await tx.listing.delete({ where: { id } });

//         // Логування дії
//         // await tx.userActivity.create({
//         //   data: {
//         //     userId: userId,
//         //     action: 'DELETE_LISTING',
//         //     resourceId: id,
//         //     resourceType: 'LISTING',
//         //     metadata: { listingId: id },
//         //   },
//         // });
//       });
//     } catch (error: any) {
//       logger.error(`Помилка видалення оголошення: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Перевірка чи користувач є власником оголошення
//    */
//   async isListingOwner(listingId: number, userId: number): Promise<boolean> {
//     try {
//       const listing = await prisma.listing.findUnique({
//         where: { id: listingId },
//         select: { userId: true },
//       });

//       return listing?.userId === userId;
//     } catch (error: any) {
//       logger.error(`Помилка перевірки власника оголошення: ${error.message}`);
//       return false;
//     }
//   },

//   /**
//    * Додавання оголошення в обрані
//    */
//   async toggleFavorite(
//     listingId: number,
//     userId: number
//   ): Promise<{ isFavorite: boolean }> {
//     try {
//       // Перевіряємо чи оголошення вже в обраних
//       const existingFavorite = await prisma.favorite.findUnique({
//         where: {
//           userId_listingId: {
//             userId,
//             listingId,
//           },
//         },
//       });

//       if (existingFavorite) {
//         // Видаляємо з обраних
//         await prisma.favorite.delete({
//           where: {
//             userId_listingId: {
//               userId,
//               listingId,
//             },
//           },
//         });
//         return { isFavorite: false };
//       } else {
//         // Додаємо в обрані
//         await prisma.favorite.create({
//           data: {
//             userId,
//             listingId,
//           },
//         });

//         // Повідомлення власнику оголошення про додавання в обрані
//         const listing = await prisma.listing.findUnique({
//           where: { id: listingId },
//           select: { userId: true, title: true },
//         });

//         if (listing && listing.userId !== userId) {
//           // Надсилаємо повідомлення власнику тільки якщо це не він сам додав в обрані
//           await notificationService.createNotification({
//             userId: listing.userId,
//             type: 'FAVORITE_ADDED',
//             title: 'Нове додавання в обрані',
//             message: `Ваше оголошення "${listing.title}" додано в обрані`,
//             data: { listingId },
//           });
//         }

//         return { isFavorite: true };
//       }
//     } catch (error: any) {
//       logger.error(`Помилка при роботі з обраними: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Отримання обраних оголошень користувача
//    */
//   async getFavorites(userId: number, page = 1, limit = 20) {
//     try {
//       // 1. Отримання загальної кількості
//       const total = await prisma.favorite.count({
//         where: { userId },
//       });

//       // 2. Отримання сторінки обраних оголошень
//       const favorites = await prisma.favorite.findMany({
//         where: { userId },
//         include: {
//           listing: {
//             include: {
//               location: true,
//               brand: {
//                 select: {
//                   id: true,
//                   name: true,
//                   logo: true,
//                 },
//               },
//             },
//           },
//         },
//         skip: (page - 1) * limit,
//         take: limit,
//       });

//       // 3. Трансформація для клієнта
//       const listings = favorites
//         .filter((fav) => fav.listing !== null) // Виключаємо видалені оголошення
//         .map((fav) => ({
//           ...fav.listing,
//           isFavorite: true,
//         }));

//       return {
//         listings,
//         pagination: {
//           total,
//           page,
//           limit,
//           totalPages: Math.ceil(total / limit),
//         },
//       };
//     } catch (error: any) {
//       logger.error(`Помилка отримання обраних оголошень: ${error.message}`);
//       throw error;
//     }
//   },

//   /**
//    * Перевірка та деактивація застарілих оголошень
//    */
//   async checkExpiredListings(): Promise<void> {
//     try {
//       const today = new Date();
//       const expireDays = 30; // Термін активності оголошення в днях

//       // Знаходимо оголошення, які потрібно деактивувати
//       const expiredListings = await prisma.listing.findMany({
//         where: {
//           active: true,
//           updatedAt: {
//             lt: new Date(today.getTime() - expireDays * 24 * 60 * 60 * 1000),
//           },
//         },
//         select: { id: true, userId: true, title: true },
//       });

//       if (expiredListings.length > 0) {
//         logger.info(`Деактивація ${expiredListings.length} застарілих оголошень`);

//         // Деактивуємо оголошення
//         await prisma.listing.updateMany({
//           where: {
//             id: { in: expiredListings.map((l) => l.id) },
//           },
//           data: { active: false },
//         });

//         // Надсилаємо повідомлення власникам
//         for (const listing of expiredListings) {
//           await notificationService.createNotification({
//             userId: listing.userId,
//             type: 'LISTING_EXPIRED',
//             title: 'Оголошення деактивовано',
//             message: `Ваше оголошення "${listing.title}" було деактивовано через ${expireDays} днів неактивності`,
//             data: { listingId: listing.id },
//           });
//         }
//       }
//     } catch (error: any) {
//       logger.error(`Помилка деактивації застарілих оголошень: ${error.message}`);
//     }
//   },
// };

// // import { PrismaClient, Listing, Prisma } from '@prisma/client';
// // import { logger } from '../utils/logger';
// // import { formatPriceWithCurrency, getCurrencySymbol } from '../utils/currency';

// // const prisma = new PrismaClient();

// // interface LocationInput {
// //   countryId: number;
// //   regionId: number; // додайте regionId!
// //   communityId?: number;
// //   settlement: string;
// //   latitude?: number;
// //   longitude?: number;
// // }

// // interface CreateListingData {
// //   title: string;
// //   description: string;
// //   price: number;
// //   currency: string;
// //   location: LocationInput;
// //   category: string;
// //   categoryId: number;
// //   brandId?: number;
// //   images: string[];
// //   condition: 'new' | 'used';
// //   userId: number;
// //   // Додатково для моторизованої техніки:
// //   motorizedSpec?: any;
// // }

// // interface UpdateListingData {
// //   title?: string;
// //   description?: string;
// //   price?: number;
// //   currency?: string;
// //   location?: LocationInput;
// //   category?: string;
// //   categoryId?: number;
// //   brandId?: number | null;
// //   images?: string[];
// //   condition?: 'new' | 'used';
// //   active?: boolean;
// //   // Додатково для моторизованої техніки:
// //   motorizedSpec?: any;
// // }

// // interface ListingResult {
// //   listing: Listing;
// // }

// // interface ListingsResult {
// //   listings: Listing[];
// //   total: number;
// //   page: number;
// //   limit: number;
// //   totalPages: number;
// // }

// // export interface ListingQueryInput {
// //   page: number;
// //   limit: number;
// //   sortBy: 'createdAt' | 'price' | 'views';
// //   sortOrder: 'asc' | 'desc';
// //   search?: string;
// //   brandId?: number;
// //   regionId?: number;
// //   communityId?: number;
// //   settlement?: string;
// //   category?: string;
// //   categoryId?: number;
// //   condition?: 'new' | 'used';
// //   minPrice?: number;
// //   maxPrice?: number;
// //   currency?: string;
// //   userId?: number;
// // }

// // export const listingService = {
// //   /**
// //    * Створення нового оголошення
// //    */
// //   async createListing(data: CreateListingData): Promise<ListingResult> {
// //     try {
// //       logger.info('Створення нового оголошення з Location');

// //       return await prisma.$transaction(async (tx) => {
// //         // 1. Перевірка категорії
// //         if (data.categoryId) {
// //           const category = await tx.category.findUnique({
// //             where: { id: data.categoryId },
// //           });
// //           if (!category) throw new Error('Категорія не знайдена');
// //         }

// //         // 2. Перевірка бренду
// //         if (data.brandId) {
// //           const brand = await tx.brand.findUnique({
// //             where: { id: data.brandId },
// //           });
// //           if (!brand) throw new Error('Бренд не знайдений');
// //         }

// //         // 3. Знайти або створити Location (з урахуванням countryId, latitude, longitude)
// //         let locationId: number;
// //         const {
// //           countryId,
// //           regionId,
// //           communityId,
// //           settlement,
// //           latitude,
// //           longitude,
// //         } = data.location;

// //         let location = await tx.location.findFirst({
// //           where: {
// //             countryId,
// //             regionId,
// //             communityId: communityId ? communityId : undefined,
// //             settlement: settlement.trim(),
// //             latitude,
// //             longitude,
// //           },
// //         });
// //         if (!location) {
// //           location = await tx.location.create({
// //             data: {
// //               countryId,
// //               regionId, // ДОДАЙТЕ ЦЕ ПОЛЕ!
// //               communityId: communityId ? communityId : undefined,
// //               settlement: settlement.trim(),
// //               latitude,
// //               longitude,
// //             },
// //           });
// //         }
// //         locationId = location.id;

// //         // 4. Створення оголошення
// //         const listing = await tx.listing.create({
// //           data: {
// //             title: data.title,
// //             description: data.description,
// //             price: data.price,
// //             currency: data.currency as any,
// //             locationId,
// //             category: data.category,
// //             categoryId: data.categoryId,
// //             brandId: data.brandId,
// //             images: data.images,
// //             condition: data.condition,
// //             userId: data.userId,
// //             active: true,
// //           },
// //         });

// //         // 5. Якщо категорія моторизована — створити MotorizedSpec
// //         if (data.motorizedSpec) {
// //           await tx.motorizedSpec.create({
// //             data: {
// //               ...data.motorizedSpec,
// //               listingId: listing.id,
// //             },
// //           });
// //         }

// //         // 6. Логування дії
// //         await tx.userActivity.create({
// //           data: {
// //             userId: data.userId,
// //             action: 'CREATE_LISTING',
// //             resourceId: listing.id,
// //             resourceType: 'LISTING',
// //             metadata: { listingId: listing.id },
// //           },
// //         });

// //         logger.info(`Оголошення з ID ${listing.id} успішно створено`);
// //         return { listing };
// //       });
// //     } catch (error) {
// //       logger.error(`Помилка створення оголошення: ${error}`);
// //       throw error;
// //     }
// //   },

// //   /**
// //    * Оновлення існуючого оголошення
// //    */
// //   async updateListing(
// //     id: number,
// //     data: UpdateListingData
// //   ): Promise<ListingResult> {
// //     try {
// //       logger.info(`Оновлення оголошення з ID ${id}`);

// //       // 1. Перевірка існування оголошення
// //       const existingListing = await prisma.listing.findUnique({
// //         where: { id },
// //       });
// //       if (!existingListing) {
// //         logger.warn(`Оголошення з ID ${id} не знайдено`);
// //         throw new Error('Оголошення не знайдено');
// //       }

// //       // 2. Перевірка категорії, якщо вказано
// //       if (data.categoryId) {
// //         const category = await prisma.category.findUnique({
// //           where: { id: data.categoryId },
// //         });
// //         if (!category) throw new Error('Категорія не знайдена');
// //       }

// //       // 3. Перевірка бренду, якщо вказано
// //       if (data.brandId) {
// //         const brand = await prisma.brand.findUnique({
// //           where: { id: data.brandId },
// //         });
// //         if (!brand) throw new Error('Бренд не знайдений');
// //       }

// //       // 4. Оновлення Location, якщо потрібно
// //       let locationId: number | undefined = undefined;
// //       if (data.location) {
// //         const {
// //           countryId,
// //           regionId,
// //           communityId,
// //           settlement,
// //           latitude,
// //           longitude,
// //         } = data.location;
// //         let location = await prisma.location.findFirst({
// //           where: {
// //             countryId,
// //             regionId,
// //             communityId,
// //             settlement: settlement.trim(),
// //             latitude,
// //             longitude,
// //           },
// //         });
// //         if (!location) {
// //           location = await prisma.location.create({
// //             data: {
// //               countryId,
// //               regionId, // ДОДАЙТЕ ЦЕ ПОЛЕ!
// //               communityId,
// //               settlement: settlement.trim(),
// //               latitude,
// //               longitude,
// //             },
// //           });
// //         }
// //         locationId = location.id;
// //       }

// //       // 5. Оновлення оголошення
// //       const { location, motorizedSpec, ...dataWithoutLocation } = data;
// //       const updateData: Prisma.ListingUpdateInput = {
// //         ...dataWithoutLocation,
// //         ...(data.currency !== undefined
// //           ? { currency: data.currency as any }
// //           : {}),
// //         ...(data.condition !== undefined ? { condition: data.condition } : {}),
// //         ...(data.categoryId !== undefined
// //           ? { categoryId: data.categoryId }
// //           : {}),
// //         ...(data.brandId !== undefined
// //           ? {
// //               brand:
// //                 data.brandId === null
// //                   ? { disconnect: true }
// //                   : { connect: { id: data.brandId } },
// //             }
// //           : {}),
// //         ...(locationId !== undefined ? { locationId } : {}),
// //       };

// //       const listing = await prisma.listing.update({
// //         where: { id },
// //         data: updateData,
// //       });

// //       // 6. Оновлення MotorizedSpec (якщо потрібно)
// //       if (motorizedSpec) {
// //         const existingSpec = await prisma.motorizedSpec.findUnique({
// //           where: { listingId: id },
// //         });
// //         if (existingSpec) {
// //           await prisma.motorizedSpec.update({
// //             where: { listingId: id },
// //             data: motorizedSpec,
// //           });
// //         } else {
// //           await prisma.motorizedSpec.create({
// //             data: {
// //               ...motorizedSpec,
// //               listingId: id,
// //             },
// //           });
// //         }
// //       }

// //       logger.info(`Оголошення з ID ${id} успішно оновлено`);
// //       return { listing };
// //     } catch (error) {
// //       logger.error(`Помилка оновлення оголошення: ${error}`);
// //       throw error;
// //     }
// //   },

// //   /**
// //    * Отримання деталей оголошення
// //    */
// //   async getListing(id: number): Promise<any> {
// //     try {
// //       logger.info(`Отримання оголошення з ID ${id}`);

// //       const listing = await prisma.listing.findUnique({
// //         where: { id },
// //         include: {
// //           user: {
// //             select: {
// //               id: true,
// //               name: true,
// //               email: true,
// //               avatar: true,
// //               phoneNumber: true,
// //             },
// //           },
// //           brand: true,
// //           location: {
// //             include: {
// //               country: true,
// //               community: {
// //                 include: {
// //                   region: true,
// //                 },
// //               },
// //             },
// //           },
// //           motorizedSpec: true,
// //         },
// //       });

// //       if (!listing) {
// //         logger.warn(`Оголошення з ID ${id} не знайдено`);
// //         throw new Error('Оголошення не знайдено');
// //       }

// //       // Оновлення кількості переглядів
// //       await prisma.listing.update({
// //         where: { id },
// //         data: { views: { increment: 1 } },
// //       });

// //       // Додаємо додаткову інформацію до відповіді
// //       const enrichedListing = {
// //         ...listing,
// //         formattedPrice: formatPriceWithCurrency(
// //           listing.price,
// //           listing.currency
// //         ),
// //         currencySymbol: getCurrencySymbol(listing.currency),
// //       };

// //       logger.info(`Оголошення з ID ${id} успішно отримано`);
// //       return enrichedListing;
// //     } catch (error) {
// //       logger.error(`Помилка отримання оголошення: ${error}`);
// //       throw error;
// //     }
// //   },

// //   /**
// //    * Отримання списку оголошень з фільтрами
// //    */
// //   async getListings(filters: ListingQueryInput): Promise<ListingsResult> {
// //     try {
// //       logger.info('Отримання списку оголошень з фільтрами');

// //       const where: Prisma.ListingWhereInput = {
// //         active: true,
// //       };

// //       // Фільтр за категорією
// //       if (filters.category) {
// //         where.category = filters.category;
// //       }
// //       if (filters.categoryId) {
// //         where.categoryId = filters.categoryId;
// //       }
// //       if (filters.brandId) {
// //         where.brandId = filters.brandId;
// //       }
// //       if (filters.minPrice) {
// //         where.price = {
// //           ...((where.price as object) || {}),
// //           gte: filters.minPrice,
// //         };
// //       }
// //       if (filters.currency) {
// //         where.currency = filters.currency as any;
// //       }
// //       if (filters.maxPrice) {
// //         where.price = {
// //           ...((where.price as object) || {}),
// //           lte: filters.maxPrice,
// //         };
// //       }
// //       // Фільтр за країною, регіоном, громадою, settlement
// //       if (filters.regionId || filters.communityId || filters.settlement) {
// //         where.location = {
// //           ...(filters.communityId
// //             ? { community: { id: filters.communityId } }
// //             : {}),
// //           ...(filters.regionId ? { regionId: filters.regionId } : {}),
// //           ...(filters.settlement
// //             ? {
// //                 settlement: {
// //                   contains: filters.settlement,
// //                   mode: 'insensitive',
// //                 },
// //               }
// //             : {}),
// //         };
// //       }
// //       if (filters.search) {
// //         where.OR = [
// //           { title: { contains: filters.search, mode: 'insensitive' } },
// //           { description: { contains: filters.search, mode: 'insensitive' } },
// //         ];
// //       }
// //       if (filters.condition) {
// //         where.condition = filters.condition;
// //       }
// //       if (filters.userId) {
// //         where.userId = filters.userId;
// //       }

// //       // Сортування
// //       const orderBy: any = {};
// //       if (filters.sortBy === 'createdAt') {
// //         orderBy.createdAt = filters.sortOrder;
// //       } else if (filters.sortBy === 'price') {
// //         orderBy.price = filters.sortOrder;
// //       } else if (filters.sortBy === 'views') {
// //         orderBy.views = filters.sortOrder;
// //       }

// //       // Пагінація
// //       const page = filters.page || 1;
// //       const limit = filters.limit || 10;
// //       const skip = (page - 1) * limit;

// //       // Запити
// //       const [listings, total] = await Promise.all([
// //         prisma.listing.findMany({
// //           where,
// //           orderBy,
// //           skip,
// //           take: limit,
// //           include: {
// //             user: {
// //               select: {
// //                 id: true,
// //                 name: true,
// //                 avatar: true,
// //               },
// //             },
// //             brand: true,
// //             location: {
// //               include: {
// //                 country: true,
// //                 community: {
// //                   include: {
// //                     region: true,
// //                   },
// //                 },
// //               },
// //             },
// //             motorizedSpec: true,
// //           },
// //         }),
// //         prisma.listing.count({ where }),
// //       ]);

// //       const totalPages = Math.ceil(total / limit);

// //       logger.info(`Отримано ${listings.length} оголошень з ${total} загальних`);
// //       return {
// //         listings,
// //         total,
// //         page,
// //         limit,
// //         totalPages,
// //       };
// //     } catch (error) {
// //       logger.error(`Помилка отримання списку оголошень: ${error}`);
// //       throw error;
// //     }
// //   },

// //   /**
// //    * Видалення оголошення
// //    */
// //   async deleteListing(id: number): Promise<void> {
// //     try {
// //       logger.info(`Видалення оголошення з ID ${id}`);

// //       const listing = await prisma.listing.findUnique({
// //         where: { id },
// //       });

// //       if (!listing) {
// //         logger.warn(`Оголошення з ID ${id} не знайдено`);
// //         throw new Error('Оголошення не знайдено');
// //       }

// //       // Видалити MotorizedSpec, якщо є
// //       await prisma.motorizedSpec.deleteMany({
// //         where: { listingId: id },
// //       });

// //       await prisma.listing.delete({
// //         where: { id },
// //       });

// //       logger.info(`Оголошення з ID ${id} успішно видалено`);
// //     } catch (error) {
// //       logger.error(`Помилка видалення оголошення: ${error}`);
// //       throw error;
// //     }
// //   },

// //   /**
// //    * Перевірка, чи користувач є власником оголошення
// //    */
// //   async isListingOwner(id: number, userId: number): Promise<boolean> {
// //     try {
// //       logger.info(`Перевірка власника оголошення з ID ${id}`);

// //       const listing = await prisma.listing.findUnique({
// //         where: { id },
// //         select: { userId: true },
// //       });

// //       if (!listing) {
// //         logger.warn(`Оголошення з ID ${id} не знайдено`);
// //         throw new Error('Оголошення не знайдено');
// //       }

// //       return listing.userId === userId;
// //     } catch (error) {
// //       logger.error(`Помилка перевірки власника оголошення: ${error}`);
// //       throw error;
// //     }
// //   },
// // };
