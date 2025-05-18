import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const communityService = {
  /**
   * Отримати громаду за її ID
   */
  async getCommunityById(communityId: number) {
    return prisma.community.findUnique({
      where: { id: communityId },
      include: {
        region: true,
        locations: true,
      },
    });
  },

  /**
   * Отримати всі громади для конкретної області (regionId)
   */
  async getCommunitiesByRegion(regionId: number) {
    return prisma.community.findMany({
      where: { regionId },
      orderBy: { name: 'asc' },
      include: {
        region: true,
      },
    });
  },

  /**
   * Створити нову громаду
   */
  async createCommunity(regionId: number, name: string) {
    return prisma.community.create({
      data: {
        name,
        regionId,
      },
    });
  },
};