import { Router } from 'express';
import { prisma } from '../config/db';
import { redisClient } from '../utils/redis';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const healthcheck = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      services: {
        database: 'unknown',
        redis: 'unknown',
        api: 'up',
      }
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthcheck.services.database = 'up';
    } catch (error) {
      logger.error(`Database health check failed: ${error}`);
      healthcheck.services.database = 'down';
      healthcheck.status = 'error';
    }

    // Check Redis connection
    try {
      const isReady = redisClient.isReady;
      healthcheck.services.redis = isReady ? 'up' : 'down';
      if (!isReady) {
        healthcheck.status = 'error';
      }
    } catch (error) {
      logger.error(`Redis health check failed: ${error}`);
      healthcheck.services.redis = 'down';
      healthcheck.status = 'error';
    }

    const statusCode = healthcheck.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthcheck);
  } catch (error) {
    logger.error(`Health check failed: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
    });
  }
});

export default router;