import { PrismaClient } from '@prisma/client';
import { createClient, type RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import { env } from './env';

// Singleton instance для Prisma Client
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Ініціалізація Redis клієнта
let redisClient: RedisClientType;
let isRedisConnected = false;

// Конфігурація підключення Redis
const redisConfig = {
  url: env.REDIS_URL,
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 5) {
        logger.error('Redis connection retries exceeded');
        return new Error('Max retries reached');
      }
      return Math.min(retries * 500, 2000);
    },
  },
};

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') globalThis.prisma = prisma;

// Функція підключення до Redis
export const connectRedis = async (): Promise<RedisClientType> => {
  if (!redisClient) {
    redisClient = createClient(redisConfig);

    redisClient.on('connect', () => {
      isRedisConnected = true;
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err);
      isRedisConnected = false;
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
      isRedisConnected = false;
    });
  }

  if (!isRedisConnected) {
    await redisClient.connect();
  }
  
  return redisClient;
};

// Функція підключення до Prisma
export const connectPrisma = async () => {
  try {
    await prisma.$connect();
    logger.info('Prisma connected to PostgreSQL');
  } catch (error) {
    logger.error('Prisma connection error:', error);
    process.exit(1);
  }
};

// Health check для баз даних
export const dbHealthCheck = async () => {
  const results = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redisClient?.ping(),
  ]);

  return {
    postgres: results[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    redis: results[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
  };
};

// Типи для імпорту
export type RedisClient = typeof redisClient;
export type PrismaClient = typeof prisma;

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await redisClient?.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await redisClient?.quit();
  process.exit(0);
});