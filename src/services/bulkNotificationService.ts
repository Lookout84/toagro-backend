import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';
// import { notificationService, NotificationType, NotificationPriority } from './notificationService';
import { notificationService, NotificationPriority } from './notificationService';
import { NotificationType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

// Константи для налаштувань черги
const BULK_NOTIFICATION_QUEUE = 'bulk_notifications';
const BATCH_SIZE = 100; // Кількість сповіщень у одному пакеті
const BATCH_INTERVAL = 1000; // Інтервал між відправкою пакетів у мілісекундах

/**
 * Інтерфейс для фільтрації користувачів при масовій розсилці
 */
export interface UserFilter {
  role?: string;
  isVerified?: boolean;
  createdBefore?: Date | string;
  createdAfter?: Date | string;
  categoryIds?: number[];
  lastLoginBefore?: Date | string;
  lastLoginAfter?: Date | string;
  hasListings?: boolean;
  specificIds?: number[];
}

/**
 * Статуси завдань масової розсилки (мають відповідати enum у Prisma)
 */
export const BulkNotificationStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
} as const;

export type BulkNotificationStatusType = keyof typeof BulkNotificationStatus;

/**
 * Інтерфейс завдання масової розсилки
 */
export interface BulkNotificationTask {
  id: string;
  type: NotificationType;
  subject?: string;
  content: string;
  userFilter?: UserFilter;
  templateName?: string;
  templateVariables?: Record<string, string>;
  senderId?: number;
  campaignId?: number;
  priority?: NotificationPriority;
  startedAt?: Date | string;
  completedAt?: Date | string;
  totalSent?: number;
  totalFailed?: number;
  status?: BulkNotificationStatusType;
  createdById: number;
}

/**
 * Сервіс для управління масовими розсилками сповіщень
 */
class BulkNotificationService {
  private activeJobs: Map<string, BulkNotificationTask> = new Map();
  
  /**
   * Ініціалізація черги масових розсилок
   */
  async initializeBulkNotifications(): Promise<void> {
    try {
      await rabbitmq.assertQueue(BULK_NOTIFICATION_QUEUE, { durable: true });
      logger.info('Черга масових розсилок успішно ініціалізована');
    } catch (error) {
      logger.error(`Помилка ініціалізації черги масових розсилок: ${error}`);
      throw error;
    }
  }

  /**
   * Додавання завдання на масову розсилку до черги
   */
  async enqueueBulkNotification(
    type: NotificationType,
    content: string,
    createdById: number,
    options: {
      subject?: string;
      userFilter?: UserFilter;
      templateName?: string;
      templateVariables?: Record<string, string>;
      senderId?: number;
      campaignId?: number;
      priority?: NotificationPriority;
    } = {}
  ): Promise<string> {
    try {
      const taskId = `bulk_${uuidv4()}`;
      
      const task: BulkNotificationTask = {
        id: taskId,
        type,
        content,
        createdById,
        subject: options.subject,
        userFilter: options.userFilter,
        templateName: options.templateName,
        templateVariables: options.templateVariables,
        senderId: options.senderId,
        campaignId: options.campaignId,
        priority: options.priority || NotificationPriority.NORMAL,
        status: 'PENDING',
        totalSent: 0,
        totalFailed: 0
      };
      
      // Зберігаємо завдання в базі даних
      await prisma.bulkNotification.create({
        data: {
          id: taskId,
          type,
          content,
          subject: options.subject,
          userFilter: options.userFilter as Prisma.JsonObject,
          templateName: options.templateName,
          status: 'PENDING',
          senderId: options.senderId,
          campaignId: options.campaignId,
          priority: options.priority || NotificationPriority.NORMAL,
          createdById,
          totalSent: 0,
          totalFailed: 0
        }
      });
      
      // Відправляємо завдання в чергу
      await rabbitmq.sendToQueue(BULK_NOTIFICATION_QUEUE, task);
      logger.info(`Завдання масової розсилки ${taskId} успішно додано до черги`);
      
      return taskId;
    } catch (error) {
      logger.error(`Помилка додавання завдання масової розсилки: ${error}`);
      throw error;
    }
  }

