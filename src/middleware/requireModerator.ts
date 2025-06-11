import { Request, Response, NextFunction } from 'express';

export const requireModerator = (req: Request, res: Response, next: NextFunction) => {
  // Перевірка, чи користувач є модератором або адміністратором
  const userRole = (req as any).user?.role;
  if (userRole !== 'MODERATOR' && userRole !== 'ADMIN') {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Moderator or admin role required.',
    });
  }
  next();
};