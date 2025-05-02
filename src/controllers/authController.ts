import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';

export const authController = {
  /**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Реєстрація нового користувача
 *     description: Створює нового користувача з вказаними даними та повертає JWT токен
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/definitions/RegisterRequest'
 *     responses:
 *       201:
 *         description: Користувача успішно зареєстровано
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Registration successful. Please verify your email.
 *                 data:
 *                   $ref: '#/definitions/AuthResponse'
 *       400:
 *         description: Помилка валідації даних
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 *       409:
 *         description: Користувач з такою електронною поштою вже існує
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, phoneNumber } = req.body;
      const result = await userService.register({
        email,
        password,
        name,
        phoneNumber,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Registration successful. Please verify your email.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Вхід користувача
 *     description: Автентифікує користувача за електронною поштою та паролем
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/definitions/LoginRequest'
 *     responses:
 *       200:
 *         description: Успішний вхід
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   $ref: '#/definitions/AuthResponse'
 *       401:
 *         description: Невірні облікові дані
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await userService.login({ email, password });
      
      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const result = await userService.verifyEmail(token);
      
      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      const result = await userService.requestPasswordReset(email);
      
      res.status(200).json({
        status: 'success',
        message: 'Password reset email sent',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const { password } = req.body;
      const result = await userService.resetPassword(token, password);
      
      res.status(200).json({
        status: 'success',
        message: 'Password reset successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { currentPassword, newPassword } = req.body;
      const result = await userService.changePassword(
        userId,
        currentPassword,
        newPassword
      );
      
      res.status(200).json({
        status: 'success',
        message: 'Password changed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const result = await userService.getUserProfile(userId);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { name, phoneNumber, avatar } = req.body;
      const result = await userService.updateUser(userId, {
        name,
        phoneNumber,
        avatar,
      });
      
      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};

