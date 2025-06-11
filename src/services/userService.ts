import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { config } from '../config/env';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../utils/emailSender';
import { logger } from '../utils/logger';
import type { User } from '@prisma/client';

interface RegisterData {
  email: string;
  password: string;
  name: string;
  phoneNumber?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface UpdateUserData {
  name?: string;
  phoneNumber?: string;
  avatar?: string;
}

export const userService = {
  async register(userData: {
    email: string;
    password: string;
    name: string;
    phoneNumber?: string;
  }): Promise<User> {
    try {
      // Перевірка, чи існує користувач з таким email
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUserByEmail) {
        throw new Error('User with this email already exists');
      }

      // Перевірка унікальності номера телефону (якщо він вказаний)
      if (userData.phoneNumber) {
        const existingUserByPhone = await prisma.user.findUnique({
          where: { phoneNumber: userData.phoneNumber },
        });

        if (existingUserByPhone) {
          throw new Error('User with this phone number already exists');
        }
      }

      // Хешування пароля
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(userData.password, salt);

      // Генерація токена верифікації
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Створення користувача з правильною обробкою phoneNumber
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          passwordHash,
          name: userData.name,
          // Встановлюємо phoneNumber тільки якщо він визначений і не порожній
          phoneNumber: userData.phoneNumber || null, // Важливо: використовуємо null замість undefined
          verificationToken,
        },
      });

      logger.info(`User registered: ${user.id}`);
      return user;
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  },
  // async register(data: RegisterData) {
  //   const { email, password, name, phoneNumber } = data;

  //   // Check if user exists
  //   const existingUser = await prisma.user.findUnique({
  //     where: { email },
  //   });

  //   if (existingUser) {
  //     throw new Error('User with this email already exists');
  //   }

  //   // Hash password
  //   const salt = await bcrypt.genSalt(10);
  //   const passwordHash = await bcrypt.hash(password, salt);

  //   // Generate verification token
  //   const verificationToken = crypto.randomBytes(32).toString('hex');

  //   // Create user
  //   const user = await prisma.user.create({
  //     data: {
  //       email,
  //       passwordHash,
  //       name,
  //       phoneNumber,
  //       verificationToken,
  //     },
  //   });

  //   // Send verification email
  //   await sendVerificationEmail(email, verificationToken);

  //   // Generate JWT token
  //   const token = jwt.sign(
  //     { userId: user.id, role: user.role },
  //     config.jwtSecret,
  //     { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' } as jwt.SignOptions
  //   );

  //   return {
  //     token,
  //     user: {
  //       id: user.id,
  //       email: user.email,
  //       name: user.name,
  //       role: user.role,
  //       isVerified: user.isVerified,
  //     },
  //   };
  // },

  async login(data: LoginData) {
    const { email, password } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' } as jwt.SignOptions
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  },

  async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new Error('Invalid verification token');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    return {
      message: 'Email successfully verified',
    };
  },

  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    return {
      message: 'Password reset email sent',
    };
  },

  async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return {
      message: 'Password successfully reset',
    };
  },

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
      },
    });

    return {
      message: 'Password successfully changed',
    };
  },

  async updateUser(userId: number, data: UpdateUserData) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phoneNumber: updatedUser.phoneNumber,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        isVerified: updatedUser.isVerified,
      },
    };
  },

  async getUserProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        avatar: true,
        role: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return { user };
  },

  /**
   * Оновлює роль користувача
   */
  async updateUserRole(
    userId: number,
    role: 'USER' | 'COMPANY' | 'ADMIN'
  ): Promise<import('@prisma/client').User> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      logger.info(`Updated role for user ${userId} to ${role}`);
      return user;
    } catch (error) {
      logger.error('Failed to update user role', { error, userId });
      throw error;
    }
  },

  /**
   * Перевіряє, чи має користувач профіль компанії
   */
  async hasCompanyProfile(userId: number): Promise<boolean> {
    try {
      const profile = await prisma.companyProfile.findUnique({
        where: { userId },
      });
      return !!profile;
    } catch (error) {
      logger.error('Failed to check if user has company profile', {
        error,
        userId,
      });
      throw error;
    }
  },

  /**
   * Призначення користувача модератором (тільки для адміністраторів)
   */
  async setUserAsModerator(userId: number): Promise<User> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: 'MODERATOR' },
      });

      logger.info(`User ${userId} has been set as moderator`);
      return user;
    } catch (error) {
      logger.error('Failed to set user as moderator', { error, userId });
      throw error;
    }
  },
};
