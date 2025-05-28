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
}

export const motorizedSpecService = new MotorizedSpecService();

// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// export const motorizedSpecService = {
//   async createMotorizedSpec(listingId: number, data: any) {
//     return prisma.motorizedSpec.create({
//       data: {
//         ...data,
//         listingId,
//       },
//     });
//   },

//   async updateMotorizedSpec(listingId: number, data: any) {
//     return prisma.motorizedSpec.update({
//       where: { listingId },
//       data,
//     });
//   },

//   async getMotorizedSpecByListing(listingId: number) {
//     return prisma.motorizedSpec.findUnique({
//       where: { listingId },
//     });
//   },

//   async deleteMotorizedSpec(listingId: number) {
//     return prisma.motorizedSpec.delete({
//       where: { listingId },
//     });
//   },
// };