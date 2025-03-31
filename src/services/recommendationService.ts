import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { ListingResponse } from '../schemas/listingSchema';

export class RecommendationService {
  private readonly CACHE_TTL = 60 * 60 * 2; // 2 години кешування

  // Основний метод отримання рекомендацій
  async getRecommendations(userId: number, limit = 10): Promise<ListingResponse[]> {
    const cacheKey = `recommendations:${userId}`;
    
    try {
      // Спроба отримати кешовані рекомендації
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Отримання історії переглядів
      const viewedListings = await this.getUserViewHistory(userId);
      
      // Якщо немає історії - повертаємо популярні
      if (viewedListings.length === 0) {
        return this.getPopularListings(limit);
      }

      // Генерація рекомендацій
      const recommendations = await this.generateRecommendations(userId, viewedListings, limit);
      
      // Збереження в кеш
      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(recommendations));
      
      return recommendations;
    } catch (error) {
      logger.error('Recommendation error:', error);
      return this.getPopularListings(limit); // Fallback
    }
  }

  // Отримання історії переглядів користувача
  private async getUserViewHistory(userId: number) {
    return prisma.viewAnalytics.findMany({
      where: { userId },
      select: { listingId: true },
      take: 100, // Обмеження для продуктивності
      orderBy: { createdAt: 'desc' }
    });
  }

  // Генерація рекомендацій на основі історії
  private async generateRecommendations(
    userId: number,
    viewedListings: { listingId: number }[],
    limit: number
  ): Promise<ListingResponse[]> {
    const viewedIds = viewedListings.map(v => v.listingId);
    
    // Отримання категорій з історії
    const categories = await prisma.listing.findMany({
      where: { id: { in: viewedIds } },
      select: { categoryId: true }
    });

    const uniqueCategoryIds = [...new Set(categories.map(c => c.categoryId))];

    // Якщо немає унікальних категорій - повертаємо популярні
    if (uniqueCategoryIds.length === 0) {
      return this.getPopularListings(limit);
    }

    // Пошук рекомендацій
    return prisma.listing.findMany({
      where: {
        categoryId: { in: uniqueCategoryIds },
        id: { notIn: viewedIds },
        status: 'ACTIVE'
      },
      include: {
        category: true,
        seller: true
      },
      orderBy: [
        { createdAt: 'desc' }, // Новіші
        { views: 'desc' }      // Популярні
      ],
      take: limit
    });
  }

  // Метод отримання популярних оголошень
  private async getPopularListings(limit: number): Promise<ListingResponse[]> {
    try {
      const cacheKey = 'popular_listings';
      const cached = await redis.get(cacheKey);
      
      if (cached) return JSON.parse(cached);

      const popular = await prisma.listing.findMany({
        where: { status: 'ACTIVE' },
        include: {
          category: true,
          seller: true
        },
        orderBy: { views: 'desc' },
        take: limit
      });

      await redis.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(popular));
      return popular;
    } catch (error) {
      logger.error('Failed to get popular listings:', error);
      return [];
    }
  }

  // Інвалідація кешу рекомендацій
  async invalidateRecommendations(userId: number) {
    await redis.del(`recommendations:${userId}`);
  }
}

export const recommendationService = new RecommendationService();