import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Сервіс для роботи з технічними характеристиками моторизованої техніки
 */
class MotorizedSpecService {
  /**
   * Створює новий запис технічних характеристик для оголошення
   */
  async createMotorizedSpec(
    listingId: number,
    data: Prisma.MotorizedSpecUncheckedCreateInput
  ) {
    try {
      const result = await prisma.motorizedSpec.create({
        data: {
          ...data,
          listingId,
        },
      });
      logger.info(`Created motorized spec for listing ID: ${listingId}`);
      return result;
    } catch (error) {
      logger.error('Failed to create motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Створює новий запис технічних характеристик для оголошення в транзакції
   */
  async createSpec(
    listingId: number,
    data: Prisma.MotorizedSpecUncheckedCreateInput,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.create({
        data: {
          ...data,
          listingId,
        },
      });
      logger.info(`Created motorized spec for listing ID: ${listingId}`);
    } catch (error) {
      logger.error('Failed to create motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Оновлює існуючий запис технічних характеристик
   */
  async updateMotorizedSpec(
    listingId: number,
    data: Prisma.MotorizedSpecUpdateInput
  ) {
    try {
      const result = await prisma.motorizedSpec.update({
        where: { listingId },
        data,
      });
      logger.info(`Updated motorized spec for listing ID: ${listingId}`);
      return result;
    } catch (error) {
      logger.error('Failed to update motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Оновлює існуючий запис технічних характеристик в транзакції
   */
  async updateSpec(
    listingId: number,
    data: Prisma.MotorizedSpecUpdateInput,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.update({
        where: { listingId },
        data,
      });
      logger.info(`Updated motorized spec for listing ID: ${listingId}`);
    } catch (error) {
      logger.error('Failed to update motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Створює або оновлює запис технічних характеристик (upsert)
   */
  async upsertSpec(
    listingId: number,
    data: Prisma.MotorizedSpecUncheckedCreateInput,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.upsert({
        where: { listingId },
        create: {
          ...data,
          listingId,
        },
        update: data,
      });
      logger.info(`Upserted motorized spec for listing ID: ${listingId}`);
    } catch (error) {
      logger.error('Failed to upsert motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Отримує технічні характеристики за ID оголошення
   */
  async getMotorizedSpecByListing(listingId: number) {
    try {
      const result = await prisma.motorizedSpec.findUnique({
        where: { listingId },
      });
      return result;
    } catch (error) {
      logger.error('Failed to get motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Отримує технічні характеристики за ID оголошення (в транзакції)
   */
  async getByListingId(
    listingId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Prisma.MotorizedSpecGetPayload<{}> | null> {
    try {
      const client = tx || prisma;
      return await client.motorizedSpec.findUnique({
        where: { listingId },
      });
    } catch (error) {
      logger.error('Failed to get motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Видаляє запис технічних характеристик
   */
  async deleteMotorizedSpec(listingId: number) {
    try {
      const result = await prisma.motorizedSpec.delete({
        where: { listingId },
      });
      logger.info(`Deleted motorized spec for listing ID: ${listingId}`);
      return result;
    } catch (error) {
      logger.error('Failed to delete motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Видаляє запис технічних характеристик в транзакції
   */
  async deleteSpec(
    listingId: number,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    try {
      await tx.motorizedSpec.delete({
        where: { listingId },
      });
      logger.info(`Deleted motorized spec for listing ID: ${listingId}`);
    } catch (error) {
      logger.error('Failed to delete motorized spec', { error, listingId });
      throw error;
    }
  }

  /**
   * Пошук технічних характеристик за фільтрами
   */
  async searchMotorizedSpecs(filters: any) {
    try {
      const where: any = {};
      
      if (filters.make) where.make = filters.make;
      if (filters.model) where.model = filters.model;
      if (filters.yearFrom || filters.yearTo) {
        where.year = {};
        if (filters.yearFrom) where.year.gte = Number(filters.yearFrom);
        if (filters.yearTo) where.year.lte = Number(filters.yearTo);
      }
      if (filters.enginePower) where.enginePower = Number(filters.enginePower);
      if (filters.engineSize) where.engineSize = Number(filters.engineSize);
      
      const results = await prisma.motorizedSpec.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              price: true,
              currency: true,
              images: true,
              createdAt: true,
              active: true,
              favorites: true,
            }
          }
        }
      });
      
      logger.info(`Found ${results.length} motorized specs matching filters`);
      return results;
    } catch (error) {
      logger.error('Failed to search motorized specs', { error, filters });
      throw error;
    }
  }

  /**
   * Отримує статистику по технічним характеристикам моторизованої техніки
   */
  async getMotorizedSpecsStats() {
    try {
      const makeStats = await prisma.motorizedSpec.groupBy({
        by: [Prisma.MotorizedSpecScalarFieldEnum.model],
        _count: true,
        orderBy: {
          _count: {
            model: 'desc'
          }
        },
        take: 10
      });
      
      const yearStats = await prisma.motorizedSpec.groupBy({
        by: ['year'],
        _count: true,
        orderBy: {
          year: 'desc'
        }
      });
      
      const total = await prisma.motorizedSpec.count();
      
      logger.info('Retrieved motorized specs statistics');
      return {
        makes: makeStats,
        years: yearStats,
        total
      };
    } catch (error) {
      logger.error('Failed to get motorized specs statistics', { error });
      throw error;
    }
  }
}

export const motorizedSpecService = new MotorizedSpecService();

// import { PrismaClient, Prisma } from '@prisma/client';
// import { logger } from '../utils/logger';

// const prisma = new PrismaClient();

// /**
//  * Сервіс для роботи з технічними характеристиками моторизованої техніки
//  */
// class MotorizedSpecService {
//   /**
//    * Створює новий запис технічних характеристик для оголошення
//    */
//   async createSpec(
//     listingId: number,
//     data: Prisma.MotorizedSpecUncheckedCreateInput,
//     tx: Prisma.TransactionClient
//   ): Promise<void> {
//     try {
//       await tx.motorizedSpec.create({
//         data: {
//           ...data,
//           listingId,
//         },
//       });
//       logger.info(`Created motorized spec for listing ID: ${listingId}`);
//     } catch (error) {
//       logger.error('Failed to create motorized spec', { error, listingId });
//       throw error;
//     }
//   }

//   /**
//    * Оновлює існуючий запис технічних характеристик
//    */
//   async updateSpec(
//     listingId: number,
//     data: Prisma.MotorizedSpecUpdateInput,
//     tx: Prisma.TransactionClient
//   ): Promise<void> {
//     try {
//       await tx.motorizedSpec.update({
//         where: { listingId },
//         data,
//       });
//       logger.info(`Updated motorized spec for listing ID: ${listingId}`);
//     } catch (error) {
//       logger.error('Failed to update motorized spec', { error, listingId });
//       throw error;
//     }
//   }

//   /**
//    * Створює або оновлює запис технічних характеристик (upsert)
//    */
//   async upsertSpec(
//     listingId: number,
//     data: Prisma.MotorizedSpecUncheckedCreateInput,
//     tx: Prisma.TransactionClient
//   ): Promise<void> {
//     try {
//       await tx.motorizedSpec.upsert({
//         where: { listingId },
//         create: {
//           ...data,
//           listingId,
//         },
//         update: data,
//       });
//       logger.info(`Upserted motorized spec for listing ID: ${listingId}`);
//     } catch (error) {
//       logger.error('Failed to upsert motorized spec', { error, listingId });
//       throw error;
//     }
//   }

//   /**
//    * Отримує технічні характеристики за ID оголошення
//    */
//   async getByListingId(
//     listingId: number,
//     tx?: Prisma.TransactionClient
//   ): Promise<Prisma.MotorizedSpecGetPayload<{}> | null> {
//     try {
//       const client = tx || prisma;
//       return await client.motorizedSpec.findUnique({
//         where: { listingId },
//       });
//     } catch (error) {
//       logger.error('Failed to get motorized spec', { error, listingId });
//       throw error;
//     }
//   }

//   /**
//    * Видаляє запис технічних характеристик
//    */
//   async deleteSpec(
//     listingId: number,
//     tx: Prisma.TransactionClient
//   ): Promise<void> {
//     try {
//       await tx.motorizedSpec.delete({
//         where: { listingId },
//       });
//       logger.info(`Deleted motorized spec for listing ID: ${listingId}`);
//     } catch (error) {
//       logger.error('Failed to delete motorized spec', { error, listingId });
//       throw error;
//     }
//   }

// async searchMotorizedSpecs(filters: any) {
//   const where: any = {};
  
//   if (filters.make) where.make = filters.make;
//   if (filters.model) where.model = filters.model;
//   if (filters.yearFrom || filters.yearTo) {
//     where.year = {};
//     if (filters.yearFrom) where.year.gte = filters.yearFrom;
//     if (filters.yearTo) where.year.lte = filters.yearTo;
//   }
//   if (filters.enginePower) where.enginePower = filters.enginePower;
//   if (filters.engineSize) where.engineSize = filters.engineSize;
  
//     return await prisma.motorizedSpec.findMany({
//       where,
//       include: {
//         listing: {
//           select: {
//             id: true,
//             title: true,
//             price: true,
//             currency: true,
//             images: true,
//             createdAt: true,
//           }
//         }
//       }
//     });
//   },
// }
//     async getMotorizedSpecsStats() {
//   const makeStats = await prisma.motorizedSpec.groupBy({
//     by: ['make'],
//     _count: true,
//     orderBy: {
//       _count: {
//         make: 'desc'
//       }
//     },
//     take: 10
//   });
  
//   const yearStats = await prisma.motorizedSpec.groupBy({
//     by: ['year'],
//     _count: true,
//     orderBy: {
//       year: 'desc'
//     }
//   });
  
//   return {
//     makes: makeStats,
//     years: yearStats,
//     total: await prisma.motorizedSpec.count()
//   };
// }
// export const motorizedSpecService = new MotorizedSpecService();

// // import { PrismaClient } from '@prisma/client';

// // const prisma = new PrismaClient();

// // export const motorizedSpecService = {
// //   async createMotorizedSpec(listingId: number, data: any) {
// //     return prisma.motorizedSpec.create({
// //       data: {
// //         ...data,
// //         listingId,
// //       },
// //     });
// //   },

// //   async updateMotorizedSpec(listingId: number, data: any) {
// //     return prisma.motorizedSpec.update({
// //       where: { listingId },
// //       data,
// //     });
// //   },

// //   async getMotorizedSpecByListing(listingId: number) {
// //     return prisma.motorizedSpec.findUnique({
// //       where: { listingId },
// //     });
// //   },

// //   async deleteMotorizedSpec(listingId: number) {
// //     return prisma.motorizedSpec.delete({
// //       where: { listingId },
// //     });
// //   },
// // };/** * Пошук технічних характеристик за фільтрами