import { Request, Response, NextFunction } from 'express';
import { 
  notificationService, 
  NotificationType,
  NotificationPriority 
} from '../services/notificationService';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';

export const notificationController = {
  /**
   * Відправка тестового email
   */
  /**
 * @swagger
 * /api/notifications/test-email:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Відправка тестового email
 *     description: Відправляє тестовий email автентифікованому користувачу
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Тестовий email успішно відправлено
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
 *                   example: Тестовий email успішно відправлено
 *       401:
 *         description: Користувач не автентифікований
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 *       404:
 *         description: Користувача не знайдено або відсутня електронна пошта
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async sendTestEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      
      // Отримуємо користувача
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true }
      });
      
      if (!user || !user.email) {
        return res.status(404).json({
          status: 'error',
          message: 'Користувача не знайдено або відсутня електронна пошта'
        });
      }
      
      // Відправляємо тестовий email
      const success = await notificationService.sendEmailNotification({
        userId,
        email: user.email,
        subject: 'Тестове сповіщення',
        content: `
          <h1>Привіт, ${user.name || 'користувач'}!</h1>
          <p>Це тестове сповіщення з ToAgro.</p>
          <p>Час відправки: ${new Date().toLocaleString()}</p>
        `
      });
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Тестовий email успішно відправлено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося відправити тестовий email'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Відправка тестового SMS
   */
  async sendTestSms(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      
      // Отримуємо користувача
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { phoneNumber: true, name: true }
      });
      
      if (!user || !user.phoneNumber) {
        return res.status(404).json({
          status: 'error',
          message: 'Користувача не знайдено або відсутній номер телефону'
        });
      }
      
      // Відправляємо тестове SMS
      const success = await notificationService.sendSmsNotification({
        userId,
        phoneNumber: user.phoneNumber,
        content: `ToAgro: Привіт, ${user.name || 'користувач'}! Це тестове SMS сповіщення.`
      });
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Тестове SMS успішно відправлено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося відправити тестове SMS'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Відправка тестового Push-сповіщення
   */
  async sendTestPush(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { deviceToken } = req.body;
      
      if (!deviceToken) {
        return res.status(400).json({
          status: 'error',
          message: 'Не вказано токен пристрою'
        });
      }
      
      // Отримуємо користувача
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true }
      });
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'Користувача не знайдено'
        });
      }
      
      // Відправляємо тестове Push-сповіщення
      const success = await notificationService.sendPushNotification({
        userId,
        deviceToken,
        title: 'Тестове сповіщення',
        content: `Привіт, ${user.name || 'користувач'}! Це тестове Push-сповіщення.`
      });
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Тестове Push-сповіщення успішно відправлено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося відправити тестове Push-сповіщення'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання налаштувань сповіщень користувача
   */
  async getUserSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      
      // У реальному проекті тут має бути код для отримання налаштувань
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          settings: {
            email: true,
            sms: false,
            push: true,
            newsletterSubscribed: true,
            marketingSubscribed: false
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Оновлення налаштувань сповіщень користувача
   */
  async updateUserSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const settings = req.body.settings;
      
      // У реальному проекті тут має бути код для оновлення налаштувань
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Updating notification settings for user ${userId}: ${JSON.stringify(settings)}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Налаштування сповіщень успішно оновлено',
        data: { settings }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання користувацьких налаштувань сповіщень
   */
  async getUserPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      
      // У реальному проекті тут має бути код для отримання налаштувань
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          preferences: {
            newListings: true,
            newMessages: true,
            paymentReminders: true,
            listingUpdates: false,
            dailyDigest: false
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Оновлення користувацьких налаштувань сповіщень
   */
  async updateUserPreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const preferences = req.body.preferences;
      
      // У реальному проекті тут має бути код для оновлення налаштувань
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Updating notification preferences for user ${userId}: ${JSON.stringify(preferences)}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Налаштування сповіщень успішно оновлено',
        data: { preferences }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання історії сповіщень
   */
  /**
 * @swagger
 * /api/notifications/history:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Отримання історії сповіщень
 *     description: Повертає історію сповіщень автентифікованого користувача
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер сторінки для пагінації
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Кількість елементів на сторінці
 *     responses:
 *       200:
 *         description: Успішне отримання історії сповіщень
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/definitions/Notification'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *       401:
 *         description: Користувач не автентифікований
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
  async getNotificationHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      
      // У реальному проекті тут має бути код для отримання історії
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          notifications: [
            {
              id: 1,
              type: 'email',
              title: 'Ласкаво просимо до ToAgro',
              content: 'Дякуємо за реєстрацію в нашому сервісі!',
              createdAt: new Date().toISOString(),
              read: true
            },
            {
              id: 2,
              type: 'push',
              title: 'Нове повідомлення',
              content: 'Ви отримали нове повідомлення від користувача Test User',
              createdAt: new Date().toISOString(),
              read: false
            }
          ],
          meta: {
            page,
            limit,
            total: 2,
            totalPages: 1
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання деталей сповіщення
   */
  async getNotificationDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const notificationId = parseInt(req.params.id);
      
      // У реальному проекті тут має бути код для отримання сповіщення
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          notification: {
            id: notificationId,
            type: 'email',
            title: 'Ласкаво просимо до ToAgro',
            content: 'Дякуємо за реєстрацію в нашому сервісі!',
            createdAt: new Date().toISOString(),
            read: true,
            metadata: {
              sender: 'system',
              priority: 'normal'
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Видалення сповіщення
   */
  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const notificationId = parseInt(req.params.id);
      
      // У реальному проекті тут має бути код для видалення сповіщення
      // з бази даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Deleting notification ${notificationId} for user ${userId}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Сповіщення успішно видалено'
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Позначення сповіщення як прочитаного
   */
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const notificationId = parseInt(req.params.id);
      
      // У реальному проекті тут має бути код для оновлення статусу
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Marking notification ${notificationId} as read for user ${userId}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Сповіщення позначено як прочитане'
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Позначення всіх сповіщень як прочитаних
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      
      // У реальному проекті тут має бути код для оновлення статусу
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Marking all notifications as read for user ${userId}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Всі сповіщення позначено як прочитані'
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Відправка сповіщення (для адміністраторів)
   */
  async sendNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        userId, 
        type, 
        subject, 
        content, 
        email, 
        phoneNumber, 
        deviceToken,
        priority 
      } = req.body;
      
      let success = false;
      
      switch (type) {
        case 'email':
          const emailResult = await notificationService.sendEmailNotification({
            userId,
            email,
            subject,
            content,
            priority
          });
          success = !!emailResult;
          break;
        case 'sms':
          const smsNotification = await notificationService.sendSmsNotification({
            userId,
            phoneNumber,
            content,
            priority
          });
          success = !!smsNotification;
          break;
        case 'push':
          const pushNotification = await notificationService.sendPushNotification({
            userId,
            deviceToken,
            title: subject,
            content,
            priority
          });
          success = !!pushNotification;
          break;
        default:
          return res.status(400).json({
            status: 'error',
            message: 'Непідтримуваний тип сповіщення'
          });
      }
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Сповіщення успішно відправлено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося відправити сповіщення'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Відправка сповіщення за шаблоном (для адміністраторів)
   */
  async sendTemplateNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        userId, 
        templateName, 
        variables,
        email,
        phoneNumber,
        deviceToken,
        priority
      } = req.body;
      
      // Отримуємо дані контакту з бази даних, якщо не вказані
      let userContact = {
        email,
        phoneNumber,
        deviceToken
      };
      
      if (!email && !phoneNumber && !deviceToken) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, phoneNumber: true }
        });
        
        if (user) {
          userContact.email = user.email;
          userContact.phoneNumber = user.phoneNumber || undefined;
        }
      }
      
      // Відправляємо сповіщення за шаблоном
      const success = await notificationService.sendTemplateNotification(
        templateName,
        userId,
        variables,
        {
          email: userContact.email,
          phoneNumber: userContact.phoneNumber,
          deviceToken: userContact.deviceToken,
          priority
        }
      );
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Сповіщення за шаблоном успішно відправлено'
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося відправити сповіщення за шаблоном'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання списку шаблонів сповіщень (для адміністраторів)
   */
  async getTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      // У реальному проекті тут має бути код для отримання шаблонів
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          templates: [
            {
              id: 1,
              name: 'welcome_email',
              type: 'email',
              subject: 'Ласкаво просимо до ToAgro!',
              content: '<h1>Вітаємо, {{name}}!</h1><p>Ми раді, що ви приєдналися до спільноти ToAgro!</p>',
              variables: ['name'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            {
              id: 2,
              name: 'new_message',
              type: 'email',
              subject: 'Нове повідомлення на ToAgro',
              content: '<h1>Привіт, {{name}}!</h1><p>Ви отримали нове повідомлення від {{senderName}}.</p>',
              variables: ['name', 'senderName'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання шаблону сповіщення (для адміністраторів)
   */
  async getTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const templateId = parseInt(req.params.id);
      
      // У реальному проекті тут має бути код для отримання шаблону
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          template: {
            id: templateId,
            name: 'welcome_email',
            type: 'email',
            subject: 'Ласкаво просимо до ToAgro!',
            content: '<h1>Вітаємо, {{name}}!</h1><p>Ми раді, що ви приєдналися до спільноти ToAgro!</p>',
            variables: ['name'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Створення шаблону сповіщення (для адміністраторів)
   */
  async createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, type, subject, content, variables } = req.body;
      
      // У реальному проекті тут має бути код для створення шаблону
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Creating notification template ${name} of type ${type}`);
      
      res.status(201).json({
        status: 'success',
        message: 'Шаблон сповіщення успішно створено',
        data: {
          template: {
            id: 3,
            name,
            type,
            subject,
            content,
            variables,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Оновлення шаблону сповіщення (для адміністраторів)
   */
  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const templateId = parseInt(req.params.id);
      const { name, type, subject, content, variables } = req.body;
      
      // У реальному проекті тут має бути код для оновлення шаблону
      // в базі даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Updating notification template ${templateId}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Шаблон сповіщення успішно оновлено',
        data: {
          template: {
            id: templateId,
            name,
            type,
            subject,
            content,
            variables,
            updatedAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Видалення шаблону сповіщення (для адміністраторів)
   */
  async deleteTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const templateId = parseInt(req.params.id);
      
      // У реальному проекті тут має бути код для видалення шаблону
      // з бази даних. Для прикладу, просто логуємо і повертаємо успіх.
      logger.info(`Deleting notification template ${templateId}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Шаблон сповіщення успішно видалено'
      });
    } catch (error) {
      next(error);
    }
  }
};