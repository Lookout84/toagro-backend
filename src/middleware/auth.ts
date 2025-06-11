import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

interface TokenPayload {
  userId: number;
  role: 'USER' | 'COMPANY' | 'ADMIN' | 'MODERATOR';
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      user?: {
        id: number;
        role: 'USER' | 'COMPANY' | 'ADMIN' | 'MODERATOR';
      };
    }
  }
}

/**
 * Middleware для автентифікації користувача
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Логуємо для діагностики
    logger.debug('Перевірка заголовків автентифікації');

    // Отримуємо токен
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(
        'Помилка автентифікації: Відсутній або некоректний заголовок'
      );
      return res.status(401).json({
        status: 'error',
        message: 'Користувач не автентифікований',
        details: 'Відсутній або некоректний заголовок авторизації',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      logger.warn(
        'Помилка автентифікації: Токен відсутній після префіксу Bearer'
      );
      return res.status(401).json({
        status: 'error',
        message: 'Користувач не автентифікований',
        details: 'Токен відсутній',
      });
    }

    // Перевіряємо токен
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as TokenPayload;

    // Перевіряємо чи існує користувач
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      logger.warn(
        `Користувач з ID ${decoded.userId} не знайдений в базі даних`
      );
      return res.status(401).json({
        status: 'error',
        message: 'Користувач не знайдений',
      });
    }

    // Додаємо інформацію про користувача до запиту
    (req as any).user = { id: user.id, role: user.role };
    req.userId = user.id;
    req.userRole = user.role;

    logger.debug(
      `Автентифікація успішна. UserId: ${user.id}, UserRole: ${user.role}`
    );
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Помилка автентифікації: Термін дії токена закінчився');
      return res.status(401).json({
        status: 'error',
        message: 'Термін дії сесії закінчився',
        details: 'Необхідно увійти в систему повторно',
      });
    }

    logger.error(`Помилка автентифікації: ${error.message}`);
    return res.status(401).json({
      status: 'error',
      message: 'Користувач не автентифікований',
      details: error.message,
    });
  }
};

/**
 * Middleware для перевірки ролі адміністратора
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.userRole !== 'ADMIN') {
    logger.warn(
      `Спроба доступу до адміністративного ресурсу користувачем з роллю ${req.userRole}`
    );
    return res.status(403).json({
      status: 'error',
      message: 'Доступ заборонено: необхідні права адміністратора',
    });
  }
  next();
};

/**
 * Middleware для перевірки ролі модератора
 */
export const isModerator = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.userRole !== 'MODERATOR' && req.userRole !== 'ADMIN') {
    logger.warn(
      `Спроба доступу до ресурсу модератора користувачем з роллю ${req.userRole}`
    );
    return res.status(403).json({
      status: 'error',
      message:
        'Доступ заборонено: необхідні права модератора або адміністратора',
    });
  }
  next();
};

/**
 * Middleware для перевірки ролі компанії
 */
export const isCompany = (req: Request, res: Response, next: NextFunction) => {
  if (req.userRole !== 'COMPANY' && req.userRole !== 'ADMIN') {
    logger.warn(
      `Спроба доступу до ресурсу компанії користувачем з роллю ${req.userRole}`
    );
    return res.status(403).json({
      status: 'error',
      message: 'Доступ заборонено: необхідні права компанії або адміністратора',
    });
  }
  next();
};

/**
 * Middleware для перевірки власника ресурсу або адміністратора
 */
