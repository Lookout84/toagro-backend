import { PrismaClient, Listing, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { formatPriceWithCurrency, getCurrencySymbol } from '../utils/currency';

const prisma = new PrismaClient();

interface CreateListingData {
  title: string;
  description: string;
  price: number;
  currency: string;
  location: string;
  category: string;
  categoryId: number;
  brandId?: number;
  images: string[];
  condition: 'NEW' | 'USED';
  userId: number;
}

interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  currency: string;
  location?: string;
  category?: string;
  categoryId?: number;
  brandId?: number | null;
  images?: string[];
  condition?: 'NEW' | 'USED';
  active?: boolean;
}

interface ListingResult {
  listing: Listing;
}

interface ListingsResult {
  listings: Listing[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListingQueryInput {
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'price' | 'views';
  sortOrder: 'asc' | 'desc';
  search?: string;
  brandId?: number;
  location?: string;
  category?: string;
  categoryId?: number;
  condition?: 'new' | 'used';
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
}
export const listingService = {
  /**
   * Створення нового оголошення
   */
  // async createListing(data: CreateListingData): Promise<ListingResult> {
  //   try {
  //     logger.info('Створення нового оголошення');

  //     // 1. Перевірка категорії
  //     if (data.categoryId) {
  //       const category = await prisma.category.findUnique({
  //         where: { id: data.categoryId },
  //       });

  //       if (!category) {
  //         logger.warn(`Категорія з ID ${data.categoryId} не знайдена`);
  //         throw new Error('Категорія не знайдена');
  //       }
  //     }

  //     // 2. Перевірка бренду
  //     if (data.brandId) {
  //       const brand = await prisma.brand.findUnique({
  //         where: { id: data.brandId },
  //       });

  //       if (!brand) {
  //         logger.warn(`Бренд з ID ${data.brandId} не знайдений`);
  //         throw new Error('Бренд не знайдений');
  //       }
  //     }

  //     // 3. Створення оголошення
  //     const listing = await prisma.listing.create({
  //       data: {
  //         title: data.title,
  //         description: data.description,
  //         price: data.price,
  //         location: data.location,
  //         category: data.category,
  //         categoryId: data.categoryId,
  //         brandId: data.brandId,
  //         images: data.images,
  //         condition: data.condition === 'NEW' ? 'new' : 'used',
  //         userId: data.userId,
  //         active: true,
  //       },
  //     });

  //     logger.info(`Оголошення з ID ${listing.id} успішно створено`);
  //     return { listing };
  //   } catch (error) {
  //     logger.error(`Помилка створення оголошення: ${error}`);
  //     throw error;
  //   }
  // },

  // Add transaction support to the service method
  async createListing(data: CreateListingData): Promise<ListingResult> {
    try {
      logger.info('Creating new listing with transaction');

      return await prisma.$transaction(async (tx) => {
        // 1. Check category
        if (data.categoryId) {
          const category = await tx.category.findUnique({
            where: { id: data.categoryId },
          });

          if (!category) {
            throw new Error('Category not found');
          }
        }

        // 2. Check brand
        if (data.brandId) {
          const brand = await tx.brand.findUnique({
            where: { id: data.brandId },
          });

          if (!brand) {
            throw new Error('Brand not found');
          }
        }

        // 3. Create listing
        const listing = await tx.listing.create({
          data: {
            title: data.title,
            description: data.description,
            price: data.price,
            currency: data.currency as any, // Додали нове поле
            location: data.location,
            category: data.category,
            categoryId: data.categoryId,
            brandId: data.brandId,
            images: data.images,
            condition: data.condition === 'NEW' ? 'new' : 'used',
            userId: data.userId,
            active: true,
          },
        });

        // 4. Log the action
        await tx.userActivity.create({
          data: {
            userId: data.userId,
            action: 'CREATE_LISTING',
            resourceId: listing.id,
            resourceType: 'LISTING',
            metadata: { listingId: listing.id },
          },
        });

        logger.info(`Listing with ID ${listing.id} successfully created`);
        return { listing };
      });
    } catch (error) {
      logger.error(`Error creating listing: ${error}`);
      throw error;
    }
  },
  /**
   * Оновлення існуючого оголошення
   */
  async updateListing(
    id: number,
    data: UpdateListingData
  ): Promise<ListingResult> {
    try {
      logger.info(`Оновлення оголошення з ID ${id}`);

      // 1. Перевірка існування оголошення
      const existingListing = await prisma.listing.findUnique({
        where: { id },
      });

      if (!existingListing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

      // 2. Перевірка категорії, якщо вказано
      if (data.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: data.categoryId },
        });

        if (!category) {
          logger.warn(`Категорія з ID ${data.categoryId} не знайдена`);
          throw new Error('Категорія не знайдена');
        }
      }

      // 3. Перевірка бренду, якщо вказано
      if (data.brandId) {
        const brand = await prisma.brand.findUnique({
          where: { id: data.brandId },
        });

        if (!brand) {
          logger.warn(`Бренд з ID ${data.brandId} не знайдений`);
          throw new Error('Бренд не знайдений');
        }
      }

      // 4. Оновлення оголошення
      const { categoryId, brandId, condition, currency, ...restData } = data;
      const updateData: Prisma.ListingUpdateInput = {
        ...restData,
        ...(currency !== undefined
          ? { currency: { set: currency as any } }
          : {}),
        ...(condition !== undefined
          ? { condition: condition === 'NEW' ? 'new' : 'used' }
          : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(brandId !== undefined
          ? {
              brand:
                brandId === null
                  ? { disconnect: true }
                  : { connect: { id: brandId } },
            }
          : {}),
      };
      const listing = await prisma.listing.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Оголошення з ID ${id} успішно оновлено`);
      return { listing };
    } catch (error) {
      logger.error(`Помилка оновлення оголошення: ${error}`);
      throw error;
    }
  },

  /**
   * Отримання деталей оголошення
   */
  async getListing(id: number): Promise<any> {
    // Змінено тип повернення з Listing на any
    try {
      logger.info(`Отримання оголошення з ID ${id}`);

      // 1. Отримання оголошення з включенням користувача, категорії та бренду
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          brand: true,
        },
      });

      if (!listing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

      // 2. Оновлення кількості переглядів
      await prisma.listing.update({
        where: { id },
        data: { views: { increment: 1 } },
      });

      // 3. Додаємо додаткову інформацію до відповіді
      const enrichedListing = {
        ...listing,
        formattedPrice: formatPriceWithCurrency(
          listing.price,
          listing.currency
        ),
        currencySymbol: getCurrencySymbol(listing.currency),
      };

      logger.info(`Оголошення з ID ${id} успішно отримано`);
      return enrichedListing;
    } catch (error) {
      logger.error(`Помилка отримання оголошення: ${error}`);
      throw error;
    }
  },

  /**
   * Отримання списку оголошень з фільтрами
   */
  async getListings(
    filters: ListingQueryInput & { userId?: number }
  ): Promise<ListingsResult> {
    try {
      logger.info('Отримання списку оголошень з фільтрами');

      // 1. Формування фільтрів для запиту
      const where: Prisma.ListingWhereInput = {
        active: true,
      };

      // Фільтр за категорією
      if (filters.category) {
        where.category = filters.category;
      }

      // Фільтр за ID категорії
      if (filters.categoryId) {
        where.categoryId = filters.categoryId;
      }

      // Фільтр за ID бренду
      if (filters.brandId) {
        where.brandId = filters.brandId;
      }

      // Фільтр за мінімальною ціною
      if (filters.minPrice) {
        where.price = {
          ...((where.price as object) || {}),
          gte: filters.minPrice,
        };
      }

      // Фільтр за валютою
      if (filters.currency) {
        where.currency = filters.currency as any;
      }

      // Фільтр за максимальною ціною
      if (filters.maxPrice) {
        where.price = {
          ...((where.price as object) || {}),
          lte: filters.maxPrice,
        };
      }

      // Фільтр за локацією
      if (filters.location) {
        where.location = {
          contains: filters.location,
          mode: 'insensitive', // Нечутливий до регістру пошук
        };
      }

      // Фільтр за пошуковим запитом
      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Фільтр за станом товару
      if (filters.condition) {
        where.condition = filters.condition === 'new' ? 'new' : 'used';
      }

      // Фільтр за користувачем
      if (filters.userId) {
        where.userId = filters.userId;
      }

      // 2. Налаштування сортування
      const orderBy: any = {};

      if (filters.sortBy === 'createdAt') {
        orderBy.createdAt = filters.sortOrder;
      } else if (filters.sortBy === 'price') {
        orderBy.price = filters.sortOrder;
      } else if (filters.sortBy === 'views') {
        orderBy.views = filters.sortOrder;
      }

      // 3. Налаштування пагінації
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // 4. Виконання запитів
      const [listings, total] = await Promise.all([
        prisma.listing.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
            brand: true,
          },
        }),
        prisma.listing.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      logger.info(`Отримано ${listings.length} оголошень з ${total} загальних`);
      return {
        listings,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error(`Помилка отримання списку оголошень: ${error}`);
      throw error;
    }
  },

  /**
   * Видалення оголошення
   */
  async deleteListing(id: number): Promise<void> {
    try {
      logger.info(`Видалення оголошення з ID ${id}`);

      // 1. Перевірка існування оголошення
      const listing = await prisma.listing.findUnique({
        where: { id },
      });

      if (!listing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

      // 2. Видалення оголошення
      await prisma.listing.delete({
        where: { id },
      });

      logger.info(`Оголошення з ID ${id} успішно видалено`);
    } catch (error) {
      logger.error(`Помилка видалення оголошення: ${error}`);
      throw error;
    }
  },

  /**
   * Перевірка, чи користувач є власником оголошення
   */
  async isListingOwner(id: number, userId: number): Promise<boolean> {
    try {
      logger.info(`Перевірка власника оголошення з ID ${id}`);

      const listing = await prisma.listing.findUnique({
        where: { id },
        select: { userId: true },
      });

      if (!listing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

      return listing.userId === userId;
    } catch (error) {
      logger.error(`Помилка перевірки власника оголошення: ${error}`);
      throw error;
    }
  },
};
