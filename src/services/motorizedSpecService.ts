import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const motorizedSpecService = {
  async createMotorizedSpec(listingId: number, data: any) {
    return prisma.motorizedSpec.create({
      data: {
        ...data,
        listingId,
      },
    });
  },

  async updateMotorizedSpec(listingId: number, data: any) {
    return prisma.motorizedSpec.update({
      where: { listingId },
      data,
    });
  },

  async getMotorizedSpecByListing(listingId: number) {
    return prisma.motorizedSpec.findUnique({
      where: { listingId },
    });
  },

  async deleteMotorizedSpec(listingId: number) {
    return prisma.motorizedSpec.delete({
      where: { listingId },
    });
  },
};