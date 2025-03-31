import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redis } from '../utils/redis';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Конфігурація лімітів
const RATE_LIMIT = {
  AUTHENTICATED: {
    points: 100,     // 100 запитів
    duration: 15 * 60, // за 15 хвилин
  },
  ANONYMOUS: {
    points: 50,      // 50 запитів
    duration: 15 * 60,
  }
};

// Ініціалізація обмежень
const rateLimiterAuthenticated = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_auth',
  ...RATE_LIMIT.AUTHENTICATED,
});

const rateLimiterAnonymous = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_anon',
  ...RATE_LIMIT.ANONYMOUS,
});

export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const limiter = req.user?.id 
      ? rateLimiterAuthenticated
      : rateLimiterAnonymous;

    const key = req.user?.id 
      ? `user_${req.user.id}` 
      : `ip_${req.ip}`;

    const rateLimit = await limiter.get(key);
    const headers = {
      'Retry-After': rateLimit?.msBeforeNext ? Math.ceil(rateLimit.msBeforeNext / 1000) : 0,
      'X-RateLimit-Limit': limiter.points,
      'X-RateLimit-Remaining': rateLimit?.remainingPoints ?? limiter.points,
      'X-RateLimit-Reset': new Date(Date.now() + (rateLimit?.msBeforeNext ?? 0)).toISOString()
    };

    try {
      await limiter.consume(key);
      res.set(headers);
      next();
    } catch (rateLimitError) {
      res.set(headers);
      res.status(429).json({
        error: 'Забагато запитів. Спробуйте пізніше',
        retryAfter: headers['Retry-After']
      });
    }
  } catch (error) {
    logger.error('Rate limiter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Додатковий мідлвар для жорсткіших обмежень на конкретні маршрути
export const strictRateLimiter = (points: number, duration: number) => {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl_strict',
    points,
    duration
  }).middleware({
    key: (req) => req.user?.id ? `user_${req.user.id}` : `ip_${req.ip}`,
    message: 'Занадто частий доступ. Спробуйте через {retryAfter} секунд'
  });
};

export const apiLimiter = rateLimiter({
    redisClient: redis,
    key: (req) => req.ip || 'anonymous', // Ліміт по IP або токену
    windowMs: 15 * 60 * 1000, // 15 хвилин
    max: {
      authenticated: 100, // Для автентифікованих
      anonymous: 50       // Для анонімних
    }
  });
  
  // Використання в маршрутах:
//   router.get('/listings', apiLimiter, searchListings);