export const isOwnerOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resourceId = parseInt(req.params.id);
    const resourceType = req.baseUrl.split('/').pop() || '';

    if (!resourceId || isNaN(resourceId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Некоректний ID ресурсу',
      });
    }

    // Адміністратор має доступ до будь-якого ресурсу
    if (req.userRole === 'ADMIN') {
      return next();
    }

    // Перевірка власності в залежності від типу ресурсу
    let isOwner = false;

    if (resourceType === 'listings') {
      const listing = await prisma.listing.findUnique({
        where: { id: resourceId },
        select: { userId: true },
      });
      isOwner = listing?.userId === req.userId;
    } else if (resourceType === 'messages') {
      const message = await prisma.message.findUnique({
        where: { id: resourceId },
        select: { senderId: true, receiverId: true },
      });
      isOwner =
        message?.senderId === req.userId || message?.receiverId === req.userId;
    } else if (resourceType === 'companies') {
      const company = await prisma.companyProfile.findUnique({
        where: { id: resourceId },
        select: { userId: true },
      });
      isOwner = company?.userId === req.userId;
    }

    if (!isOwner) {
      logger.warn(
        `Спроба доступу до ресурсу ${resourceType}/${resourceId} користувачем ${req.userId}, який не є власником`
      );
      return res.status(403).json({
        status: 'error',
        message: 'Доступ заборонено: ви не є власником цього ресурсу',
      });
    }

    next();
  } catch (error: any) {
    logger.error(`Помилка перевірки авторизації: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      message: 'Помилка перевірки авторизації',
    });
  }
};

/**
 * Middleware для перевірки власника або модератора, або адміністратора
 */
export const isOwnerOrModeratorOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resourceId = parseInt(req.params.id);
    const resourceType = req.baseUrl.split('/').pop() || '';

    if (!resourceId || isNaN(resourceId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Некоректний ID ресурсу',
      });
    }

    // Адміністратор або модератор має доступ до будь-якого ресурсу
    if (req.userRole === 'ADMIN' || req.userRole === 'MODERATOR') {
      return next();
    }

    // Перевірка власності в залежності від типу ресурсу
    let isOwner = false;

    if (resourceType === 'listings') {
      const listing = await prisma.listing.findUnique({
        where: { id: resourceId },
        select: { userId: true },
      });
      isOwner = listing?.userId === req.userId;
    } else if (resourceType === 'messages') {
      const message = await prisma.message.findUnique({
        where: { id: resourceId },
        select: { senderId: true, receiverId: true },
      });
      isOwner =
        message?.senderId === req.userId || message?.receiverId === req.userId;
    } else if (resourceType === 'companies') {
      const company = await prisma.companyProfile.findUnique({
        where: { id: resourceId },
        select: { userId: true },
      });
      isOwner = company?.userId === req.userId;
    }

    if (!isOwner) {
      logger.warn(
        `Спроба доступу до ресурсу ${resourceType}/${resourceId} користувачем ${req.userId}, який не є власником/модератором/адміністратором`
      );
      return res.status(403).json({
        status: 'error',
        message: 'Доступ заборонено: ви не маєте прав для цієї операції',
      });
    }

    next();
  } catch (error: any) {
    logger.error(`Помилка перевірки авторизації: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      message: 'Помилка перевірки авторизації',
    });
  }
};

/**
 * Загальна функція для перевірки ролі
 */
export const hasRole = (requiredRoles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.userRole;

    if (!userRole) {
      return res.status(401).json({
        status: 'error',
        message: 'Користувач не автентифікований',
      });
    }

    // Адміністратор має доступ до всього
    if (userRole === 'ADMIN') {
      return next();
    }

    // Перевіряємо, чи має користувач необхідну роль
    const roles = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];

    if (roles.includes(userRole)) {
      return next();
    }

    // Спеціальна обробка для модераторів
    if (
      userRole === 'MODERATOR' &&
      roles.some((role) => ['USER', 'COMPANY'].includes(role))
    ) {
      return next();
    }

    logger.warn(
      `Спроба доступу до захищеного ресурсу користувачем з роллю ${userRole}. Необхідні ролі: ${roles.join(', ')}`
    );
    return res.status(403).json({
      status: 'error',
      message: 'Доступ заборонено: у вас немає необхідних прав',
    });
  };
};

// Додаткові middleware для зручності
export const requireAdmin = hasRole('ADMIN');
export const requireModerator = hasRole(['MODERATOR', 'ADMIN']);
export const requireCompany = hasRole(['COMPANY', 'ADMIN']);

/**
 * Middleware для аутентифікації користувача (альтернативна назва)
 */
export const authenticateUser = authenticate;

/**
 * Middleware для перевірки прав модератора або адміністратора
 */
export const requireModeratorOrAdmin = requireModerator;







// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';
// import { config } from '../config/env';
// import { prisma } from '../config/db';
// import { logger } from '../utils/logger';

// interface TokenPayload {
//   userId: number;
//   role: string;
//   exp?: number; // JWT expiration timestamp (optional)
// }

// declare global {
//   namespace Express {
//     interface Request {
//       userId?: number;
//       userRole?: string;
//     }
//   }
// }

// // export const authenticate = async (
// //   req: Request,
// //   res: Response,
// //   next: NextFunction
// // ) => {
// //   try {
// //     const authHeader = req.headers.authorization;

// //     if (!authHeader || !authHeader.startsWith('Bearer ')) {
// //       return res.status(401).json({ message: 'Authentication required' });
// //     }

// //     const token = authHeader.split(' ')[1];
// //     const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

// //     // Check if user exists
// //     const user = await prisma.user.findUnique({
// //       where: { id: decoded.userId },
// //       select: { id: true, role: true }
// //     });

// //     if (!user) {
// //       return res.status(401).json({ message: 'User not found' });
// //     }

// //     // Add user info to request
// //     req.userId = user.id;
// //     req.userRole = user.role;

// //     next();
// //   } catch (error) {
// //     logger.error(`Authentication error: ${error}`);
// //     return res.status(401).json({ message: 'Invalid or expired token' });
// //   }
// // };

// export const authenticate = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     // Логуємо для діагностики
//     logger.debug('Перевірка заголовків автентифікації:');
//     logger.debug(JSON.stringify(req.headers));

