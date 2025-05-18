import { PrismaClient, Listing, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { formatPriceWithCurrency, getCurrencySymbol } from '../utils/currency';

const prisma = new PrismaClient();

interface LocationInput {
  regionId: number;
  communityId: number;
  settlement: string;
}

interface CreateListingData {
  title: string;
  description: string;
  price: number;
  currency: string;
  location: LocationInput;
  category: string;
  categoryId: number;
  brandId?: number;
  images: string[];
  condition: 'new' | 'used';
  userId: number;
}

interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  location?: LocationInput;
  category?: string;
  categoryId?: number;
  brandId?: number | null;
  images?: string[];
  condition?: 'new' | 'used';
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
  regionId?: number;
  communityId?: number;
  settlement?: string;
  category?: string;
  categoryId?: number;
  condition?: 'new' | 'used';
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  userId?: number;
}

export const listingService = {
  /**
   * Створення нового оголошення
   */
  async createListing(data: CreateListingData): Promise<ListingResult> {
    try {
      logger.info('Створення нового оголошення з Location');

      return await prisma.$transaction(async (tx) => {
        // 1. Перевірка категорії
        if (data.categoryId) {
          const category = await tx.category.findUnique({
            where: { id: data.categoryId },
          });
          if (!category) throw new Error('Категорія не знайдена');
        }

        // 2. Перевірка бренду
        if (data.brandId) {
          const brand = await tx.brand.findUnique({
            where: { id: data.brandId },
          });
          if (!brand) throw new Error('Бренд не знайдений');
        }

        // 3. Знайти або створити Location
        let locationId: number;
        const { regionId, communityId, settlement } = data.location;
        let location = await tx.location.findFirst({
          where: {
            communityId,
            settlement: settlement.trim(),
          },
        });
        if (!location) {
          location = await tx.location.create({
            data: {
              communityId,
              settlement: settlement.trim(),
            },
          });
        }
        locationId = location.id;

        // 4. Створення оголошення
        const listing = await tx.listing.create({
          data: {
            title: data.title,
            description: data.description,
            price: data.price,
            currency: data.currency as any,
            locationId,
            category: data.category,
            categoryId: data.categoryId,
            brandId: data.brandId,
            images: data.images,
            condition: data.condition,
            userId: data.userId,
            active: true,
          },
        });

        // 5. Логування дії
        await tx.userActivity.create({
          data: {
            userId: data.userId,
            action: 'CREATE_LISTING',
            resourceId: listing.id,
            resourceType: 'LISTING',
            metadata: { listingId: listing.id },
          },
        });

        logger.info(`Оголошення з ID ${listing.id} успішно створено`);
        return { listing };
      });
    } catch (error) {
      logger.error(`Помилка створення оголошення: ${error}`);
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
        if (!category) throw new Error('Категорія не знайдена');
      }

      // 3. Перевірка бренду, якщо вказано
      if (data.brandId) {
        const brand = await prisma.brand.findUnique({
          where: { id: data.brandId },
        });
        if (!brand) throw new Error('Бренд не знайдений');
      }

      // 4. Оновлення Location, якщо потрібно
      let locationId: number | undefined = undefined;
      if (data.location) {
        const { communityId, settlement } = data.location;
        let location = await prisma.location.findFirst({
          where: {
            communityId,
            settlement: settlement.trim(),
          },
        });
        if (!location) {
          location = await prisma.location.create({
            data: {
              communityId,
              settlement: settlement.trim(),
            },
          });
        }
        locationId = location.id;
      }

      // 5. Оновлення оголошення
      const { location, ...dataWithoutLocation } = data;
      const updateData: Prisma.ListingUpdateInput = {
        ...dataWithoutLocation,
        ...(data.currency !== undefined
          ? { currency: data.currency as any }
          : {}),
        ...(data.condition !== undefined
          ? { condition: data.condition }
          : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.brandId !== undefined
          ? {
              brand:
                data.brandId === null
                  ? { disconnect: true }
                  : { connect: { id: data.brandId } },
            }
          : {}),
        ...(locationId !== undefined ? { locationId } : {}),
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
    try {
      logger.info(`Отримання оголошення з ID ${id}`);

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
          location: {
            include: {
              community: {
                include: {
                  region: true,
                },
              },
            },
          },
        },
      });

      if (!listing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

      // Оновлення кількості переглядів
      await prisma.listing.update({
        where: { id },
        data: { views: { increment: 1 } },
      });

      // Додаємо додаткову інформацію до відповіді
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
    filters: ListingQueryInput
  ): Promise<ListingsResult> {
    try {
      logger.info('Отримання списку оголошень з фільтрами');

      const where: Prisma.ListingWhereInput = {
        active: true,
      };

      // Фільтр за категорією
      if (filters.category) {
        where.category = filters.category;
      }
      if (filters.categoryId) {
        where.categoryId = filters.categoryId;
      }
      if (filters.brandId) {
        where.brandId = filters.brandId;
      }
      if (filters.minPrice) {
        where.price = {
          ...((where.price as object) || {}),
          gte: filters.minPrice,
        };
      }
      if (filters.currency) {
        where.currency = filters.currency as any;
      }
      if (filters.maxPrice) {
        where.price = {
          ...((where.price as object) || {}),
          lte: filters.maxPrice,
        };
      }
      // Фільтр за регіоном, громадою, settlement
      if (filters.regionId || filters.communityId || filters.settlement) {
        where.location = {
          ...(filters.communityId
            ? { community: { id: filters.communityId } }
            : {}),
          ...(filters.regionId
            ? { community: { regionId: filters.regionId } }
            : {}),
          ...(filters.settlement
            ? { settlement: { contains: filters.settlement, mode: 'insensitive' } }
            : {}),
        };
      }
      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.condition) {
        where.condition = filters.condition;
      }
      if (filters.userId) {
        where.userId = filters.userId;
      }

      // Сортування
      const orderBy: any = {};
      if (filters.sortBy === 'createdAt') {
        orderBy.createdAt = filters.sortOrder;
      } else if (filters.sortBy === 'price') {
        orderBy.price = filters.sortOrder;
      } else if (filters.sortBy === 'views') {
        orderBy.views = filters.sortOrder;
      }

      // Пагінація
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Запити
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
            location: {
              include: {
                community: {
                  include: {
                    region: true,
                  },
                },
              },
            },
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

      const listing = await prisma.listing.findUnique({
        where: { id },
      });

      if (!listing) {
        logger.warn(`Оголошення з ID ${id} не знайдено`);
        throw new Error('Оголошення не знайдено');
      }

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