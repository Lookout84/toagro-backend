import { categoryService } from '../../../services/categoryService';
import { prisma } from '../../../config/db';

// Mock dependencies
jest.mock('../../../config/db', () => ({
  prisma: {
    category: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../../utils/redis', () => ({
  setCache: jest.fn(),
  getCache: jest.fn(),
  deleteCache: jest.fn(),
}));

describe('CategoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    const categoryData = {
      name: 'Test Category',
      slug: 'test-category',
      description: 'Test description',
    };

    const mockCategory = {
      id: 1,
      name: 'Test Category',
      slug: 'test-category',
      description: 'Test description',
      image: null,
      parentId: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully create a new category', async () => {
      // Mock category doesn't exist
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
      
      // Mock category creation
      (prisma.category.create as jest.Mock).mockResolvedValue(mockCategory);

      const result = await categoryService.createCategory(categoryData);

      // Verify dependencies were called correctly
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: categoryData.name },
            { slug: categoryData.slug },
          ],
        },
      });
      
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: categoryData,
      });

      // Verify result structure
      expect(result).toHaveProperty('category');
      expect(result.category).toHaveProperty('id', mockCategory.id);
      expect(result.category).toHaveProperty('name', mockCategory.name);
      expect(result.category).toHaveProperty('slug', mockCategory.slug);
    });

    it('should throw error if category already exists', async () => {
      // Mock category already exists
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(mockCategory);

      await expect(categoryService.createCategory(categoryData)).rejects.toThrow(
        'Категорія з такою назвою або slug вже існує'
      );
    });

    it('should throw error if parent category not found', async () => {
      // Mock category doesn't exist
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
      
      // Mock parent category doesn't exist
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(categoryService.createCategory({
        ...categoryData,
        parentId: 999,
      })).rejects.toThrow(
        'Батьківська категорія не знайдена'
      );
    });
  });

  describe('getCategories', () => {
    const mockCategories = [
      {
        id: 1,
        name: 'Category 1',
        slug: 'category-1',
        description: 'Description 1',
        parentId: null,
        active: true,
        parent: null,
        _count: {
          children: 2,
          listings: 5,
        },
      },
      {
        id: 2,
        name: 'Category 2',
        slug: 'category-2',
        description: 'Description 2',
        parentId: 1,
        active: true,
        parent: {
          id: 1,
          name: 'Category 1',
          slug: 'category-1',
        },
        _count: {
          children: 0,
          listings: 3,
        },
      },
    ];

    it('should return all categories', async () => {
      // Mock getCache returns null (no cache)
      require('../../../utils/redis').getCache.mockResolvedValue(null);
      
      // Mock findMany returns categories
      (prisma.category.findMany as jest.Mock).mockResolvedValue(mockCategories);

      const result = await categoryService.getCategories();

      // Verify dependencies were called correctly
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {},
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

      // Verify result structure
      expect(result).toHaveProperty('categories');
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0]).toHaveProperty('id', mockCategories[0].id);
      expect(result.categories[1]).toHaveProperty('id', mockCategories[1].id);
    });

    it('should return filtered categories', async () => {
      // Mock findMany returns filtered categories
      (prisma.category.findMany as jest.Mock).mockResolvedValue([mockCategories[0]]);

      const result = await categoryService.getCategories({
        active: true,
        parentId: null,
      });

      // Verify dependencies were called correctly
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: {
          active: true,
          parentId: null,
        },
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

      // Verify result structure
      expect(result).toHaveProperty('categories');
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]).toHaveProperty('id', mockCategories[0].id);
    });
  });

  // Add more tests for other methods...
});