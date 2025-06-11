import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export const adminCompanyService = {
  async getAllCompanies(options: {
    page?: number;
    limit?: number;
    search?: string;
    isVerified?: boolean;
  }) {
    const { page = 1, limit = 10, search, isVerified } = options;
    const skip = (page - 1) * limit;
    const where: Prisma.CompanyProfileWhereInput = {};

    if (typeof isVerified !== 'undefined') {
      where.isVerified = isVerified;
    }
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { companyCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.companyProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.companyProfile.count({ where }),
    ]);

    return {
      companies,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  async getCompanyById(id: number) {
    return prisma.companyProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async getCompanyProfileByUser(userId: number) {
    return prisma.companyProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            isVerified: true,
          },
        },
      },
    });
  },

  async verifyCompany(id: number) {
    return prisma.companyProfile.update({
      where: { id },
      data: { isVerified: true },
    });
  },
   async verifyDocument(documentId: number) {
    // Оновлюємо статус документа на "VERIFIED"
    return prisma.companyDocument.update({
      where: { id: documentId },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });
  },
};
