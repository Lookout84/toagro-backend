import { createClient, type RedisClientType } from 'redis';
import { logger } from './logger';
import { env } from '../config/env';

// Типи для експорту
export type RedisClient = RedisClientType;
type RedisCommandResult = string | number | boolean | null;

// Конфігурація підключення
const redisConfig = {
  url: env.REDIS_URL,
  ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 5) {
        logger.error('Redis: Max retries reached');
        return new Error('Max retries reached');
      }
      return Math.min(retries * 500, 2000);
    }
  }
};

// Глобальний інстанс клієнта
let client: RedisClientType;
let isConnected = false;

// Ініціалізація Redis клієнта
const initializeRedis = (): RedisClientType => {
  if (!client) {
    client = createClient(redisConfig) as RedisClientType;

    client.on('connect', () => {
      isConnected = true;
      logger.info('Redis: Connected');
    });

    client.on('ready', () => {
      logger.info('Redis: Ready');
    });

    client.on('reconnecting', () => {
      logger.warn('Redis: Reconnecting...');
      isConnected = false;
    });

    client.on('error', (err) => {
      logger.error(`Redis Error: ${err.message}`);
      isConnected = false;
    });

    client.on('end', () => {
      logger.warn('Redis: Connection closed');
      isConnected = false;
    });
  }
  return client;
};

// Отримання активного підключення
export const getRedisClient = async (): Promise<RedisClientType> => {
  if (!client) initializeRedis();
  if (!isConnected) await client.connect();
  return client;
};

// Базові операції
export const redis = {
  // Збереження даних
  set: async (
    key: string,
    value: string | object,
    ttl?: number
  ): Promise<void> => {
    try {
      const client = await getRedisClient();
      const stringValue = typeof value === 'object' 
        ? JSON.stringify(value) 
        : value;
      
      const options = ttl ? { EX: ttl } : undefined;
      await client.set(key, stringValue, options);
    } catch (error) {
      logger.error('Redis SET error:', error);
      throw error;
    }
  },

  // Отримання даних
  get: async <T = RedisCommandResult>(key: string): Promise<T | null> => {
    try {
      const client = await getRedisClient();
      const value = await client.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error('Redis GET error:', error);
      throw error;
    }
  },

  // Видалення ключа
  del: async (key: string): Promise<number> => {
    try {
      const client = await getRedisClient();
      return client.del(key);
    } catch (error) {
      logger.error('Redis DEL error:', error);
      throw error;
    }
  },

  // Встановлення TTL
  expire: async (key: string, seconds: number): Promise<boolean> => {
    try {
      const client = await getRedisClient();
      return client.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      throw error;
    }
  },

  // Інкремент
  incr: async (key: string): Promise<number> => {
    try {
      const client = await getRedisClient();
      return client.incr(key);
    } catch (error) {
      logger.error('Redis INCR error:', error);
      throw error;
    }
  },

  // Паттерн Pub/Sub
  publish: async (channel: string, message: string): Promise<number> => {
    try {
      const client = await getRedisClient();
      return client.publish(channel, message);
    } catch (error) {
      logger.error('Redis PUBLISH error:', error);
      throw error;
    }
  },

  subscribe: async (
    channel: string,
    callback: (message: string) => void
  ): Promise<void> => {
    try {
      const client = await getRedisClient();
      const subscriber = client.duplicate();
      await subscriber.connect();
      
      subscriber.subscribe(channel, (message) => {
        callback(message);
      });

      return subscriber.unsubscribe(channel);
    } catch (error) {
      logger.error('Redis SUBSCRIBE error:', error);
      throw error;
    }
  },

  // Закриття з'єднання
  quit: async (): Promise<void> => {
    try {
      if (client && isConnected) {
        await client.quit();
        isConnected = false;
      }
    } catch (error) {
      logger.error('Redis QUIT error:', error);
      throw error;
    }
  },

  // Стан підключення
  status: () => isConnected ? 'connected' : 'disconnected'
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await redis.quit();
  process.exit(0);
});