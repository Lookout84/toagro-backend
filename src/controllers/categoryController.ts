import { Request, Response, NextFunction } from 'express';
import { categoryService } from '../services/categoryService';
import { logger } from '../utils/logger';

export const categoryController = {
  /**
 * @swagger
 * /api/categories:
 *   get:
 *     tags:
 *       - Categories
 *     summary: Отримання списку категорій
 *     description: Повертає список категорій з можливістю фільтрації
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Фільтр за активними категоріями
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: integer
 *         description: Фільтр за батьківською категорією
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Пошук за назвою або описом
 *     responses:
 *       200:
 *         description: Успішне отримання списку категорій
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         $ref: '#/definitions/Category'
 */
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, slug, description, image, parentId, active, favorite } = req.body;
      
      const result = await categoryService.createCategory({
        name,
        slug,
        description,
        image,
        parentId,
        active,
        favorite,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Категорія успішно створена',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const { name, slug, description, image, parentId, active, favorite } = req.body;
      
      const result = await categoryService.updateCategory(id, {
        name,
        slug,
        description,
        image,
        parentId,
        active,
        favorite,
      });
      
      res.status(200).json({
        status: 'success',
        message: 'Категорія успішно оновлена',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const result = await categoryService.deleteCategory(id);
      
      res.status(200).json({
        status: 'success',
        message: 'Категорія успішно видалена',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const result = await categoryService.getCategory(id);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategoryBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const result = await categoryService.getCategoryBySlug(slug);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { active, parentId, search } = req.query;
      
      const result = await categoryService.getCategories({
        active: active ? active === 'true' : undefined,
        parentId: parentId ? parseInt(parentId as string) : undefined,
        search: search as string,
      });
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCategoryTree(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await categoryService.getCategoryTree();
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};