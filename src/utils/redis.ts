import { createClient } from 'redis';
import { config } from '../config/env';
import { logger } from './logger';

const redisClient = createClient({ url: config.redisUrl });

redisClient.on('error', (err) => {
  logger.error(`Redis Error: ${err}`);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error(`Redis connection error: ${error}`);
  }
};

// Connect on import
connectRedis();

export const setCache = async (key: string, value: any, ttl?: number): Promise<void> => {
  try {
    const stringValue = JSON.stringify(value);
    if (ttl) {
      await redisClient.set(key, stringValue, { EX: ttl });
    } else {
      await redisClient.set(key, stringValue);
    }
  } catch (error) {
    logger.error(`Redis set error: ${error}`);
  }
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.error(`Redis get error: ${error}`);
    return null;
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Redis delete error: ${error}`);
  }
};

export { redisClient };