import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';
import { notificationService, NotificationType, NotificationPriority } from './notificationService';
import { v4 as uuidv4 } from 'uuid';

// Константи
const BULK_NOTIFICATION_QUEUE = 'bulk_notifications';
const BATCH_SIZE = 100; // Кількість сповіщень у пакеті
const BATCH_INTERVAL = 1000; // Інтервал між пакетами в мс

/**
 * Тип фільтра користувачів для масової розсилки
 */
export interface UserFilter {
  role?: string;
  isVerified?: boolean;
  createdBefore?: Date | string;
  createdAfter?: Date | string;
  categoryIds?: number[]; // ID категорій, які цікавлять користувачів
  lastLoginBefore?: Date | string;
  lastLoginAfter?: Date | string;
  hasListings?: boolean;
  specificIds?: number[]; // Конкретні ID користувачів
}

/**
 * Статуси завдань масової розсилки
 */
export enum BulkNotificationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Тип завдання масової розсилки
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
  status?: BulkNotificationStatus;
}

/**
 * Сервіс для масових розсилок
 */
class BulkNotificationService {
  private activeJobs: Map<string, BulkNotificationTask> = new Map();
  
  /**
   * Ініціалізація черги масових розсилок
   */
  async initializeBulkNotifications(): Promise<void> {
    try {
      // Створюємо чергу для масових розсилок
      await rabbitmq.assertQueue(BULK_NOTIFICATION_QUEUE, { durable: true });
      
      logger.info('Bulk notifications queue initialized');
    } catch (error) {
      logger.error(`Failed to initialize bulk notifications: ${error}`);
      throw error;
    }
  }

  /**
   * Додавання завдання на масову розсилку
   */
  async enqueueBulkNotification(
    type: NotificationType,
    content: string,
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
        subject: options.subject,
        userFilter: options.userFilter,
        templateName: options.templateName,
        templateVariables: options.templateVariables,
        senderId: options.senderId,
        campaignId: options.campaignId,
        priority: options.priority || NotificationPriority.NORMAL,
        status: BulkNotificationStatus.PENDING,
        totalSent: 0,
        totalFailed: 0
      };
      
      // Відправляємо завдання в чергу
      const result = await rabbitmq.sendToQueue(BULK_NOTIFICATION_QUEUE, task);
      
      if (result) {
        logger.info(`Bulk notification task ${taskId} enqueued successfully`);
      } else {
        logger.error(`Failed to enqueue bulk notification task ${taskId}`);
      }
      
