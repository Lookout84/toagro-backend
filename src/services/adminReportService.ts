import { PrismaClient, ReportStatus } from '@prisma/client';

// Define ReportStatus enum manually if not exported by Prisma
// export enum ReportStatus {
//   PENDING = 'PENDING',
//   RESOLVED = 'RESOLVED',
//   REJECTED = 'REJECTED',
// }

const prisma = new PrismaClient();

export const adminReportService = {
  /**
   * Отримати всі скарги з фільтрацією та пагінацією
   */
  async getAllReports(options: {
    page?: number;
    limit?: number;
    status?: ReportStatus | string;
    search?: string;
  }) {
    const { page = 1, limit = 20, status, search } = options;
    const skip = (page - 1) * limit;

    const where: {
      status?: ReportStatus;
      OR?: Array<{ description?: any; reason?: any }>;
    } = {};

    if (
      status &&
      Object.values(ReportStatus).includes(status as ReportStatus)
    ) {
      where.status = status as ReportStatus;
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          listing: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.report.count({ where }),
    ]);

    return {
      reports,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  async getReportById(id: number) {
    return prisma.report.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        listing: { select: { id: true, title: true } },
      },
    });
  },

    async resolveReport(id: number, resolverId: number) {
  // Оновлюємо статус скарги на RESOLVED, зберігаємо хто і коли розв'язав (якщо такі поля є)
  return prisma.report.update({
    where: { id },
    data: {
      status: ReportStatus.RESOLVED,
      // Якщо у вашій моделі є ці поля:
      resolvedById: resolverId,
      resolvedAt: new Date(),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      listing: { select: { id: true, title: true } },
    },
  });
},
};
