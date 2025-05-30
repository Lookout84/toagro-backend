import { Request, Response, NextFunction } from 'express';
import { motorizedSpecService } from '../services/motorizedSpecService';
import { motorizedSpecSchema } from '../schemas/motorizedSpecSchema';
import type { MotorizedSpec } from '@prisma/client';

export const motorizedSpecController = {
  async createOrUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      const data = req.body;

      // Валідація
      const parsed = motorizedSpecSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ status: 'error', errors: parsed.error.format() });
      }

      // Якщо вже існує — оновити, інакше створити
      const existing = await motorizedSpecService.getByListingId(listingId);
      // Import prisma client at the top of file
      const { prisma } = require('../lib/prisma');
      
      let result;
      if (existing) {
        result = await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient): Promise<MotorizedSpec | null> => {
          await motorizedSpecService.updateSpec(listingId, parsed.data, tx);
          return await motorizedSpecService.getByListingId(listingId);
        });
      } else {
        result = await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient): Promise<MotorizedSpec | null> => {
          await motorizedSpecService.createSpec(listingId, { ...parsed.data, listingId }, tx);
          return await motorizedSpecService.getByListingId(listingId);
        });
      }

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async getByListing(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      const result = await motorizedSpecService.getByListingId(listingId);
      if (!result) {
        return res.status(404).json({ status: 'error', message: 'Не знайдено' });
      }
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Number(req.params.listingId);
      const { prisma } = require('../lib/prisma');
      await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient): Promise<void> => {
        await motorizedSpecService.deleteSpec(listingId, tx);
      });
      res.status(200).json({ status: 'success', message: 'Видалено' });
    } catch (error) {
      next(error);
    }
  },

  // Новий метод для пошуку специфікацій за параметрами
  async searchMotorizedSpecs(req: Request, res: Response, next: NextFunction) {
    try {
      const { make, model, yearFrom, yearTo, enginePower, engineSize } = req.query;
      
      const filters: any = {};
      
      if (make) filters.make = String(make);
      if (model) filters.model = String(model);
      if (yearFrom) filters.yearFrom = Number(yearFrom);
      if (yearTo) filters.yearTo = Number(yearTo);
      if (enginePower) filters.enginePower = Number(enginePower);
      if (engineSize) filters.engineSize = Number(engineSize);
      
      const results = await motorizedSpecService.searchMotorizedSpecs(filters);
      
      res.status(200).json({ 
        status: 'success', 
        data: results,
        count: results.length
      });
    } catch (error) {
      next(error);
    }
  },

  // Метод для отримання статистики по специфікаціях
  async getMotorizedSpecsStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await motorizedSpecService.getMotorizedSpecsStats();
      
      res.status(200).json({ 
        status: 'success', 
        data: stats 
      });
    } catch (error) {
      next(error);
    }
  }
};

// import { Request, Response, NextFunction } from 'express';
// import { motorizedSpecService } from '../services/motorizedSpecService';
// import { motorizedSpecSchema } from '../schemas/motorizedSpecSchema';

// export const motorizedSpecController = {
//   async createOrUpdate(req: Request, res: Response, next: NextFunction) {
//     try {
//       const listingId = Number(req.params.listingId);
//       const data = req.body;

//       // Валідація
//       const parsed = motorizedSpecSchema.safeParse(data);
//       if (!parsed.success) {
//         return res.status(400).json({ status: 'error', errors: parsed.error.format() });
//       }

//       // Якщо вже існує — оновити, інакше створити
//       const existing = await motorizedSpecService.getByListingId(listingId);
//       let result;
//       if (existing) {
//         result = await motorizedSpecService.updateSpec(listingId, parsed.data, existing);
//       } else {
//         result = await motorizedSpecService.createMotorizedSpec(listingId, parsed.data);
//       }

//       res.status(200).json({ status: 'success', data: result });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async getByListing(req: Request, res: Response, next: NextFunction) {
//     try {
//       const listingId = Number(req.params.listingId);
//       const result = await motorizedSpecService.getMotorizedSpecByListing(listingId);
//       if (!result) {
//         return res.status(404).json({ status: 'error', message: 'Не знайдено' });
//       }
//       res.status(200).json({ status: 'success', data: result });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async delete(req: Request, res: Response, next: NextFunction) {
//     try {
//       const listingId = Number(req.params.listingId);
//       await motorizedSpecService.deleteMotorizedSpec(listingId);
//       res.status(200).json({ status: 'success', message: 'Видалено' });
//     } catch (error) {
//       next(error);
//     }
//   },
// };