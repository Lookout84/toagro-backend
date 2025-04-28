import { Request, Response, NextFunction } from 'express';
import { categoryService } from '../services/categoryService';
import { logger } from '../utils/logger';

export const categoryController = {
  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, slug, description, image, parentId, active } = req.body;
      
      const result = await categoryService.createCategory({
        name,
        slug,
        description,
        image,
        parentId,
        active,
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
      const { name, slug, description, image, parentId, active } = req.body;
      
      const result = await categoryService.updateCategory(id, {
        name,
        slug,
        description,
        image,
        parentId,
        active,
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