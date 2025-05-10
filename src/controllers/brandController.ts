import { Request, Response } from 'express';
import { brandService } from '../services/brandService';
import { logger } from '../utils/logger';
import { 
  createBrandSchema, 
  updateBrandSchema,
  getBrandsQuerySchema,
  getPopularBrandsQuerySchema,
  getBrandParamSchema,
  brandIdParamSchema
} from '../schemas/brandSchema';

export const brandController = {
  async createBrand(req: Request, res: Response): Promise<void> {
    try {
      // Валідація тіла запиту з використанням схеми
      const validationResult = createBrandSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
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
      logger.error(`Помилка створення бренду: ${error.message}`);
      
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
      // Валідація параметра ID
      const paramsValidation = brandIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID бренду',
          errors: paramsValidation.error.errors
        });
        return;
      }
      
      // Валідація тіла запиту
      const bodyValidation = updateBrandSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: bodyValidation.error.errors
        });
        return;
      }

      // Ensure logo is undefined if null to match UpdateBrandData type
      const updateData = { ...bodyValidation.data, logo: bodyValidation.data.logo ?? undefined };
      const { brand } = await brandService.updateBrand(
        paramsValidation.data.id, 
        updateData
      );
      
      res.status(200).json({
        status: 'success',
        data: { brand }
      });
    } catch (error: any) {
      logger.error(`Помилка оновлення бренду: ${error.message}`);
      
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
      // Валідація параметра ID
      const paramsValidation = brandIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ID бренду',
          errors: paramsValidation.error.errors
        });
        return;
      }
      
      const result = await brandService.deleteBrand(paramsValidation.data.id);
      
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      logger.error(`Помилка видалення бренду: ${error.message}`);
      
      if (error.message.includes('не знайдено')) {
        res.status(404).json({
          status: 'error',
          message: 'Бренд не знайдено'
        });
      } else if (error.message.includes('неможливо видалити')) {
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
      // Валідація параметра idOrSlug
      const paramsValidation = getBrandParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректний ідентифікатор бренду',
          errors: paramsValidation.error.errors
        });
        return;
      }
      
      // Визначаємо, чи це числовий ID, чи slug
      const { idOrSlug } = paramsValidation.data;
      const param = /^\d+$/.test(idOrSlug) ? Number(idOrSlug) : idOrSlug;
      
      const { brand } = await brandService.getBrand(param);
      
      res.status(200).json({
        status: 'success',
        data: { brand }
      });
    } catch (error: any) {
      logger.error(`Помилка отримання бренду: ${error.message}`);
      
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
      // Валідація параметрів запиту
      const queryValidation = getBrandsQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.errors
        });
        return;
      }
      
      const filters = queryValidation.data;
      const result = await brandService.getBrands(filters);
      
      res.status(200).json({
        status: 'success',
        data: result
      });
    } catch (error: any) {
      logger.error(`Помилка отримання списку брендів: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список брендів'
      });
    }
  },

  async getPopularBrands(req: Request, res: Response): Promise<void> {
    try {
      // Валідація параметрів запиту
      const queryValidation = getPopularBrandsQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          status: 'error',
          message: 'Некоректні параметри запиту',
          errors: queryValidation.error.errors
        });
        return;
      }
      
      const { limit } = queryValidation.data;
      const { brands } = await brandService.getPopularBrands(limit);
      
      res.status(200).json({
        status: 'success',
        data: { brands }
      });
    } catch (error: any) {
      logger.error(`Помилка отримання популярних брендів: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список популярних брендів'
      });
    }
  }
};