import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const systemHealthService = {
  async getSystemHealth() {
    // Перевірка підключення до бази даних
    let dbStatus = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = 'down';
    }

    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      database: dbStatus,
      memory: process.memoryUsage(),
      platform: process.platform,
      env: process.env.NODE_ENV || 'development',
    };
  },
};