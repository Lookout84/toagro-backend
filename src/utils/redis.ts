import { createClient } from 'redis';
import { config } from '../config/env';
import { logger } from './logger';

// Create Redis client
const redisClient = createClient({ 
  url: config.redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff with max 30s
      return Math.min(retries * 500, 30000);
    }
  }
});

// Setup event handlers
redisClient.on('error', (err) => {
  logger.error(`Redis Error: ${err}`);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting');
});

// Connect function that won't try to connect if already connected
export const connectRedis = async (): Promise<boolean> => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    return true;
  } catch (error) {
    logger.error(`Redis connection error: ${error}`);
    return false;
  }
};

export const setCache = async (key: string, value: any, ttl?: number): Promise<boolean> => {
  try {
    // Check if connected
    if (!redisClient.isOpen) {
      logger.warn('Redis not connected, unable to set cache');
      return false;
    }
    
    const stringValue = JSON.stringify(value);
    if (ttl) {
      await redisClient.set(key, stringValue, { EX: ttl });
    } else {
      await redisClient.set(key, stringValue);
    }
    return true;
  } catch (error) {
    logger.error(`Redis set error: ${error}`);
    return false;
  }
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    // Check if connected
    if (!redisClient.isOpen) {
      logger.warn('Redis not connected, unable to get from cache');
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

export const deleteCache = async (key: string): Promise<boolean> => {
  try {
    // Check if connected
    if (!redisClient.isOpen) {
      logger.warn('Redis not connected, unable to delete from cache');
      return false;
    }
    
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error(`Redis delete error: ${error}`);
    return false;
  }
};

export { redisClient };


// import { createClient } from 'redis';
// import { config } from '../config/env';
// import { logger } from './logger';

// // Створюємо клієнт Redux
// const redisClient = createClient({ url: config.redisUrl });

// // Налаштовуємо обробники подій
// redisClient.on('error', (err) => {
//   logger.error(`Redis Error: ${err}`);
// });

// redisClient.on('connect', () => {
//   logger.info('Redis connected');
// });

// // Змінюємо функцію підключення, щоб вона не підключалася, якщо вже підключено
// export const connectRedis = async (): Promise<void> => {
//   try {
//     // Перевіряємо, чи вже підключено
//     if (!redisClient.isOpen) {
//       await redisClient.connect();
//     }
//   } catch (error) {
//     logger.error(`Redis connection error: ${error}`);
//   }
// };

// // НЕ підключаємося при імпорті, а дозволяємо основному додатку керувати підключенням
// // connectRedis();

// export const setCache = async (key: string, value: any, ttl?: number): Promise<void> => {
//   try {
//     // Перевіряємо, чи підключено
//     if (!redisClient.isOpen) {
//       return;
//     }
    
//     const stringValue = JSON.stringify(value);
//     if (ttl) {
//       await redisClient.set(key, stringValue, { EX: ttl });
//     } else {
//       await redisClient.set(key, stringValue);
//     }
//   } catch (error) {
//     logger.error(`Redis set error: ${error}`);
//   }
// };

// export const getCache = async <T>(key: string): Promise<T | null> => {
//   try {
//     // Перевіряємо, чи підключено
//     if (!redisClient.isOpen) {
//       return null;
//     }
    
//     const data = await redisClient.get(key);
//     if (!data) return null;
//     return JSON.parse(data) as T;
//   } catch (error) {
//     logger.error(`Redis get error: ${error}`);
//     return null;
//   }
// };

// export const deleteCache = async (key: string): Promise<void> => {
//   try {
//     // Перевіряємо, чи підключено
//     if (!redisClient.isOpen) {
//       return;
//     }
    
//     await redisClient.del(key);
//   } catch (error) {
//     logger.error(`Redis delete error: ${error}`);
//   }
// };

// export { redisClient };