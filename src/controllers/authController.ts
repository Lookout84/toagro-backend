// import { Request, Response } from 'express';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import { prisma } from '../config/db';
// import { logger } from '../utils/logger';
// import { RegisterInput, LoginInput } from '../schemas/userSchema';
// import { redisClient } from '../utils/redis';

// const generateTokens = (userId: number) => {
//   const accessToken = jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET!, {
//     expiresIn: '15m',
//   });
//   const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET!, {
//     expiresIn: '7d',
//   });
//   return { accessToken, refreshToken };
// };

// export const register = async (req: Request<{}, {}, RegisterInput>, res: Response) => {
//   try {
//     const { email, password, role } = req.body;
//     const hashedPassword = await bcrypt.hash(password, 10);
    
//     const user = await prisma.user.create({
//       data: {
//         email,
//         password: hashedPassword,
//         role: role || 'BUYER',
//       },
//     });

//     res.status(201).json({ id: user.id, email: user.email });
//   } catch (error) {
//     logger.error('Registration error:', error);
//     res.status(500).json({ error: 'Registration failed' });
//   }
// };

// export const login = async (req: Request<{}, {}, LoginInput>, res: Response) => {
//   const { email, password } = req.body;
  
//   try {
//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user || !(await bcrypt.compare(password, user.password))) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }

//     const { accessToken, refreshToken } = generateTokens(user.id);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { refreshToken },
//     });

//     res.json({ accessToken, refreshToken });
//   } catch (error) {
//     logger.error('Login error:', error);
//     res.status(500).json({ error: 'Login failed' });
//   }
// };
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { redisClient } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import {
  RegisterInput,
  LoginInput,
  registerSchema,
  loginSchema,
} from '../schemas/userSchema';

const generateTokens = (userId: number) => {
  const accessToken = jwt.sign(
    { id: userId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { id: userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

export const register = async (
  req: Request<{}, {}, RegisterInput>,
  res: Response
) => {
  try {
    const { email, password, role } = req.body;

    // Перевірка на існуючого користувача
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Хешування паролю
    const hashedPassword = await bcrypt.hash(password, 12);

    // Створення користувача
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || 'BUYER',
      },
    });

    // Генерація токенів
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Збереження refresh токена в Redis
    await redisClient.setEx(
      `refresh:${user.id}`,
      60 * 60 * 24 * 7, // 7 днів
      refreshToken
    );

    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
};

export const login = async (
  req: Request<{}, {}, LoginInput>,
  res: Response
) => {
  try {
    const { email, password } = req.body;

    // Пошук користувача
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Перевірка паролю
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Генерація токенів
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Оновлення refresh токена в Redis
    await redisClient.setEx(
      `refresh:${user.id}`,
      60 * 60 * 24 * 7, // 7 днів
      refreshToken
    );

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Валідація токена
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    if (typeof decoded !== 'object' || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Перевірка в Redis
    const storedToken = await redisClient.get(`refresh:${decoded.id}`);
    if (refreshToken !== storedToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Генерація нових токенів
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.id);

    // Оновлення Redis
    await redisClient.setEx(
      `refresh:${decoded.id}`,
      60 * 60 * 24 * 7,
      newRefreshToken
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.sendStatus(204);

    // Видалення refresh токена
    await redisClient.del(`refresh:${userId}`);
    res.sendStatus(204);
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
};