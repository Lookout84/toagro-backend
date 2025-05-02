import { Request, Response, NextFunction } from 'express';
import { listingService } from '../services/listingService';
import { logger } from '../utils/logger';

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
  async createListing(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { title, description, price, location, category, categoryId, images } = req.body;
      
      const result = await listingService.createListing({
        title,
        description,
        price,
        location,
        category,
        categoryId,
        images,
        userId,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Оголошення успішно створено',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateListing(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const { title, description, price, location, category, categoryId, active, images } = req.body;
      
      const result = await listingService.updateListing(id, {
        title,
        description,
        price,
        location,
        category,
        categoryId,
        active,
        images,
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
        minPrice,
        maxPrice,
        location,
        search,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;
      
      const result = await listingService.getListings({
        category: category as string,
        categoryId: categoryId ? parseInt(categoryId as string) : undefined,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        location: location as string,
        search: search as string,
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
          message: 'Оголошення не знайдено'
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
        message: 'Оголошення успішно видалено'
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