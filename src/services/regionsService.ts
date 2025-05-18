import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const regionsService = {
  /**
   * Отримати всі області (регіони)
   */
  async getRegions() {
    return prisma.region.findMany({
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Отримати всі громади для конкретної області (regionId)
   */
  async getCommunitiesByRegion(regionId: number) {
    return prisma.community.findMany({
      where: { regionId },
      orderBy: { name: 'asc' },
    });
  },
};