import { Prisma, Listing, Category } from '@prisma/client';
import { prisma } from '../config/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { ListingFilterInput, ListingResponse } from '../schemas/listingSchema';

export type ListingWithRelations = Prisma.ListingGetPayload<{
  include: {
    category: true;
    seller: true;
    transactions: true;
    messages: true;
  };
}>;

class ListingService {
  private readonly CACHE_TTL = 60 * 60 * 4; // 4 години

  async createListing(
    userId: number,
    data: Prisma.ListingCreateInput
  ): Promise<Listing> {
    try {
      // Перевірка прав продавця
      const user = await prisma.user.findUnique({
        where: { id: userId, role: 'SELLER' }
      });
      if (!user) throw new Error('Тільки продавці можуть створювати оголошення');

      const listing = await prisma.listing.create({
        data: {
          ...data,
          seller: { connect: { id: userId } },
          status: 'DRAFT'
        }
      });

      // Інвалідація кешу категорій
      await redis.del('categories');
      return listing;
    } catch (error) {
      logger.error('Listing creation failed:', error);
      throw new Error('Не вдалося створити оголошення');
    }
  }

  async updateListing(
    listingId: number,
    userId: number,
    data: Prisma.ListingUpdateInput
  ): Promise<Listing> {
    try {
      const listing = await prisma.listings.findUnique({
        where: { id: listingId }
      });

      if (!listing) throw new Error('Оголошення не знайдено');
      if (listing.sellerId !== userId) throw new Error('Недостатньо прав');

      const updatedListing = await prisma.listing.update({
        where: { id: listingId },
        data
      });

      // Оновлення кешу
      await Promise.all([
        redis.del(`listing:${listingId}`),
        redis.del('popular_listings')
      ]);

      return updatedListing;
    } catch (error) {
      logger.error('Listing update failed:', error);
      throw new Error('Не вдалося оновити оголошення');
    }
  }

  async getListingDetails(listingId: number): Promise<ListingWithRelations> {
    try {
      const cacheKey = `listing:${listingId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          category: true,
          seller: true,
          transactions: true,
          messages: true
        }
      });

      if (!listing) throw new Error('Оголошення не знайдено');

      // Оновлення лічильника переглядів
      await redis.zincrby('listing_views', 1, listingId.toString());
      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(listing));
      
      return listing;
    } catch (error) {
      logger.error('Failed to fetch listing:', error);
      throw new Error('Не вдалося отримати деталі оголошення');
    }
  }

  async searchListings(
    filters: ListingFilterInput
  ): Promise<ListingResponse[]> {
    try {
      const cacheKey = `search:${JSON.stringify(filters)}`;
      const cached = await redis.get(cacheKey);

      if (cached) return JSON.parse(cached);

      const where: Prisma.ListingWhereInput = {
        status: 'ACTIVE',
        AND: [
          { price: { gte: filters.minPrice } },
          { price: { lte: filters.maxPrice } },
          { categoryId: filters.category },
          { year: filters.year },
          { condition: filters.condition },
          {
            OR: [
              { title: { contains: filters.searchQuery, mode: 'insensitive' } },
              { description: { contains: filters.searchQuery, mode: 'insensitive' } }
            ]
          }
        ]
      };

      const listings = await prisma.listing.findMany({
        where,
        include: {
          category: true,
          seller: true
        },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' }
      });

      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(listings));
      return listings;
    } catch (error) {
      logger.error('Search failed:', error);
      throw new Error('Помилка пошуку');
    }
  }

  async getPopularListings(limit: number = 10): Promise<ListingResponse[]> {
    try {
      const cacheKey = 'popular_listings';
      const cached = await redis.get(cacheKey);

      if (cached) return JSON.parse(cached);

      // Отримання популярних на основі переглядів
      const popularIds = await redis.zrevrange(
        'listing_views', 
        0, 
        limit - 1
      );

      const listings = await prisma.listing.findMany({
        where: {
          id: { in: popularIds.map(id => parseInt(id)) },
          status: 'ACTIVE'
        },
        include: {
          category: true,
          seller: true
        }
      });

      // Сортування за порядком з Redis
      const sorted = popularIds
        .map(id => listings.find(l => l.id === parseInt(id)))
        .filter(Boolean) as ListingResponse[];

      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(sorted));
      return sorted;
    } catch (error) {
      logger.error('Failed to get popular listings:', error);
      throw new Error('Помилка завантаження популярних оголошень');
    }
  }

  async getAllCategories(): Promise<Category[]> {
    try {
      const cacheKey = 'categories';
      const cached = await redis.get(cacheKey);

      if (cached) return JSON.parse(cached);

      const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' }
      });

      await redis.setEx(cacheKey, this.CACHE_TTL * 2, JSON.stringify(categories));
      return categories;
    } catch (error) {
      logger.error('Failed to fetch categories:', error);
      throw new Error('Помилка завантаження категорій');
    }
  }

  async markListingAsSold(listingId: number, userId: number): Promise<Listing> {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId }
      });

      if (!listing) throw new Error('Оголошення не знайдено');
      if (listing.sellerId !== userId) throw new Error('Недостатньо прав');

      const updated = await prisma.listing.update({
        where: { id: listingId },
        data: { status: 'SOLD' }
      });

      // Інвалідація кешу
      await Promise.all([
        redis.del(`listing:${listingId}`),
        redis.del('popular_listings')
      ]);

      return updated;
    } catch (error) {
      logger.error('Failed to mark as sold:', error);
      throw new Error('Помилка оновлення статусу');
    }
  }

  async trackView(listingId: number, ip: string, userAgent?: string, userId?: number) {
    await prisma.viewAnalytics.create({
      data: {
        listingId,
        userId,
        ipAddress: ip,
        userAgent
      }
    });
  }
}

export const listingService = new ListingService();