      return taskId;
    } catch (error) {
      logger.error(`Failed to enqueue bulk notification: ${error}`);
      throw error;
    }
  }

  /**
   * Додавання завдання на масову розсилку email
   */
  async enqueueBulkEmailNotification(
    subject: string,
    content: string,
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
      {
        subject: title, // Використовуємо subject для заголовка push сповіщення
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
          logger.info(`Processing bulk notification task ${task.id}`);
          
          // Оновлюємо статус завдання
          task.status = BulkNotificationStatus.PROCESSING;
          task.startedAt = new Date().toISOString();
          task.totalSent = 0;
          task.totalFailed = 0;
          
          // Зберігаємо активне завдання
          this.activeJobs.set(task.id, task);
          
          // Отримуємо користувачів за фільтром
          const users = await this.getUsersByFilter(task.userFilter);
          
          logger.info(`Found ${users.length} users for bulk notification task ${task.id}`);
          
          if (users.length === 0) {
            // Немає користувачів для розсилки
            task.status = BulkNotificationStatus.COMPLETED;
            task.completedAt = new Date().toISOString();
            this.activeJobs.delete(task.id);
            return;
          }
          
          // Відправляємо сповіщення пакетами
          for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            
            await this.processBatch(task, batch);
            
            // Оновлюємо статус завдання
            task.totalSent = (task.totalSent || 0) + batch.length;
            
            // Затримка між пакетами, щоб не перевантажувати систему
            if (i + BATCH_SIZE < users.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
            }
          }
          
          // Оновлюємо статус завдання
          task.status = BulkNotificationStatus.COMPLETED;
          task.completedAt = new Date().toISOString();
          
          logger.info(
            `Bulk notification task ${task.id} completed: ${task.totalSent} sent, ${task.totalFailed} failed`
          );
          
          // Видаляємо завдання зі списку активних
          this.activeJobs.delete(task.id);
        } catch (error) {
          logger.error(`Error processing bulk notification task: ${error}`);
          
          // Оновлюємо статус завдання
          const activeTask = this.activeJobs.get(task.id);
          if (activeTask) {
            activeTask.status = BulkNotificationStatus.FAILED;
            activeTask.completedAt = new Date().toISOString();
            this.activeJobs.delete(task.id);
          }
          
          throw error;
        }
      });
      
      logger.info('Bulk notification worker started');
    } catch (error) {
      logger.error(`Failed to start bulk notification worker: ${error}`);
      throw error;
    }
  }

  /**
   * Обробка пакету користувачів
   */
  private async processBatch(task: BulkNotificationTask, users: any[]): Promise<void> {
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
      } catch (error) {
        logger.error(`Error sending notification to user ${user.id}: ${error}`);
        task.totalFailed = (task.totalFailed || 0) + 1;
      }
    }
  }

  /**
   * Обробка пакету email сповіщень
   */
  private async processBatchEmailNotification(task: BulkNotificationTask, user: any): Promise<void> {
    if (!user.email) {
      logger.warn(`User ${user.id} has no email address`);
      task.totalFailed = (task.totalFailed || 0) + 1;
      return;
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    let subject = task.subject || '';
    
    // Заміна змінних
    const variables = {
      name: user.name || 'користувач',
      email: user.email,
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Заміняємо змінні
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
      subject = subject.replace(regex, value);
    }
    
    // Якщо вказано templateName, використовуємо його
    if (task.templateName) {
      try {
        await notificationService.sendTemplateNotification(
          task.templateName,
          user.id,
          variables,
          {
            email: user.email,
            priority: task.priority,
          }
        );
      } catch (error) {
        logger.error(`Error sending template notification to user ${user.id}: ${error}`);
        task.totalFailed = (task.totalFailed || 0) + 1;
      }
    } else {
      // Інакше відправляємо звичайне email сповіщення
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
      logger.warn(`User ${user.id} has no phone number`);
      task.totalFailed = (task.totalFailed || 0) + 1;
      return;
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    
    // Заміна змінних
    const variables = {
      name: user.name || 'користувач',
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Заміняємо змінні
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
    }
    
    // Відправляємо SMS сповіщення
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
    // Отримуємо токени пристроїв користувача
    const deviceTokens = await this.getUserDeviceTokens(user.id);
    
    if (deviceTokens.length === 0) {
      logger.warn(`User ${user.id} has no device tokens`);
      task.totalFailed = (task.totalFailed || 0) + 1;
      return;
    }
    
    // Підготовка персоналізованого вмісту
    let content = task.content;
    let title = task.subject || 'Сповіщення';
    
    // Заміна змінних
    const variables = {
      name: user.name || 'користувач',
      id: user.id.toString(),
      ...task.templateVariables,
    };
    
    // Заміняємо змінні
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
      title = title.replace(regex, value);
    }
    
    // Відправляємо Push сповіщення на всі пристрої користувача
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
        logger.error(`Error sending push notification to device ${deviceToken}: ${error}`);
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
      logger.error(`Error getting device tokens for user ${userId}: ${error}`);
      return [];
    }
  }

  /**
   * Отримання користувачів за фільтром
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
      
      // Будуємо умови WHERE для запиту
      const where: any = {};
      
      // Роль користувача
      if (filter.role) {
        where.role = filter.role;
      }
      
      // Верифікований користувач
      if (filter.isVerified !== undefined) {
        where.isVerified = filter.isVerified;
      }
      
      // Дата створення
      if (filter.createdBefore || filter.createdAfter) {
        where.createdAt = {};
        
        if (filter.createdBefore) {
          where.createdAt.lt = new Date(filter.createdBefore);
        }
        
        if (filter.createdAfter) {
          where.createdAt.gt = new Date(filter.createdAfter);
        }
      }
      
      // Дата останнього входу
      if (filter.lastLoginBefore || filter.lastLoginAfter) {
        where.lastLoginAt = {};
        
        if (filter.lastLoginBefore) {
          where.lastLoginAt.lt = new Date(filter.lastLoginBefore);
        }
        
        if (filter.lastLoginAfter) {
          where.lastLoginAt.gt = new Date(filter.lastLoginAfter);
        }
      }
      
      // Наявність оголошень
      if (filter.hasListings !== undefined) {
        where.listings = filter.hasListings
          ? { some: {} }
          : { none: {} };
      }
      
      // Конкретні користувачі
      if (filter.specificIds && filter.specificIds.length > 0) {
        where.id = { in: filter.specificIds };
      }
      
      // Категорії, які цікавлять користувачів
      if (filter.categoryIds && filter.categoryIds.length > 0) {
        where.userCategories = {
          some: {
            categoryId: { in: filter.categoryIds },
          },
        };
      }
      
      // Отримуємо користувачів за фільтром
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
      logger.error(`Error getting users by filter: ${error}`);
      return [];
    }
  }

  /**
   * Отримання статусу завдання
   */
  async getTaskStatus(taskId: string): Promise<{
    id: string;
    status: BulkNotificationStatus;
    totalSent: number;
    totalFailed: number;
    startedAt?: string;
    completedAt?: string;
  } | null> {
    // Перевіряємо, чи є завдання в активних
    const activeTask = this.activeJobs.get(taskId);
    if (activeTask) {
      return {
        id: activeTask.id,
        status: activeTask.status || BulkNotificationStatus.PENDING,
        totalSent: activeTask.totalSent || 0,
        totalFailed: activeTask.totalFailed || 0,
        startedAt: activeTask.startedAt?.toString(),
        completedAt: activeTask.completedAt?.toString(),
      };
    }
    
    // Якщо завдання немає в активних, шукаємо в базі даних
    const task = await prisma.bulkNotification.findUnique({
      where: { id: taskId },
    });
    
    if (!task) {
      return null;
    }
    
    return {
      id: task.id,
      status: task.status as BulkNotificationStatus,
      totalSent: task.totalSent,
      totalFailed: task.totalFailed,
      startedAt: task.startedAt?.toString(),
      completedAt: task.completedAt?.toString(),
    };
  }

  /**
   * Скасування завдання
   */
  async cancelTask(taskId: string): Promise<boolean> {
    // Перевіряємо, чи є завдання в активних
    const activeTask = this.activeJobs.get(taskId);
    if (activeTask) {
      activeTask.status = BulkNotificationStatus.CANCELLED;
      this.activeJobs.delete(taskId);
      return true;
    }
    
    // Якщо завдання немає в активних, скасовуємо в базі даних
    try {
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: { status: BulkNotificationStatus.CANCELLED },
      });
      return true;
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Отримання списку активних завдань
   */
  getActiveJobs(): {
    id: string;
    type: NotificationType;
    status: BulkNotificationStatus;
    startedAt?: string;
    totalSent: number;
    totalFailed: number;
  }[] {
    return Array.from(this.activeJobs.values()).map(task => ({
      id: task.id,
      type: task.type,
      status: task.status || BulkNotificationStatus.PENDING,
      startedAt: task.startedAt?.toString(),
      totalSent: task.totalSent || 0,
      totalFailed: task.totalFailed || 0,
    }));
  }
}

// Створюємо єдиний екземпляр сервісу
export const bulkNotificationService = new BulkNotificationService();