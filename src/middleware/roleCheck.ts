import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Middleware для перевірки, чи є поточний користувач адміністратором
 * Використовує інформацію про користувача, додану в request middleware аутентифікації
 */
export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  // Перевіряємо, що користувач аутентифікований і що в об'єкт запиту додано властивість user
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      status: 'error',
      message: 'Користувач не аутентифікований',
    });
    return;
  }

  // Перевіряємо роль користувача
  if (user.role !== UserRole.ADMIN) {
    res.status(403).json({
      status: 'error',
      message: 'Доступ заборонено. Потрібні права адміністратора',
    });
    return;
  }

  // Якщо користувач є адміністратором, дозволяємо продовжити виконання запиту
  next();
};

/**
 * Загальна функція для перевірки ролей користувача
 * @param roles Масив ролей, які мають доступ
 */
export const hasRoles = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'Користувач не аутентифікований',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        status: 'error',
        message: 'Доступ заборонено. Недостатньо прав',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware для перевірки, чи є запит від власника ресурсу або адміністратора
 * @param getUserId Функція для отримання ID власника ресурсу
 */
export const isOwnerOrAdmin = (
  getUserId: (req: Request) => Promise<number | null> | number | null
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'Користувач не аутентифікований',
      });
      return;
    }

    // Адміністратор має доступ до всіх ресурсів
    if (user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Отримуємо ID власника ресурсу
    const ownerId = typeof getUserId === 'function' 
      ? await getUserId(req)
      : getUserId;

    // Перевіряємо, чи користувач є власником ресурсу
    if (ownerId !== null && user.id === ownerId) {
      next();
      return;
    }

    // Якщо не адмін і не власник - забороняємо доступ
    res.status(403).json({
      status: 'error',
      message: 'Доступ заборонено. Ви не є власником цього ресурсу',
    });
  };
};