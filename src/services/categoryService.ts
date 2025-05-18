import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { setCache, getCache, deleteCache } from '../utils/redis';
import { Prisma } from '@prisma/client';

interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parentId?: number;
  active?: boolean;
  favorite?: boolean;
  isMotorized?: boolean;
}

interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string;
  image?: string;
  parentId?: number;
  active?: boolean;
  favorite?: boolean;
  isMotorized?: boolean;
}

interface CategoryFilters {
  active?: boolean;
  parentId?: number | null;
  search?: string;
  isMotorized?: boolean;
}

interface CategoryTreeNode {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  _count: {
    listings: number;
  };
  children: CategoryTreeNode[];
}

interface CategoryTreeResult {
  categoryTree: CategoryTreeNode[];
}

export const categoryService = {
  async createCategory(data: CreateCategoryData) {
    if (data.parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: data.parentId },
      });

      if (!parentCategory) {
        throw new Error('Батьківська категорія не знайдена');
      }
    }

    const existingCategory = await prisma.category.findFirst({
      where: {
        OR: [
          { name: data.name },
          { slug: data.slug },
        ],
      },
    });

    if (existingCategory) {
      throw new Error('Категорія з такою назвою або slug вже існує');
    }

    const category = await prisma.category.create({
      data,
    });

    await deleteCache('categories:all');
    return { category };
  },

  async updateCategory(id: number, data: UpdateCategoryData) {
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new Error('Категорія не знайдена');
    }

    if (data.parentId === id) {
      throw new Error('Категорія не може бути батьківською для самої себе');
    }

    if (data.parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: data.parentId },
      });

      if (!parentCategory) {
        throw new Error('Батьківська категорія не знайдена');
      }
    }

    if (data.slug) {
      const categoryWithSlug = await prisma.category.findFirst({
        where: {
          slug: data.slug,
          id: { not: id },
        },
      });

      if (categoryWithSlug) {
        throw new Error('Категорія з таким slug вже існує');
      }
    }

    if (data.name) {
      const categoryWithName = await prisma.category.findFirst({
        where: {
          name: data.name,
          id: { not: id },
        },
      });

      if (categoryWithName) {
        throw new Error('Категорія з такою назвою вже існує');
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data,
    });

    await deleteCache('categories:all');
    await deleteCache(`category:${id}`);
    return { category };
  },

  async deleteCategory(id: number) {
    const existingCategory = await prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        listings: true,
      },
    });

    if (!existingCategory) {
      throw new Error('Категорія не знайдена');
    }

    if (existingCategory.children.length > 0) {
      throw new Error('Неможливо видалити категорію, яка має дочірні категорії');
    }

    if (existingCategory.listings.length > 0) {
      throw new Error('Неможливо видалити категорію, яка містить оголошення');
    }

    await prisma.category.delete({
      where: { id },
    });

    await deleteCache('categories:all');
    await deleteCache(`category:${id}`);
    return { message: 'Категорія успішно видалена' };
  },

  async getCategory(id: number) {
    const cachedCategory = await getCache<any>(`category:${id}`);
    if (cachedCategory) {
      return { category: cachedCategory };
    }

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            listings: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Категорія не знайдена');
    }

    await setCache(`category:${id}`, category, 600);
    return { category };
  },

  async getCategoryBySlug(slug: string) {
    const cachedCategory = await getCache<any>(`category:slug:${slug}`);
    if (cachedCategory) {
      return { category: cachedCategory };
    }

    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            listings: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Категорія не знайдена');
    }

    await setCache(`category:slug:${slug}`, category, 600);
    return { category };
  },

  async getCategories(filters: CategoryFilters = {}) {
    const { active, parentId, search, isMotorized } = filters;

    // Для запитів без фільтрів використовуємо кеш
    if (
      active === undefined &&
      parentId === undefined &&
      search === undefined &&
      isMotorized === undefined
    ) {
      const cachedCategories = await getCache<any>('categories:all');
      if (cachedCategories) {
        return cachedCategories;
      }
    }

    // Будуємо умови фільтрації
    const where: Prisma.CategoryWhereInput = {};

    if (active !== undefined) {
      where.active = active;
    }

    if (parentId !== undefined) {
      where.parentId = parentId;
    }

    if (isMotorized !== undefined) {
      where.isMotorized = isMotorized;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as Prisma.QueryMode } },
        { description: { contains: search, mode: 'insensitive' as Prisma.QueryMode } },
      ];
    }

    const categories = await prisma.category.findMany({
      where,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            children: true,
            listings: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const result = { categories };

    if (
      active === undefined &&
      parentId === undefined &&
      search === undefined &&
      isMotorized === undefined
    ) {
      await setCache('categories:all', result, 600);
    }

    return result;
  },

  async getCategoryTree(): Promise<CategoryTreeResult> {
    const cachedTree = await getCache<CategoryTreeResult>('categories:tree');
    if (cachedTree) {
      return cachedTree;
    }

    const allCategories = await prisma.category.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        isMotorized: true,
        _count: {
          select: {
            listings: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const categoryMap = new Map<number, CategoryTreeNode & { isMotorized: boolean }>();
    allCategories.forEach(category => {
      categoryMap.set(category.id, {
        ...category,
        children: [],
      });
    });

    const rootCategories: (CategoryTreeNode & { isMotorized: boolean })[] = [];
    allCategories.forEach(category => {
      if (category.parentId === null) {
        rootCategories.push(categoryMap.get(category.id)!);
      } else {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryMap.get(category.id)!);
        }
      }
    });

    const result: CategoryTreeResult = { categoryTree: rootCategories };

    await setCache('categories:tree', result, 1800);
    return result;
  },
};