  /**
   * Додавання завдання на масову розсилку email
   */
  async enqueueBulkEmailNotification(
    subject: string,
    content: string,
    createdById: number,
    userFilter?: UserFilter,
    options: {
      templateName?: string;
      templateVariables?: Record<string, string>;
      senderId?: number;
      campaignId?: number;
      priority?: NotificationPriority;
    } = {}
  ): Promise<string> {
    return this.enqueueBulkNotification(
      NotificationType.EMAIL,
      content,
      createdById,
      {
        subject,
        userFilter,
        ...options,
      }
    );
  }

  /**
   * Додавання завдання на масову розсилку SMS
   */
  async enqueueBulkSmsNotification(
    content: string,
    createdById: number,
    userFilter?: UserFilter,
    options: {
      senderId?: number;
      campaignId?: number;
      priority?: NotificationPriority;
    } = {}
  ): Promise<string> {
    return this.enqueueBulkNotification(
      NotificationType.SMS,
      content,
      createdById,
      {
        userFilter,
        ...options,
      }
    );
  }

  /**
   * Додавання завдання на масову розсилку Push сповіщень
   */
  async enqueueBulkPushNotification(
    title: string,
    content: string,
    createdById: number,
    userFilter?: UserFilter,
    options: {
      senderId?: number;
      campaignId?: number;
      priority?: NotificationPriority;
    } = {}
  ): Promise<string> {
    return this.enqueueBulkNotification(
      NotificationType.PUSH,
      content,
      createdById,
      {
        subject: title,
        userFilter,
        ...options,
      }
    );
  }

