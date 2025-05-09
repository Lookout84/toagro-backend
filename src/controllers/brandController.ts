import { Request, Response } from 'express';
import { brandService } from '../services/brandService';
// import { validateRequestBody } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const createBrandSchema = z.object({
  name: z.string().min(2, 'Назва бренду повинна містити мінімум 2 символи'),
  description: z.string().optional(),
  logo: z.string().optional(),
  active: z.boolean().optional(),
  popular: z.boolean().optional()
});

const updateBrandSchema = z.object({
  name: z.string().min(2, 'Назва бренду повинна містити мінімум 2 символи').optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
  active: z.boolean().optional(),
  popular: z.boolean().optional()
});

export const brandController = {
  async createBrand(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validationResult = createBrandSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: validationResult.error.errors
        });
        return;
      }

      const { brand } = await brandService.createBrand(validationResult.data);
      
      res.status(201).json({
        status: 'success',
        data: { brand }
      });
    } catch (error: any) {
      logger.error(`Create brand error: ${error.message}`);
      
      if (error.message.includes('вже існує')) {
        res.status(409).json({
          status: 'error',
          message: error.message
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося створити бренд'
        });
      }
    }
  },

  async updateBrand(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validationResult = updateBrandSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: validationResult.error.errors
        });
        return;
      }

      const { brand } = await brandService.updateBrand(Number(id), validationResult.data);
      
      res.status(200).json({
        status: 'success',
        data: { brand }
      });
    } catch (error: any) {
      logger.error(`Update brand error: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Бренд не знайдено'
        });
      } else if (error.message.includes('вже існує')) {
        res.status(409).json({
          status: 'error',
          message: error.message
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося оновити бренд'
        });
      }
    }
  },

  async deleteBrand(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await brandService.deleteBrand(Number(id));
      
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      logger.error(`Delete brand error: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Бренд не знайдено'
        });
      } else if (error.message.includes("неможливо видалити")) {
        res.status(400).json({
          status: 'error',
          message: error.message
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося видалити бренд'
        });
      }
    }
  },

  async getBrand(req: Request, res: Response): Promise<void> {
    try {
      const { idOrSlug } = req.params;
      
      // Determine if id is numeric or slug
      const param = /^\d+$/.test(idOrSlug) ? Number(idOrSlug) : idOrSlug;
      
      const { brand } = await brandService.getBrand(param);
      
      res.status(200).json({
        status: 'success',
        data: { brand }
      });
    } catch (error: any) {
      logger.error(`Get brand error: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Бренд не знайдено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося отримати бренд'
        });
      }
    }
  },

  async getBrands(req: Request, res: Response): Promise<void> {
    try {
      const {
        search,
        active,
        popular,
        page = '1',
        limit = '50',
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query;
      
      // Parse query parameters
      const filters = {
        search: search as string | undefined,
        active: active === 'true' ? true : active === 'false' ? false : undefined,
        popular: popular === 'true' ? true : popular === 'false' ? false : undefined,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sortBy: (sortBy as 'name' | 'createdAt'),
        sortOrder: (sortOrder as 'asc' | 'desc')
      };
      
      const result = await brandService.getBrands(filters);
      
      res.status(200).json({
        status: 'success',
        data: result
      });
    } catch (error: any) {
      logger.error(`Get brands error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список брендів'
      });
    }
  },

  async getPopularBrands(req: Request, res: Response): Promise<void> {
    try {
      const { limit = '10' } = req.query;
      const parsedLimit = parseInt(limit as string, 10);
      
      const { brands } = await brandService.getPopularBrands(parsedLimit);
      
      res.status(200).json({
        status: 'success',
        data: { brands }
      });
    } catch (error: any) {
      logger.error(`Get popular brands error: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список популярних брендів'
      });
    }
  }
};