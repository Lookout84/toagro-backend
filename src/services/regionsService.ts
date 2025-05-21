import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const regionsService = {
  /**
   * Отримати всі області (регіони) з країною
   */
  async getRegions(countryId?: number) {
    return prisma.region.findMany({
      where: countryId ? { countryId } : undefined,
      include: {
        country: true,
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Отримати регіон за ID
   */
  async getRegionById(id: number) {
    return prisma.region.findUnique({
      where: { id },
      include: {
        country: true,
        communities: true,
      },
    });
  },
};