//     // Отримуємо токен
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       logger.warn(
//         'Помилка автентифікації: Відсутній або некоректний заголовок'
//       );
//       return res.status(401).json({
//         status: 'error',
//         message: 'Користувач не автентифікований',
//         details: 'Відсутній або некоректний заголовок авторизації',
//       });
//     }

//     const token = authHeader.split(' ')[1];
//     if (!token) {
//       logger.warn(
//         'Помилка автентифікації: Токен відсутній після префіксу Bearer'
//       );
//       return res.status(401).json({
//         status: 'error',
//         message: 'Користувач не автентифікований',
//         details: 'Токен відсутній',
//       });
//     }

//     // Перевіряємо токен
//     // const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

//     // // Зберігаємо інформацію про користувача в запиті (декілька варіантів для сумісності)
//     // (req as any).user = {
//     //   id: decoded.userId,       // Додаємо id для доступу через req.user.id
//     //   userId: decoded.userId,   // Додаємо userId для доступу через req.user.userId
//     //   role: decoded.role
//     // };

//     const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
//       userId: number;
//       role: 'USER' | 'COMPANY' | 'ADMIN';
//     };

//     (req as any).user = { id: decoded.userId, role: decoded.role };
//     req.userId = decoded.userId;

//     // Встановлюємо також userId безпосередньо в req
//     req.userId = decoded.userId;
//     req.userRole = decoded.role;

//     logger.debug(
//       `Автентифікація успішна. UserId: ${decoded.userId}, UserRole: ${decoded.role}`
//     );
//     next();
//   } catch (error: any) {
//     if (error.name === 'TokenExpiredError') {
//       logger.warn('Помилка автентифікації: Термін дії токена закінчився');
//       return res.status(401).json({
//         status: 'error',
//         message: 'Термін дії сесії закінчився',
//         details: 'Необхідно увійти в систему повторно',
//       });
//     }

//     logger.error(`Помилка автентифікації: ${error.message}`);
//     return res.status(401).json({
//       status: 'error',
//       message: 'Користувач не автентифікований',
//       details: error.message,
//     });
//   }
// };
// // export const authenticate = async (
// //   req: Request,
// //   res: Response,
// //   next: NextFunction
// // ) => {
// //   try {
// //     // Логуємо для діагностики
// //     logger.debug('Перевірка заголовків автентифікації:');
// //     logger.debug(JSON.stringify(req.headers));

// //     // Отримуємо токен
// //     const authHeader = req.headers.authorization;

// //     if (!authHeader || !authHeader.startsWith('Bearer ')) {
// //       logger.warn(
// //         'Помилка автентифікації: Відсутній або некоректний заголовок'
// //       );
// //       return res.status(401).json({
// //         status: 'error',
// //         message: 'Користувач не автентифікований',
// //         details: 'Відсутній або некоректний заголовок авторизації',
// //       });
// //     }

// //     const token = authHeader.split(' ')[1];
// //     if (!token) {
// //       logger.warn(
// //         'Помилка автентифікації: Токен відсутній після префіксу Bearer'
// //       );
// //       return res.status(401).json({
// //         status: 'error',
// //         message: 'Користувач не автентифікований',
// //         details: 'Токен відсутній',
// //       });
// //     }
// //     // Перевіряємо токен
// //     const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

// //     // Зберігаємо інформацію про користувача в запиті
// //     (req as any).user = decoded;

// //     // Додаємо також userId для сумісності зі старим кодом
// //     (req as any).userId = decoded.userId;

// //     logger.debug(`Автентифікація успішна. UserId: ${decoded.userId}`);
// //     next();
// //   } catch (error: any) {
// //     if (error.name === 'TokenExpiredError') {
// //       logger.warn('Помилка автентифікації: Термін дії токена закінчився');
// //       return res.status(401).json({
// //         status: 'error',
// //         message: 'Термін дії сесії закінчився',
// //         details: 'Необхідно увійти в систему повторно',
// //       });
// //     }

// //     logger.error(`Помилка автентифікації: ${error.message}`);
// //     return res.status(401).json({
// //       status: 'error',
// //       message: 'Користувач не автентифікований',
// //       details: error.message,
// //     });
// //   }
// // };
// //     try {
// //       const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

// //       // Check if token is expired
// //       const currentTimestamp = Math.floor(Date.now() / 1000);
// //       if (decoded.exp && decoded.exp < currentTimestamp) {
// //         return res.status(401).json({
// //           status: 'error',
// //           message: 'Token expired',
// //         });
// //       }

// //       // Check if user exists
// //       const user = await prisma.user.findUnique({
// //         where: { id: decoded.userId },
// //         select: { id: true, role: true },
// //       });

// //       if (!user) {
// //         return res.status(401).json({
// //           status: 'error',
// //           message: 'User not found',
// //         });
// //       }

// //       // Add user info to request
// //       req.userId = user.id;
// //       req.userRole = user.role;

// //       next();
// //     } catch (jwtError) {
// //       return res.status(401).json({
// //         status: 'error',
// //         message: 'Invalid token',
// //       });
// //     }
// //   } catch (error) {
// //     logger.error(`Authentication error: ${error}`);
// //     return res.status(500).json({
// //       status: 'error',
// //       message: 'Authentication failed due to server error',
// //     });
// //   }
// // };

// export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
//   if (req.userRole !== 'ADMIN') {
//     return res
//       .status(403)
//       .json({ message: 'Access denied: Admin privileges required' });
//   }
//   next();
// };

// export const isOwnerOrAdmin = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const resourceId = parseInt(req.params.id);
//     const resourceType = req.baseUrl.split('/').pop() || '';

//     if (!resourceId || isNaN(resourceId)) {
//       return res.status(400).json({ message: 'Invalid resource ID' });
//     }

//     // Admin can access any resource
//     if (req.userRole === 'ADMIN') {
//       return next();
//     }

//     // Check ownership based on resource type
//     let isOwner = false;

//     if (resourceType === 'listings') {
//       const listing = await prisma.listing.findUnique({
//         where: { id: resourceId },
//         select: { userId: true },
//       });
//       isOwner = listing?.userId === req.userId;
//     } else if (resourceType === 'messages') {
//       const message = await prisma.message.findUnique({
//         where: { id: resourceId },
//         select: { senderId: true, receiverId: true },
//       });
//       isOwner =
//         message?.senderId === req.userId || message?.receiverId === req.userId;
//     }

//     if (!isOwner) {
//       return res
//         .status(403)
//         .json({ message: 'Access denied: You do not own this resource' });
//     }

//     next();
//   } catch (error) {
//     logger.error(`Authorization error: ${error}`);
//     return res.status(500).json({ message: 'Authorization check failed' });
//   }
// };
