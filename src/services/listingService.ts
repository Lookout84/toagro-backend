import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { setCache, getCache, deleteCache } from '../utils/redis';

interface CreateListingData {
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  categoryId?: number; // Додаємо поле categoryId
  brandId?: number; // Додаємо поле brandId
  images?: string[];
  userId: number;
  condition?: 'NEW' | 'USED';
}

interface UpdateListingData {
title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  categoryId?: number; // Додаємо поле categoryId
  brandId?: number; // Додаємо поле brandId
  images?: string[];
  userId: number;
  condition?: 'NEW' | 'USED';
}

interface ListingFilters {
  category?: string;
  categoryId?: number; // Додаємо поле categoryId
  brandId?: number; // Додаємо поле brandId
  brand?: string; // Додаємо поле brand
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  condition?: 'new' | 'used';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'price' | 'views';
  sortOrder?: 'asc' | 'desc';
}

export const listingService = {
  async createListing(data: CreateListingData) {
  try {
    // Перевірка категорії, якщо вказано
    if (data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
      });
  
      if (!category) {
        throw new Error('Категорія не знайдена');
      }
    }
    
    // Перевірка бренду, якщо вказано
    if (data.brandId) {
      const brand = await prisma.brand.findUnique({
        where: { id: data.brandId },
      });
  
      if (!brand) {
        throw new Error('Бренд не знайдений');
      }
    }
    
    // Перетворення condition у правильний формат для enum в Prisma
    const condition = data.condition?.toUpperCase() as any || 'USED';
    
    const listing = await prisma.listing.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        location: data.location,
        category: data.category,
        categoryId: data.categoryId,
        brandId: data.brandId,
        images: data.images || [],
        userId: data.userId,
        condition, // Використовуємо перетворене значення
      },
    });

    return { listing };
  } catch (error) {
    logger.error(`Failed to create listing: ${error}`);
    throw error;
  }
},
  async updateListing(id: number, data: UpdateListingData) {
    const listing = await prisma.listing.update({
      where: { id },
      data,
    });

    // Clear cache
    await deleteCache(`listing:${id}`);

    return { listing };
  },

  async deleteListing(id: number) {
    await prisma.listing.delete({
      where: { id },
    });

    // Clear cache
    await deleteCache(`listing:${id}`);

    return { message: 'Listing deleted successfully' };
  },

  async getListing(id: number) {
    // Try to get from cache
    const cachedListing = await getCache<any>(`listing:${id}`);
    if (cachedListing) {
      return { listing: cachedListing };
    }

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            avatar: true,
          },
        },
      },
    });

    if (!listing) {
      throw new Error('Listing not found');
    }

    // Increment views
    await prisma.listing.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    // Cache for 5 minutes
    await setCache(`listing:${id}`, listing, 300);

    return { listing };
  },

  async getListings(filters: ListingFilters = {}) {
    const {
      category,
      categoryId,
      minPrice,
      maxPrice,
      location,
      search,
      condition,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const skip = (page - 1) * limit;

    // Build filter conditions
    const where: any = { active: true };

    if (category) {
      where.category = category;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (condition) {
      where.condition = condition;
    } 
    // Build sort object
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Try to get from cache for common queries
    const cacheKey = `listings:${JSON.stringify({ where, orderBy, skip, limit })}`;
    const cachedListings = await getCache<any>(cacheKey);

    if (cachedListings) {
      return cachedListings;
    }

    // Query database
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
        },
      }),
      prisma.listing.count({ where }),
    ]);

    const result = {
      listings,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };

    // Cache for 2 minutes
    await setCache(cacheKey, result, 120);

    return result;
  },

  async getUserListings(userId: number, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.listing.count({ where: { userId } }),
    ]);

    return {
      listings,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },
};
