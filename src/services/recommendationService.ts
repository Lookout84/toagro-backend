import { prisma } from '../config/db';
import { setCache, getCache } from '../utils/redis';

export const recommendationService = {
  async getRecommendedListings(userId: number, limit = 5) {
    // Try to get from cache
    const cacheKey = `recommendations:${userId}`;
    const cachedRecommendations = await getCache<any>(cacheKey);
    
    if (cachedRecommendations) {
      return cachedRecommendations;
    }

    // Get user's viewed listings categories
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        listings: {
          select: { category: true },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    let recommendedListings = [];

    // If user has listings, recommend similar ones
    if (user.listings.length > 0) {
      const userCategories = user.listings.map((listing) => listing.category);
      
      recommendedListings = await prisma.listing.findMany({
        where: {
          userId: { not: userId },
          active: true,
          category: { in: userCategories },
        },
        orderBy: [
          { views: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
    }

    // If not enough recommendations, add popular listings
    if (recommendedListings.length < limit) {
      const remainingCount = limit - recommendedListings.length;
      const existingIds = recommendedListings.map((listing) => listing.id);
      
      const popularListings = await prisma.listing.findMany({
        where: {
          id: { notIn: existingIds },
          userId: { not: userId },
          active: true,
        },
        orderBy: [
          { views: 'desc' },
        ],
        take: remainingCount,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
      
      recommendedListings = [...recommendedListings, ...popularListings];
    }

    const result = { listings: recommendedListings };
    
    // Cache for 30 minutes
    await setCache(cacheKey, result, 1800);
    
    return result;
  },
};