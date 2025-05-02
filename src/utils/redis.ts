import { createClient } from 'redis';
import { config } from '../config/env';
import { logger } from './logger';

// Створюємо клієнт Redux
const redisClient = createClient({ url: config.redisUrl });

// Налаштовуємо обробники подій
redisClient.on('error', (err) => {
  logger.error(`Redis Error: ${err}`);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

// Змінюємо функцію підключення, щоб вона не підключалася, якщо вже підключено
export const connectRedis = async (): Promise<void> => {
  try {
    // Перевіряємо, чи вже підключено
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    logger.error(`Redis connection error: ${error}`);
  }
};

// НЕ підключаємося при імпорті, а дозволяємо основному додатку керувати підключенням
// connectRedis();

export const setCache = async (key: string, value: any, ttl?: number): Promise<void> => {
  try {
    // Перевіряємо, чи підключено
    if (!redisClient.isOpen) {
      return;
    }
    
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
    // Перевіряємо, чи підключено
    if (!redisClient.isOpen) {
      return null;
    }
    
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
    // Перевіряємо, чи підключено
    if (!redisClient.isOpen) {
      return;
    }
    
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Redis delete error: ${error}`);
  }
};

export { redisClient };