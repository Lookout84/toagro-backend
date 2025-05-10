import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { setCache, getCache, deleteCache } from '../utils/redis';
import { Brand, Prisma } from '@prisma/client';
import slugify from 'slugify';

interface CreateBrandData {
  name: string;
  description?: string;
  logo?: string;
  active?: boolean;
  popular?: boolean;
}

interface UpdateBrandData {
  name?: string;
  description?: string;
  logo?: string;
  active?: boolean;
  popular?: boolean;
}

interface BrandFilters {
  search?: string;
  active?: boolean;
  popular?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const brandService = {
  async createBrand(data: CreateBrandData): Promise<{ brand: Brand }> {
    try {
      const slug = slugify(data.name, { lower: true, strict: true });

      // Check if brand with this name already exists
      const existingBrand = await prisma.brand.findFirst({
        where: {
          OR: [{ name: data.name }, { slug }],
        },
      });

      if (existingBrand) {
        throw new Error('Бренд з такою назвою вже існує');
      }

      const brand = await prisma.brand.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          logo: data.logo,
          active: data.active ?? true,
          popular: data.popular ?? false,
        },
      });

      // Clear brands cache
      await deleteCache('brands:all');
      await deleteCache('brands:popular');

      return { brand };
    } catch (error) {
      logger.error(`Failed to create brand: ${error}`);
      throw error;
    }
  },

  async updateBrand(
    id: number,
    data: UpdateBrandData
  ): Promise<{ brand: Brand }> {
    try {
      // Generate slug if name is updated
      const updateData: any = { ...data };
      if (data.name) {
        updateData.slug = slugify(data.name, { lower: true, strict: true });

        // Check if another brand already uses this name/slug
        const existingBrand = await prisma.brand.findFirst({
          where: {
            OR: [{ name: data.name }, { slug: updateData.slug }],
            NOT: { id },
          },
        });

        if (existingBrand) {
          throw new Error('Бренд з такою назвою вже існує');
        }
      }

      const brand = await prisma.brand.update({
        where: { id },
        data: updateData,
      });

      // Clear cache
      await deleteCache(`brand:${id}`);
      await deleteCache('brands:all');
      await deleteCache('brands:popular');

      return { brand };
    } catch (error) {
      logger.error(`Failed to update brand: ${error}`);
      throw error;
    }
  },

  async deleteBrand(id: number): Promise<{ message: string }> {
    try {
      // Check if brand has associated listings
      const listingsCount = await prisma.listing.count({
        where: { brandId: id },
      });

      if (listingsCount > 0) {
        throw new Error(
          `Неможливо видалити бренд, оскільки з ним пов'язано ${listingsCount} оголошень`
        );
      }

      await prisma.brand.delete({
        where: { id },
      });

      // Clear cache
      await deleteCache(`brand:${id}`);
      await deleteCache('brands:all');
      await deleteCache('brands:popular');

      return { message: 'Бренд успішно видалено' };
    } catch (error) {
      logger.error(`Failed to delete brand: ${error}`);
      throw error;
    }
  },

  async getBrand(idOrSlug: number | string): Promise<{ brand: Brand }> {
    try {
      // Try to get from cache
      const cacheKey =
        typeof idOrSlug === 'number'
          ? `brand:${idOrSlug}`
          : `brand:slug:${idOrSlug}`;
      const cachedBrand = await getCache<Brand>(cacheKey);

      if (cachedBrand) {
        return { brand: cachedBrand };
      }

      // Build where condition based on input type
      const where =
        typeof idOrSlug === 'number' ? { id: idOrSlug } : { slug: idOrSlug };

      const brand = await prisma.brand.findUnique({
        where,
      });

      if (!brand) {
        throw new Error('Бренд не знайдено');
      }

      // Cache for 30 minutes
      await setCache(cacheKey, brand, 1800);
      if (typeof idOrSlug === 'string') {
        await setCache(`brand:${brand.id}`, brand, 1800);
      }

      return { brand };
    } catch (error) {
      logger.error(`Failed to get brand: ${error}`);
      throw error;
    }
  },

  /**
   * Отримати бренд за slug
   */
  async getBrandBySlug(slug: string): Promise<{ brand: Brand }> {
    try {
      // Спробуємо отримати з кешу
      const cachedBrand = await getCache<Brand>(`brand:slug:${slug}`);
      if (cachedBrand) {
        return { brand: cachedBrand };
      }

      // Отримуємо з бази даних
      const brand = await prisma.brand.findUnique({
        where: { slug },
        include: {
          _count: {
            select: {
              listings: true,
            },
          },
        },
      });

      if (!brand) {
        throw new Error('Бренд не знайдено');
      }

      // Кешуємо результат на 10 хвилин
      await setCache(`brand:slug:${slug}`, brand, 600);
      await setCache(`brand:${brand.id}`, brand, 600);

      return { brand };
    } catch (error) {
      logger.error(`Помилка отримання бренду за slug: ${error}`);
      throw error;
    }
  },

  /**
   * Отримати всі бренди з фільтрацією
   */
  async getBrands(filters: BrandFilters = {}): Promise<{
    brands: Brand[];
    meta: { total: number; page: number; limit: number; pages: number };
  }> {
    try {
      const {
        search,
        active,
        popular,
        page = 1,
        limit = 200,
        sortBy = 'name',
        sortOrder = 'asc',
      } = filters;

      const skip = (page - 1) * limit;

      // Для запитів без фільтрів використовуємо кеш
      const isDefaultQuery =
        !search &&
        active === undefined &&
        popular === undefined &&
        page === 1 &&
        limit === 50;

      if (isDefaultQuery) {
        const cachedBrands = await getCache<any>('brands:all');
        if (cachedBrands) {
          return cachedBrands;
        }
      }

      // Будуємо умови фільтрації
      const where: Prisma.BrandWhereInput = {};

      if (active !== undefined) {
        where.active = active;
      }

      if (popular !== undefined) {
        where.popular = popular;
      }

      if (search) {
        where.OR = [
          {
            name: { contains: search, mode: 'insensitive' as Prisma.QueryMode },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive' as Prisma.QueryMode,
            },
          },
        ];
      }

      // Виконуємо запити до бази даних
      const [brands, total] = await Promise.all([
        prisma.brand.findMany({
          where,
          include: {
            _count: {
              select: {
                listings: true,
              },
            },
          },
          orderBy: {
            [sortBy]: sortOrder,
          },
          skip,
          take: limit,
        }),
        prisma.brand.count({ where }),
      ]);

      const result = {
        brands,
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };

      // Кешуємо результат запиту без фільтрів на 10 хвилин
      if (isDefaultQuery) {
        await setCache('brands:all', result, 600);
      }

      return result;
    } catch (error) {
      logger.error(`Помилка отримання брендів: ${error}`);
      throw error;
    }
  },

  async getAllBrands(): Promise<{ brands: Brand[] }> {
    try {
      // Спробувати отримати з кешу
      const cacheKey = 'brands:all:simple';
      const cachedBrands = await getCache<Brand[]>(cacheKey);

      if (cachedBrands) {
        return { brands: cachedBrands };
      }

      // Отримати з бази даних
      const brands = await prisma.brand.findMany({
        where: {
          active: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      // Кешувати на 30 хвилин
      await setCache(cacheKey, brands, 1800);

      return { brands };
    } catch (error) {
      logger.error(`Помилка отримання всіх брендів: ${error}`);
      throw error;
    }
  },
  async getPopularBrands(limit: number = 10): Promise<{ brands: Brand[] }> {
    try {
      // Try to get from cache
      const cacheKey = `brands:popular:${limit}`;
      const cachedBrands = await getCache<Brand[]>(cacheKey);

      if (cachedBrands) {
        return { brands: cachedBrands };
      }

      const brands = await prisma.brand.findMany({
        where: {
          active: true,
          popular: true,
        },
        orderBy: {
          name: 'asc',
        },
        take: limit,
      });

      // Cache for 30 minutes
      await setCache(cacheKey, brands, 1800);

      return { brands };
    } catch (error) {
      logger.error(`Failed to get popular brands: ${error}`);
      throw error;
    }
  },
};
