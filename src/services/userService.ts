import {
    Prisma,
    User,
    Role,
    RefreshToken,
  } from '@prisma/client';
  import { prisma } from '../config/db';
  import { redis } from '../utils/redis';
  import { logger } from '../utils/logger';
  import { env } from '../config/env';
  import bcrypt from 'bcryptjs';
  import crypto from 'crypto';
  import jwt from 'jsonwebtoken';
  import { 
    RegisterInput,
    LoginInput,
    UpdateProfileInput,
    ChangePasswordInput,
    ResetPasswordInput
  } from '../schemas/userSchema';
  import { EmailType, emailService } from '../utils/emailSender';
  
  const SALT_ROUNDS = 12;
  const CACHE_TTL = 60 * 60 * 2; // 2 години
  const BLACKLIST_TTL = 60 * 60 * 24 * 7; // 7 днів
  
  export class UserService {
    // ... (існуючі методи реєстрації, входу тощо)
  
    // ==================== Кешування профілів ====================
    async getUserProfile(userId: number): Promise<User | null> {
      const cacheKey = `user:${userId}`;
      
      try {
        // Спроба отримати з кешу
        const cachedUser = await redis.get(cacheKey);
        if (cachedUser) return JSON.parse(cachedUser);
  
        // Завантаження з бази
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { 
            listings: true,
            reviews: true,
            transactions: true
          }
        });
  
        if (!user) return null;
  
        // Збереження в кеш
        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(user));
        return user;
      } catch (error) {
        logger.error('Failed to get user profile:', error);
        throw error;
      }
    }
  
    private async invalidateUserCache(userId: number): Promise<void> {
      await redis.del(`user:${userId}`);
    }
  
    // ==================== Чорний список токенів ====================
    async addToBlacklist(token: string, expiresInSeconds: number): Promise<void> {
      await redis.setEx(`blacklist:${token}`, expiresInSeconds, '1');
    }
  
    async isTokenBlacklisted(token: string): Promise<boolean> {
      return (await redis.exists(`blacklist:${token}`)) === 1;
    }
  
    // ==================== Керування сесіями ====================
    async trackSession(userId: number, deviceId: string): Promise<void> {
      await redis.hSet(`sessions:${userId}`, deviceId, Date.now());
      await redis.expire(`sessions:${userId}`, BLACKLIST_TTL);
    }
  
    async getActiveSessions(userId: number): Promise<Record<string, number>> {
      return redis.hGetAll(`sessions:${userId}`);
    }
  
    async revokeSession(userId: number, deviceId: string): Promise<void> {
      await redis.hDel(`sessions:${userId}`, deviceId);
    }
  
    // ==================== Оновлені методи з інвалідацією кешу ====================
    async updateProfile(userId: number, data: UpdateProfileInput): Promise<User> {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          email: data.email,
          phone: data.phone,
          address: data.address
        }
      });
  
      await this.invalidateUserCache(userId);
      return updatedUser;
    }
  
    async changePassword(userId: number, data: ChangePasswordInput): Promise<void> {
      // ... (існуюча логіка)
      
      await this.invalidateUserCache(userId);
      await this.revokeAllSessions(userId);
    }
  
    // ==================== Додаткові методи ====================
    async logout(userId: number, refreshToken: string): Promise<void> {
      // Додати токен до чорного списку
      const decoded = jwt.decode(refreshToken);
      if (decoded && typeof decoded === 'object' && 'exp' in decoded) {
        const ttl = decoded.exp! - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.addToBlacklist(refreshToken, ttl);
        }
      }
  
      // Видалити refresh токен з БД
      await prisma.refreshToken.deleteMany({
        where: { userId, token: refreshToken }
      });
    }
  
    async revokeAllSessions(userId: number): Promise<void> {
      // Видалити всі сесії
      await redis.del(`sessions:${userId}`);
      
      // Додати всі активні токени до чорного списку
      const tokens = await prisma.refreshToken.findMany({ where: { userId } });
      await Promise.all(
        tokens.map(token => this.addToBlacklist(token.token, BLACKLIST_TTL))
      );
      
      // Видалити всі refresh токени
      await prisma.refreshToken.deleteMany({ where: { userId } });
    }
  
    // ==================== Перевірка токенів з урахуванням чорного списку ====================
    async validateRefreshToken(token: string): Promise<User> {
      if (await this.isTokenBlacklisted(token)) {
        throw new Error('Токен у чорному списку');
      }
  
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token },
        include: { user: true }
      });
  
      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new Error('Недійсний токен');
      }
  
      return storedToken.user;
    }
  }
  
  export const userService = new UserService();