  /**
   * Запуск обробника масових розсилок
   */
  async startBulkNotificationWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(BULK_NOTIFICATION_QUEUE, async (content: any) => {
        const task = content as BulkNotificationTask;
        try {
          logger.info(`Початок обробки завдання масової розсилки ${task.id}`);
          
          // Оновлюємо статус завдання в базі даних
          await prisma.bulkNotification.update({
            where: { id: task.id },
            data: {
              status: 'PROCESSING',
              startedAt: new Date()
            }
          });
          
          // Оновлюємо локальний об'єкт завдання
          task.status = 'PROCESSING';
          task.startedAt = new Date().toISOString();
          this.activeJobs.set(task.id, task);
          
          // Отримуємо користувачів за вказаним фільтром
          const users = await this.getUsersByFilter(task.userFilter);
          logger.info(`Знайдено ${users.length} користувачів для завдання ${task.id}`);
          
          if (users.length === 0) {
            await this.completeTask(task.id, 0, 0);
            return;
          }
          
          // Відправляємо сповіщення пакетами
          for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const { successCount, failureCount } = await this.processBatch(task, batch);
            
            // Оновлюємо лічильники у базі даних
            await prisma.bulkNotification.update({
              where: { id: task.id },
              data: {
                totalSent: { increment: successCount },
                totalFailed: { increment: failureCount }
              }
            });
            
            // Додаємо затримку між пакетами, щоб уникнути перевантаження
            if (i + BATCH_SIZE < users.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
            }
          }
          
          await this.completeTask(task.id, users.length, 0);
        } catch (error) {
          logger.error(`Помилка обробки завдання масової розсилки: ${error}`);
          await this.failTask(task.id, error);
        }
      });
      
      logger.info('Обробник масових розсилок успішно запущений');
    } catch (error) {
      logger.error(`Помилка запуску обробника масових розсилок: ${error}`);
      throw error;
    }
  }

  /**
   * Помічає завдання як успішно завершене
   */
  private async completeTask(taskId: string, successCount: number, failureCount: number): Promise<void> {
    await prisma.bulkNotification.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalSent: { increment: successCount },
        totalFailed: { increment: failureCount }
      }
    });
    this.activeJobs.delete(taskId);
    logger.info(`Завдання масової розсилки ${taskId} успішно завершено`);
  }

  /**
   * Помічає завдання як невдале
   */
  private async failTask(taskId: string, error: any): Promise<void> {
    await prisma.bulkNotification.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        completedAt: new Date()
      }
    });
    this.activeJobs.delete(taskId);
    logger.error(`Завдання масової розсилки ${taskId} завершилося з помилкою: ${error}`);
  }

  /**
   * Обробка пакету користувачів
   */
  private async processBatch(task: BulkNotificationTask, users: any[]): Promise<{ successCount: number, failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        switch (task.type) {
          case NotificationType.EMAIL:
            await this.processBatchEmailNotification(task, user);
            break;
          case NotificationType.SMS:
            await this.processBatchSmsNotification(task, user);
            break;
          case NotificationType.PUSH:
            await this.processBatchPushNotification(task, user);
            break;
        }
        successCount++;
      } catch (error) {
        logger.error(`Помилка відправки сповіщення користувачу ${user.id}: ${error}`);
        failureCount++;
      }
    }

    return { successCount, failureCount };
  }

  /**
   * Обробка пакету email сповіщень
   */
  private async processBatchEmailNotification(task: BulkNotificationTask, user: any): Promise<void> {
    if (!user.email) {
      logger.warn(`Користувач ${user.id} не має email адреси`);
      throw new Error('Користувач не має email адреси');
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    let subject = task.subject || '';
    
    // Заміна змінних у вмісті
    const variables = {
      name: user.name || 'користувач',
      email: user.email,
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Замінюємо змінні у вмісті та темі
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
      subject = subject.replace(regex, value);
    }
    
    // Відправка сповіщення
    if (task.templateName) {
      await notificationService.sendTemplateNotification(
        task.templateName,
        user.id,
        variables,
        {
          email: user.email,
          priority: task.priority,
        }
      );
    } else {
      await notificationService.sendEmailNotification(
        user.id,
        user.email,
        subject,
        content,
        { priority: task.priority }
      );
    }
  }

  /**
   * Обробка пакету SMS сповіщень
   */
  private async processBatchSmsNotification(task: BulkNotificationTask, user: any): Promise<void> {
    if (!user.phoneNumber) {
      logger.warn(`Користувач ${user.id} не має номеру телефону`);
      throw new Error('Користувач не має номеру телефону');
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    
    // Заміна змінних у вмісті
    const variables = {
      name: user.name || 'користувач',
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Замінюємо змінні у вмісті
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
    }
    
    // Відправка SMS сповіщення
    await notificationService.sendSmsNotification(
      user.id,
      user.phoneNumber,
      content,
      task.priority
    );
  }

  /**
   * Обробка пакету Push сповіщень
   */
  private async processBatchPushNotification(task: BulkNotificationTask, user: any): Promise<void> {
    // Отримання токенів пристроїв користувача
    const deviceTokens = await this.getUserDeviceTokens(user.id);
    
    if (deviceTokens.length === 0) {
      logger.warn(`Користувач ${user.id} не має зареєстрованих пристроїв`);
      throw new Error('Користувач не має зареєстрованих пристроїв');
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    let title = task.subject || 'Сповіщення';
    
    // Заміна змінних у вмісті
    const variables = {
      name: user.name || 'користувач',
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Замінюємо змінні у вмісті та заголовку
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
      title = title.replace(regex, value);
    }
    
    // Відправка Push сповіщень на всі пристрої користувача
    for (const deviceToken of deviceTokens) {
      try {
        await notificationService.sendPushNotification(
          user.id,
          deviceToken,
          title,
          content,
          undefined,
          task.priority
        );
      } catch (error) {
        logger.error(`Помилка відправки push сповіщення на пристрій ${deviceToken}: ${error}`);
      }
    }
  }

  /**
   * Отримання токенів пристроїв користувача
   */
  private async getUserDeviceTokens(userId: number): Promise<string[]> {
    try {
      const userDevices = await prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });
      
      return userDevices.map(device => device.token);
    } catch (error) {
      logger.error(`Помилка отримання токенів пристроїв для користувача ${userId}: ${error}`);
      return [];
    }
  }

  /**
   * Отримання користувачів за вказаним фільтром
   */
  private async getUsersByFilter(filter?: UserFilter): Promise<any[]> {
    try {
      if (!filter) {
        // Якщо фільтр не вказаний, повертаємо всіх верифікованих користувачів
        return await prisma.user.findMany({
          where: { isVerified: true },
          select: {
            id: true,
            email: true,
            name: true,
            phoneNumber: true,
          },
        });
      }
      
      // Будуємо умови для фільтрації
      const where: any = {};
      
      if (filter.role) {
        where.role = filter.role;
      }
      
      if (filter.isVerified !== undefined) {
        where.isVerified = filter.isVerified;
      }
      
      if (filter.createdBefore || filter.createdAfter) {
        where.createdAt = {};
        if (filter.createdBefore) where.createdAt.lt = new Date(filter.createdBefore);
        if (filter.createdAfter) where.createdAt.gt = new Date(filter.createdAfter);
      }
      
      if (filter.lastLoginBefore || filter.lastLoginAfter) {
        where.lastLoginAt = {};
        if (filter.lastLoginBefore) where.lastLoginAt.lt = new Date(filter.lastLoginBefore);
        if (filter.lastLoginAfter) where.lastLoginAt.gt = new Date(filter.lastLoginAfter);
      }
      
      if (filter.hasListings !== undefined) {
        where.listings = filter.hasListings ? { some: {} } : { none: {} };
      }
      
      if (filter.specificIds && filter.specificIds.length > 0) {
        where.id = { in: filter.specificIds };
      }
      
      if (filter.categoryIds && filter.categoryIds.length > 0) {
        where.userCategories = {
          some: {
            categoryId: { in: filter.categoryIds },
          },
        };
      }
      
      // Отримуємо відфільтрованих користувачів
      return await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          phoneNumber: true,
        },
      });
    } catch (error) {
      logger.error(`Помилка отримання користувачів за фільтром: ${error}`);
      return [];
    }
  }

  /**
   * Отримання статусу завдання
   */
  async getTaskStatus(taskId: string): Promise<{
    id: string;
    status: BulkNotificationStatusType;
    totalSent: number;
    totalFailed: number;
    startedAt?: string;
    completedAt?: string;
    type: NotificationType;
    subject?: string;
    createdById: number;
  } | null> {
    // Спочатку перевіряємо активні завдання
    const activeTask = this.activeJobs.get(taskId);
    if (activeTask) {
      return {
        id: activeTask.id,
        status: activeTask.status || 'PENDING',
        totalSent: activeTask.totalSent || 0,
        totalFailed: activeTask.totalFailed || 0,
        startedAt: activeTask.startedAt,
        completedAt: activeTask.completedAt,
        type: activeTask.type,
        subject: activeTask.subject,
        createdById: activeTask.createdById
      };
    }
    
    // Якщо завдання не активне, шукаємо в базі даних
    const task = await prisma.bulkNotification.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        totalSent: true,
        totalFailed: true,
        startedAt: true,
        completedAt: true,
        type: true,
        subject: true,
        createdById: true
      }
    });
    
    if (!task) return null;
    
    return {
      id: task.id,
      status: task.status as BulkNotificationStatusType,
      totalSent: task.totalSent,
      totalFailed: task.totalFailed,
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      type: task.type as NotificationType,
      subject: task.subject || undefined,
      createdById: task.createdById
    };
  }

  /**
   * Скасування завдання
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Перевіряємо, чи завдання є активним
    const activeTask = this.activeJobs.get(taskId);
    if (activeTask) {
      activeTask.status = 'CANCELLED';
      this.activeJobs.delete(taskId);
    }
    
    try {
      // Оновлюємо статус завдання в базі даних
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: { 
          status: 'CANCELLED',
          completedAt: new Date()
        },
      });
      return true;
    } catch (error) {
      logger.error(`Помилка скасування завдання ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Отримання списку активних завдань
   */
  getActiveJobs(): {
    id: string;
    type: NotificationType;
    status: BulkNotificationStatusType;
    startedAt?: string;
    totalSent: number;
    totalFailed: number;
    createdById: number;
  }[] {
    return Array.from(this.activeJobs.values()).map(task => ({
      id: task.id,
      type: task.type,
      status: task.status || 'PENDING',
      startedAt: task.startedAt,
      totalSent: task.totalSent || 0,
      totalFailed: task.totalFailed || 0,
      createdById: task.createdById
    }));
  }
}

// Експортуємо єдиний екземпляр сервісу
export const bulkNotificationService = new BulkNotificationService();