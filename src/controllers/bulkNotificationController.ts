import { Request, Response, NextFunction } from 'express';
import {
  bulkNotificationService,
  UserFilter,
} from '../services/bulkNotificationService';
import { NotificationPriority } from '../services/notificationService';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';

export const bulkNotificationController = {
  /**
   * Відправка масової email розсилки
   */
  async sendBulkEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        subject,
        content,
        userFilter,
        templateName,
        templateVariables,
        priority,
      } = req.body;

      const taskId = await bulkNotificationService.enqueueBulkEmailNotification(
        subject,
        content,
        userFilter,
        {
          templateName,
          templateVariables,
          senderId: req.userId,
          priority: priority || NotificationPriority.NORMAL,
        }
      );

      res.status(200).json({
        status: 'success',
        message: 'Масову email розсилку поставлено в чергу',
        data: {
          taskId,
          status: 'pending',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Відправка масової SMS розсилки
   */
  async sendBulkSms(req: Request, res: Response, next: NextFunction) {
    try {
      const { content, userFilter, priority } = req.body;

      const taskId = await bulkNotificationService.enqueueBulkSmsNotification(
        content,
        userFilter,
        {
          senderId: req.userId,
          priority: priority || NotificationPriority.NORMAL,
        }
      );

      res.status(200).json({
        status: 'success',
        message: 'Масову SMS розсилку поставлено в чергу',
        data: {
          taskId,
          status: 'pending',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Відправка масової Push розсилки
   */
  async sendBulkPush(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, content, userFilter, priority } = req.body;

      const taskId = await bulkNotificationService.enqueueBulkPushNotification(
        title,
        content,
        userFilter,
        {
          senderId: req.userId,
          priority: priority || NotificationPriority.NORMAL,
        }
      );

      res.status(200).json({
        status: 'success',
        message: 'Масову Push розсилку поставлено в чергу',
        data: {
          taskId,
          status: 'pending',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання списку завдань на масові розсилки
   */
  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      // У реальному проекті тут має бути код для отримання завдань
      // з бази даних. Для прикладу, повертаємо тестові дані.

      res.status(200).json({
        status: 'success',
        data: {
          tasks: [
            {
              id: 'bulk_12345',
              type: 'email',
              subject: 'Новини ToAgro',
              status: 'completed',
              totalSent: 1250,
              totalFailed: 12,
              startedAt: new Date(Date.now() - 60000).toISOString(),
              completedAt: new Date().toISOString(),
            },
            {
              id: 'bulk_67890',
              type: 'sms',
              status: 'processing',
              totalSent: 450,
              totalFailed: 5,
              startedAt: new Date().toISOString(),
            },
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання статусу завдання на масову розсилку
   */
  async getTaskStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id;

      // Отримуємо статус завдання
      const taskStatus = await bulkNotificationService.getTaskStatus(taskId);

      if (!taskStatus) {
        return res.status(404).json({
          status: 'error',
          message: 'Завдання не знайдено',
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          task: taskStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Скасування завдання на масову розсилку
   */
  async cancelTask(req: Request, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id;

      // Скасовуємо завдання
      const success = await bulkNotificationService.cancelTask(taskId);

      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Завдання успішно скасовано',
        });
      } else {
        res.status(404).json({
          status: 'error',
          message:
            'Не вдалося скасувати завдання. Можливо, воно вже виконано або не існує.',
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання списку активних завдань
   */
  async getActiveJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const activeJobs = bulkNotificationService.getActiveJobs();

      res.status(200).json({
        status: 'success',
        data: {
          activeJobs,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Попередній перегляд користувачів за фільтром
   */
  async previewFilteredUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const userFilter: UserFilter = req.body.filter;

      // У реальному проекті тут має бути код для отримання користувачів
      // за фільтром з бази даних. Для прикладу, генеруємо тестові дані.

      // Симулюємо виконання фільтрації
      const usersCount = 1250;
      const users = [];

      // Генеруємо трохи тестових даних для попереднього перегляду
      for (let i = 1; i <= 5; i++) {
        users.push({
          id: i,
          email: `user${i}@example.com`,
          name: `User ${i}`,
          phoneNumber: `+38050123456${i}`,
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          totalCount: usersCount,
          previewUsers: users,
          filter: userFilter,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
