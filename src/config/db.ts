// import { PrismaClient } from '@prisma/client';
// import { logger } from '../utils/logger';

// const prisma = new PrismaClient({
//   log: [
//     { emit: 'event', level: 'query' },
//     { emit: 'event', level: 'error' },
//     { emit: 'event', level: 'info' },
//     { emit: 'event', level: 'warn' },
//   ],
// });

// // Log queries in development mode
// if (process.env.NODE_ENV === 'development') {
//   prisma.$on('query', (e) => {
//     logger.debug(`Query: ${e.query}`);
//     logger.debug(`Duration: ${e.duration}ms`);
//   });
// }

// prisma.$on('error', (e) => {
//   logger.error(`Prisma Error: ${e.message}`);
// });

// export { prisma };

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

// Отримуємо типи для подій
type QueryEvent = Prisma.QueryEvent;
type LogEvent = Prisma.LogEvent;

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

// Налаштування логування
const setupPrismaLogging = () => {
  prisma.$on('query', (e: QueryEvent) => {
    logger.debug(`Prisma Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });

  prisma.$on('error', (e: LogEvent) => {
    logger.error(`Prisma Error: ${e.message}`);
  });

  prisma.$on('info', (e: LogEvent) => {
    logger.info(`Prisma Info: ${e.message}`);
  });

  prisma.$on('warn', (e: LogEvent) => {
    logger.warn(`Prisma Warning: ${e.message}`);
  });
};

// Ініціалізація з'єднання
const initializePrisma = async () => {
  try {
    await prisma.$connect();
    logger.info('Prisma Client successfully connected to the database');
    
    if (process.env.NODE_ENV === 'development') {
      setupPrismaLogging();
    }
  } catch (error) {
    logger.error('Failed to connect to the database:', error);
    process.exit(1);
  }
};

// Викликаємо ініціалізацію
initializePrisma().catch((e) => {
  logger.error('Prisma initialization error:', e);
});

// Обробка завершення процесу
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected');
});

export { prisma };