import { Request, Response, NextFunction } from 'express';
import { listingService } from '../services/listingService';
import { logger } from '../utils/logger';
import { createListingSchema } from '../schemas/listingSchema';

export const listingController = {
  /**
   * @swagger
   * /api/listings:
   *   post:
   *     tags:
   *       - Listings
   *     summary: Створення нового оголошення
   *     description: Створює нове оголошення для автентифікованого користувача
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/definitions/CreateListingRequest'
   *     responses:
   *       201:
   *         description: Оголошення успішно створено
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Оголошення успішно створено
   *                 data:
   *                   type: object
   *                   properties:
   *                     listing:
   *                       $ref: '#/definitions/Listing'
   *       400:
   *         description: Помилка валідації даних
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Error'
   *       401:
   *         description: Користувач не автентифікований
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Error'
   */
  // async createListing(req: Request, res: Response, next: NextFunction) {
  //   try {
  //     const userId = req.userId!;
  //     const { title, description, price, location, category, categoryId, images, brandId, brand } = req.body;

  //     // Remove brandId and brand if they're not defined in CreateListingData
  //     const result = await listingService.createListing({
  //       title,
  //       description,
  //       price,
  //       location,
  //       category,
  //       categoryId,
  //       images,
  //       userId,
  //       condition: 'USED',
  //       // Include these properties only if they're part of CreateListingData
  //       ...(brandId ? { brandId } : {}),
  //       ...(brand ? { brand } : {}),
  //     });

  //     res.status(201).json({
  //       status: 'success',
  //       message: 'Оголошення успішно створено',
  //       data: result,
  //     });
  //   } catch (error) {
  //     next(error);
  //   }
  // },

  async createListing(req: Request, res: Response): Promise<void> {
    try {
      // Перетворення типів даних перед валідацією
      const preprocessedData = {
        ...req.body,
        price: req.body.price ? Number(req.body.price) : undefined,
        categoryId: req.body.categoryId
          ? Number(req.body.categoryId)
          : undefined,
        brandId: req.body.brandId ? Number(req.body.brandId) : undefined,
        // Переконуємося, що images - це масив
        images: Array.isArray(req.body.images) ? req.body.images : [],
        // Переконуємося, що condition у нижньому регістрі
        condition: req.body.condition?.toLowerCase(),
      };

      // Валідація тіла запиту
      const validationResult = createListingSchema.safeParse(preprocessedData);
      if (!validationResult.success) {
        res.status(400).json({
          status: 'error',
          message: 'Помилка валідації',
          errors: validationResult.error.errors,
        });
        return;
      }

      // Отримуємо ID користувача з JWT токена
      const userId = (req as any).user.id;

      // Створюємо оголошення
      const { listing } = await listingService.createListing({
        ...validationResult.data,
        userId,
      });

      res.status(201).json({
        status: 'success',
        data: { listing },
      });
    } catch (error: any) {
      logger.error(`Помилка створення оголошення: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося створити оголошення',
      });
    }
  },

  async updateListing(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const {
        title,
        description,
        price,
        location,
        category,
        categoryId,
        active,
        images,
        brand,
        brandId,
      } = req.body;

      const result = await listingService.updateListing(id, {
        title,
        description,
        price,
        location,
        category,
        categoryId,
        active,
        images,
        condition: 'USED',
        ...(brandId ? { brandId } : {}),
        ...(brand ? { brand } : {}),
      });

      res.status(200).json({
        status: 'success',
        message: 'Оголошення успішно оновлено',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getListings(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        category,
        categoryId,
        brandId,
        brand,
        minPrice,
        maxPrice,
        location,
        search,
        condition,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await listingService.getListings({
        category: category as string,
        categoryId: categoryId ? parseInt(categoryId as string) : undefined,
        brandId: brandId ? parseInt(brandId as string) : undefined,
        brand: brand as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        location: location as string,
        search: search as string,
        condition:
          condition === 'NEW' || condition === 'USED' ? condition : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      });

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getListing(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const listing = await listingService.getListing(id);

      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено',
        });
      }

      res.status(200).json({
        status: 'success',
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteListing(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      await listingService.deleteListing(id);

      res.status(204).json({
        status: 'success',
        message: 'Оголошення успішно видалено',
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserListings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { page, limit } = req.query;

      const result = await listingService.getUserListings(
        userId,
        page ? parseInt(page as string) : undefined,
        limit ? parseInt(limit as string) : undefined
      );

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
