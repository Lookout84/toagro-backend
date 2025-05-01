import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import net from 'net'; // Додано для перевірки доступності порту
import { config } from './config/env';
import { setupSocket } from './sockets/chatSocket';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rabbitmq } from './utils/rabbitmq';
import { redisClient } from './utils/redis';
import { notificationService } from './services/notificationService';
import { scheduledTaskService } from './services/scheduledTaskService';
import { bulkNotificationService } from './services/bulkNotificationService';
import { interServiceCommunication, RequestType } from './services/interServiceCommunication';
import { prisma } from './config/db';

// Import routes
import authRoutes from './routes/auth';
import listingsRoutes from './routes/listings';
import chatRoutes from './routes/chat';
import transactionsRoutes from './routes/transactions';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';
import categoryRoutes from './routes/categories';
import notificationRoutes from './routes/notifications';
import queueRoutes from './routes/queues';
import campaignRoutes from './routes/campaigns';

// Функція для перевірки доступності порту
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Порт зайнятий
        resolve(false);
      } else {
        // Інша помилка
        logger.error(`Error checking port ${port}: ${err.message}`);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      // Порт вільний, закриваємо тестовий сервер
      server.close(() => resolve(true));
    });
    
    server.listen(port);
  });
};

// Функція для пошуку вільного порту
const findAvailablePort = async (startPort: number, maxAttempts: number = 10): Promise<number> => {
  let port = startPort;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    if (await isPortAvailable(port)) {
      return port;
    }
    
    logger.warn(`Port ${port} is already in use, trying port ${port + 1}`);
    port++;
    attempts++;
  }
  
  throw new Error(`Could not find available port after ${maxAttempts} attempts`);
};

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ToAgro API',
      version: '1.0.0',
      description: 'API documentation for ToAgro agricultural marketplace',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

// Initialize express app
const app: Express = express();
const httpServer = createServer(app);

// Додаємо обробник помилок для сервера
httpServer.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use. Trying to find an alternative port.`);
    // Не завершуємо процес, оскільки startServer буде шукати новий порт
  } else {
    logger.error(`Server error: ${error.message}`);
    process.exit(1);
  }
});

// Socket.io singleton instance
let io: Server | null = null;

const initializeSocketIO = () => {
  if (!io) {
    io = new Server(httpServer, {
      cors: {
        origin: config.corsOrigin || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
      },
      pingTimeout: 60000,
    });
    setupSocket(io);
    logger.info('Socket.io initialized');
  }
  return io;
};

// Initialize all services
const initializeServices = async () => {
  try {
    // Connect to Redis
    try {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      // Продовжуємо без Redis, якщо не вдалося підключитися
    }

    // Connect to RabbitMQ
    try {
      await rabbitmq.connect();
      logger.info('RabbitMQ connected successfully');

      // Initialize message queues
      await notificationService.initializeNotifications();
      await scheduledTaskService.initializeScheduledTasks();
      await bulkNotificationService.initializeBulkNotifications();
      logger.info('RabbitMQ queues initialized');

      // Initialize inter-service communication
      await interServiceCommunication.initialize();
      
      // Set up request handlers for inter-service communication
      await setupInterServiceHandlers();
      
      logger.info('Inter-service communication handlers set up');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      // Продовжуємо без RabbitMQ, якщо не вдалося підключитися
    }

    // Setup Swagger documentation
    if (config.nodeEnv !== 'production') {
      try {
        const specs = swaggerJsdoc(swaggerOptions);
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
        logger.info(`Swagger docs available at http://localhost:${config.port}/api-docs`);
      } catch (error) {
        logger.error('Failed to setup Swagger:', error);
        // Продовжуємо без Swagger, якщо не вдалося налаштувати
      }
    }

    // Initialize Socket.io
    initializeSocketIO();
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
};

// Налаштування обробників міжсервісної комунікації
const setupInterServiceHandlers = async () => {
  await interServiceCommunication.handleRequests(
    RequestType.GET_USER_INFO,
    async (payload) => {
      const { userId } = payload;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isVerified: true,
          createdAt: true,
        },
      });
      
      if (!user) {
        throw new Error('User not found');
      }
      
      return user;
    }
  );
  
  await interServiceCommunication.handleRequests(
    RequestType.GET_LISTING_INFO,
    async (payload) => {
      const { listingId } = payload;
      
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          categoryRel: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
      
      if (!listing) {
        throw new Error('Listing not found');
      }
      
      return listing;
    }
  );
  
  await interServiceCommunication.handleRequests(
    RequestType.CHECK_PAYMENT_STATUS,
    async (payload) => {
      const { transactionId } = payload;
      
      const payment = await prisma.payment.findUnique({
        where: { transactionId },
        select: {
          id: true,
          userId: true,
          amount: true,
          currency: true,
          status: true,
          transactionId: true,
          createdAt: true,
          completedAt: true,
        },
      });
      
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      return payment;
    }
  );
};

// Graceful shutdown handler
const shutdown = async () => {
  try {
    logger.info('Starting graceful shutdown...');
    
    await Promise.allSettled([
      prisma.$disconnect(),
      (async () => {
        try {
          if (redisClient.isOpen) {
            await redisClient.disconnect();
          }
        } catch (error) {
          logger.error('Error disconnecting Redis:', error);
        }
      })(),
      (async () => {
        try {
          await rabbitmq.close();
        } catch (error) {
          logger.error('Error closing RabbitMQ connection:', error);
        }
      })(),
      new Promise<void>((resolve) => {
        if (io) {
          io.close(() => {
            logger.info('Socket.io server closed');
            resolve();
          });
        } else {
          resolve();
        }
      }),
      new Promise<void>((resolve) => {
        httpServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      }),
    ]);

    logger.info('All connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Middleware setup
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin || '*',
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/campaigns', campaignRoutes);

// Error handling
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Перевіряємо доступність порту перед запуском сервера
    const availablePort = await findAvailablePort(config.port);
    
    if (availablePort !== config.port) {
      logger.warn(`Original port ${config.port} is not available, using port ${availablePort} instead`);
      config.port = availablePort;
      
      // Оновлюємо URL серверів у Swagger
      swaggerOptions.definition.servers[0].url = `http://localhost:${config.port}`;
    }
    
    await initializeServices();
    
    // Налаштування для повторного використання адреси
    const serverOptions = {
      host: config.host || '0.0.0.0',
      port: config.port,
      exclusive: false, // Дозволяє кільком серверам спільно використовувати порт
    };
    
    httpServer.listen(serverOptions, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
      logger.info(`CORS configured for: ${config.corsOrigin || '*'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Run the server
startServer();

export { app };