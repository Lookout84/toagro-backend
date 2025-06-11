import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';
import { notificationService } from './notificationService';
import { v4 as uuidv4 } from 'uuid';

// Константи
const SCHEDULED_TASKS_QUEUE = 'scheduled_tasks';
const SCHEDULED_TASKS_EXCHANGE = 'scheduled_tasks';
const DELAY_EXCHANGE = 'delay_exchange';
const TASK_CHECK_INTERVAL = 60000; // 1 хвилина

// Додайте enum статусів завдань
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PAUSED = 'PAUSED',
}

// Додайте інтерфейс для ScheduledTask (можна розширити за потреби)
export interface ScheduledTask {
  id: string;
  type: TaskType;
  data: any;
  scheduledFor: Date;
  status: TaskStatus;
  maxAttempts: number;
  attempts: number;
  lastAttemptAt?: Date | null;
  completedAt?: Date | null;
  createdById?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Типи планових завдань
 */
export enum TaskType {
  LISTING_DEACTIVATION = 'listing_deactivation',
  PAYMENT_REMINDER = 'payment_reminder',
  LISTING_BOOST_END = 'listing_boost_end',
  USER_SUBSCRIPTION_EXPIRY = 'user_subscription_expiry',
  EMAIL_CAMPAIGN = 'email_campaign',
  DATA_CLEANUP = 'data_cleanup',
  CUSTOM = 'custom',
}

/**
 * Сервіс для роботи з плановими завданнями
 */
class ScheduledTaskService {
  private checkInterval: NodeJS.Timeout | null = null;
  
  /**
   * Ініціалізація сервісу планових завдань
   */
  async initializeScheduledTasks(): Promise<void> {
    try {
      await rabbitmq.assertExchange(SCHEDULED_TASKS_EXCHANGE, 'direct');
      await rabbitmq.assertExchange(DELAY_EXCHANGE, 'x-delayed-message', {
        arguments: { 'x-delayed-type': 'direct' }
      });
      
      await rabbitmq.assertQueue(SCHEDULED_TASKS_QUEUE, { durable: true });
      
      await rabbitmq.bindQueue(SCHEDULED_TASKS_QUEUE, SCHEDULED_TASKS_EXCHANGE, 'task');
      await rabbitmq.bindQueue(SCHEDULED_TASKS_QUEUE, DELAY_EXCHANGE, 'delayed_task');
      
      logger.info('Scheduled tasks queues and exchanges initialized');
    } catch (error) {
      logger.error(`Failed to initialize scheduled tasks: ${error}`);
      throw error;
    }
  }

  /**
   * Планування завдання на певний час
   */
  async scheduleTask(
    type: TaskType,
    data: any,
    scheduledFor: Date,
    options?: {
      maxAttempts?: number;
      taskId?: string;
      createdById?: number;
    }
  ): Promise<string> {
    try {
      const taskId = options?.taskId || `task_${uuidv4()}`;
      const now = new Date();
      const delay = Math.max(0, scheduledFor.getTime() - now.getTime());
      
      const task = await prisma.scheduledTask.create({
        data: {
          id: taskId,
          type,
          data,
          scheduledFor,
          status: 'PENDING',
          maxAttempts: options?.maxAttempts || 3,
          createdById: options?.createdById,
        }
      });
      
      let result: boolean;
      
      if (delay <= 0) {
        result = await rabbitmq.publishToExchange(SCHEDULED_TASKS_EXCHANGE, 'task', task);
      } else {
        result = await rabbitmq.publishToExchange(DELAY_EXCHANGE, 'delayed_task', task, {
          headers: { 'x-delay': delay },
        });
      }
      
      if (result) {
        logger.info(`Task ${taskId} of type ${type} scheduled for ${scheduledFor.toISOString()}`);
      } else {
        logger.error(`Failed to schedule task ${taskId} of type ${type}`);
      }
      
      return taskId;
    } catch (error) {
      logger.error(`Failed to schedule task: ${error}`);
      throw error;
    }
  }

  /**
   * Скасування запланованого завдання
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      await prisma.scheduledTask.update({
        where: { id: taskId },
        data: { status: 'CANCELLED' }
      });
      
      logger.info(`Task ${taskId} cancelled`);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Запуск обробника планових завдань
   */
  async startScheduledTasksWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(SCHEDULED_TASKS_QUEUE, async (content: any) => {
        try {
          const task = content as { id: string; type: string; data: any };
          logger.info(`Processing scheduled task ${task.id} of type ${task.type}`);
          
          await prisma.scheduledTask.update({
            where: { id: task.id },
            data: { 
              status: 'PROCESSING',
              lastAttemptAt: new Date(),
              attempts: { increment: 1 }
            }
          });
          
          let success = false;
          
          try {
            switch (task.type) {
              case TaskType.LISTING_DEACTIVATION:
                success = await this.processListingDeactivation(task.data);
                break;
              case TaskType.PAYMENT_REMINDER:
                success = await this.processPaymentReminder(task.data);
                break;
              case TaskType.LISTING_BOOST_END:
                success = await this.processListingBoostEnd(task.data);
                break;
              case TaskType.USER_SUBSCRIPTION_EXPIRY:
                success = await this.processUserSubscriptionExpiry(task.data);
                break;
              case TaskType.EMAIL_CAMPAIGN:
                success = await this.processEmailCampaign(task.data);
                break;
              case TaskType.DATA_CLEANUP:
                success = await this.processDataCleanup(task.data);
                break;
              case TaskType.CUSTOM:
                success = await this.processCustomTask(task.data);
                break;
              default:
                logger.warn(`Unknown task type: ${task.type}`);
                success = false;
                break;
            }
          } catch (error) {
            logger.error(`Error processing task ${task.id}: ${error}`);
            success = false;
          }
          
          if (success) {
            await prisma.scheduledTask.update({
              where: { id: task.id },
              data: { 
                status: 'COMPLETED',
                completedAt: new Date()
              }
            });
            logger.info(`Task ${task.id} completed successfully`);
          } else {
            const updatedTask = await prisma.scheduledTask.findUnique({
              where: { id: task.id }
            });
            
            if (updatedTask && updatedTask.attempts >= updatedTask.maxAttempts) {
              await prisma.scheduledTask.update({
                where: { id: task.id },
                data: { status: 'FAILED' }
              });
              logger.error(`Task ${task.id} failed after ${updatedTask.attempts} attempts`);
            } else {
              throw new Error('Task failed, retrying later');
            }
          }
        } catch (error) {
          logger.error(`Error processing scheduled task: ${error}`);
          throw error;
        }
      });
      
      logger.info('Scheduled tasks worker started');
      this.startTaskChecker();
    } catch (error) {
      logger.error(`Failed to start scheduled tasks worker: ${error}`);
      throw error;
    }
  }

  /**
   * Запуск періодичної перевірки завдань
   */
  private startTaskChecker(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkOverdueTasks();
      } catch (error) {
        logger.error(`Error checking overdue tasks: ${error}`);
      }
    }, TASK_CHECK_INTERVAL);
    
    logger.info(`Task checker started with interval ${TASK_CHECK_INTERVAL}ms`);
  }

  /**
   * Зупинка перевірки завдань
   */
  stopTaskChecker(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Task checker stopped');
    }
  }

  /**
   * Перевірка прострочених завдань
   */
  private async checkOverdueTasks(): Promise<void> {
    try {
      const overdueTasks = await prisma.scheduledTask.findMany({
        where: {
          scheduledFor: { lte: new Date() },
          status: 'PENDING',
        },
        take: 100,
      });
      
      if (overdueTasks.length > 0) {
        logger.info(`Found ${overdueTasks.length} overdue tasks`);
        
        for (const task of overdueTasks) {
          await rabbitmq.publishToExchange(SCHEDULED_TASKS_EXCHANGE, 'task', task);
        }
      }
    } catch (error) {
      logger.error(`Error checking overdue tasks: ${error}`);
    }
  }

  /**
   * Обробка деактивації оголошення
   */
  private async processListingDeactivation(data: { listingId: number }): Promise<boolean> {
    try {
      const { listingId } = data;
      
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });
      
      if (!listing) {
        logger.warn(`Listing ${listingId} not found for deactivation`);
        return true;
      }
      
      if (listing.active) {
        await prisma.listing.update({
          where: { id: listingId },
          data: { active: false },
        });
        
        logger.info(`Listing ${listingId} deactivated automatically`);
        
        if (listing.user && listing.user.email) {
            await notificationService.sendEmailNotification({
              userId: listing.user.id,
              email: listing.user.email,
              subject: 'Ваше оголошення деактивовано',
              content: `
                <h1>Привіт, ${listing.user.name || 'користувач'}!</h1>
                <p>Ваше оголошення "${listing.title}" було автоматично деактивовано.</p>
                <p>Якщо ви бажаєте відновити його, будь ласка, увійдіть до свого облікового запису та активуйте його знову.</p>
              `
            });
          }
      } else {
        logger.info(`Listing ${listingId} is already inactive`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error deactivating listing: ${error}`);
      return false;
    }
  }

  /**
   * Обробка нагадування про оплату
   */
  private async processPaymentReminder(data: { userId: number, paymentId: number }): Promise<boolean> {
    try {
      const { userId, paymentId } = data;
      
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });
      
      if (!payment) {
        logger.warn(`Payment ${paymentId} not found for reminder`);
        return true;
      }
      
      if (payment.status === 'PENDING') {
        if (payment.user && payment.user.email) {
          await notificationService.sendEmailNotification({
            userId: payment.user.id,
            email: payment.user.email,
            subject: 'Нагадування про незавершений платіж',
            content: `
              <h1>Привіт, ${payment.user.name || 'користувач'}!</h1>
              <p>У вас є незавершений платіж на суму ${payment.amount} ${payment.currency}.</p>
              <p>Щоб завершити платіж, перейдіть за <a href="http://localhost:3000/payments/${payment.transactionId}">посиланням</a>.</p>
            `
          });
          
          logger.info(`Payment reminder sent for user ${userId}, payment ${paymentId}`);
        } else {
          logger.warn(`User email not found for payment ${paymentId}`);
        }
      } else {
        logger.info(`Payment ${paymentId} is not in PENDING status anymore`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error sending payment reminder: ${error}`);
      return false;
    }
  }

  /**
   * Обробка закінчення підвищення оголошення
   */
  private async processListingBoostEnd(data: { listingId: number, boostId: number }): Promise<boolean> {
    try {
      const { listingId, boostId } = data;
      logger.info(`Processing listing boost end for listing ${listingId}, boost ${boostId}`);
      
      await prisma.listing.update({
        where: { id: listingId },
        data: {},
      });
      
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: { user: true }
      });
      
      if (listing?.user) {
        await notificationService.sendEmailNotification({
          userId: listing.user.id,
          email: listing.user.email,
          subject: 'Підвищення оголошення завершено',
          content: `
            <h1>Привіт, ${listing.user.name || 'користувач'}!</h1>
            <p>Період підвищення вашого оголошення "${listing.title}" завершився.</p>
          `
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error processing listing boost end: ${error}`);
      return false;
    }
  }

  /**
   * Обробка закінчення підписки користувача
   */
  private async processUserSubscriptionExpiry(data: { userId: number, subscriptionId: number }): Promise<boolean> {
    try {
      const { userId, subscriptionId } = data;
      logger.info(`Processing subscription expiry for user ${userId}, subscription ${subscriptionId}`);
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (user?.email) {
        await notificationService.sendEmailNotification({
          userId,
          email: user.email,
          subject: 'Ваша підписка завершилася',
          content: `
            <h1>Привіт, ${user.name || 'користувач'}!</h1>
            <p>Ваша підписка на ToAgro завершилася. Будь ласка, продовжіть її для доступу до всіх функцій.</p>
          `
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error processing user subscription expiry: ${error}`);
      return false;
    }
  }

  /**
   * Обробка email кампанії
   */
  private async processEmailCampaign(data: { 
    campaignId: number, 
    subject: string, 
    content: string,
    userIds?: number[]
  }): Promise<boolean> {
    try {
      const { campaignId, subject, content, userIds } = data;
      logger.info(`Processing email campaign ${campaignId}`);
      
      let users;
      
      if (userIds && userIds.length > 0) {
        users = await prisma.user.findMany({
          where: { 
            id: { in: userIds },
            isVerified: true
          },
          select: {
            id: true,
            email: true,
            name: true,
          },
        });
      } else {
        users = await prisma.user.findMany({
          where: { isVerified: true },
          select: {
            id: true,
            email: true,
            name: true,
          },
        });
      }
      
      if (users.length === 0) {
        logger.warn(`No users found for email campaign ${campaignId}`);
        return true;
      }
      
      logger.info(`Sending email campaign to ${users.length} users`);
      
      let successCount = 0;
      
      for (const user of users) {
        try {
          const personalizedContent = content
            .replace(/{{name}}/g, user.name || 'користувач')
            .replace(/{{email}}/g, user.email);
          
          await notificationService.sendEmailNotification({
            userId: user.id,
            email: user.email,
            subject,
            content: personalizedContent
          });
          
          successCount++;
        } catch (error) {
          logger.error(`Error sending campaign email to user ${user.id}: ${error}`);
        }
      }
      
      logger.info(`Email campaign ${campaignId} completed: ${successCount}/${users.length} emails sent`);
      
      return true;
    } catch (error) {
      logger.error(`Error processing email campaign: ${error}`);
      return false;
    }
  }

  /**
   * Обробка очищення даних (виправлена версія)
   */
  private async processDataCleanup(data: { 
    type: 'listings' | 'messages' | 'payments' | 'logs',
    olderThan: string,
    limit?: number
  }): Promise<boolean> {
    try {
      const { type, olderThan, limit = 1000 } = data;
      const olderThanDate = new Date(olderThan);
      
      logger.info(`Processing data cleanup for ${type} older than ${olderThanDate.toISOString()}`);
      
      let count = 0;
      
      switch (type) {
        case 'listings':
          // Спочатку знаходимо записи для видалення
          const listingsToDelete = await prisma.listing.findMany({
            where: {
              active: false,
              updatedAt: { lt: olderThanDate },
            },
            take: limit,
            select: { id: true }
          });
          
          // Потім видаляємо знайдені записи
          if (listingsToDelete.length > 0) {
            const deleteResult = await prisma.listing.deleteMany({
              where: {
                id: { in: listingsToDelete.map(l => l.id) }
              }
            });
            count = deleteResult.count;
          }
          break;
          
        case 'messages':
          // Аналогічний підхід для повідомлень
          const messagesToDelete = await prisma.message.findMany({
            where: {
              createdAt: { lt: olderThanDate },
            },
            take: limit,
            select: { id: true }
          });
          
          if (messagesToDelete.length > 0) {
            const deleteResult = await prisma.message.deleteMany({
              where: {
                id: { in: messagesToDelete.map(m => m.id) }
              }
            });
            count = deleteResult.count;
          }
          break;
          
        case 'payments':
        case 'logs':
          // Реалізація для інших типів
          break;
      }
      
      logger.info(`Data cleanup completed: ${count} ${type} processed`);
      return true;
    } catch (error) {
      logger.error(`Error processing data cleanup: ${error}`);
      return false;
    }
  }

  /**
   * Обробка користувацьких завдань
   */
  private async processCustomTask(data: any): Promise<boolean> {
    try {
      logger.info(`Processing custom task with data: ${JSON.stringify(data)}`);
      
      if (data.functionName) {
        const allowedMethods = [
          'processListingDeactivation',
          'processPaymentReminder',
          'processListingBoostEnd',
          'processUserSubscriptionExpiry',
          'processEmailCampaign',
          'processDataCleanup'
        ];
        
        if (allowedMethods.includes(data.functionName)) {
          const method = this[data.functionName as keyof this];
          if (typeof method === 'function') {
            await method.call(this, data.params);
          }
        } else {
          logger.warn(`Unknown or invalid custom task function: ${data.functionName}`);
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Error processing custom task: ${error}`);
      return false;
    }
  }

  /**
   * Планування завдання для деактивації оголошення
   */
  async scheduleListingDeactivation(listingId: number, deactivateAt: Date, createdById?: number): Promise<string> {
    return await this.scheduleTask(
      TaskType.LISTING_DEACTIVATION,
      { listingId },
      deactivateAt,
      { createdById }
    );
  }

  /**
   * Планування завдання для нагадування про оплату
   */
  async schedulePaymentReminder(userId: number, paymentId: number, remindAt: Date, createdById?: number): Promise<string> {
    return await this.scheduleTask(
      TaskType.PAYMENT_REMINDER,
      { userId, paymentId },
      remindAt,
      { createdById }
    );
  }

  /**
   * Планування завдання для завершення підвищення оголошення
   */
  async scheduleListingBoostEnd(listingId: number, boostId: number, endAt: Date, createdById?: number): Promise<string> {
    return await this.scheduleTask(
      TaskType.LISTING_BOOST_END,
      { listingId, boostId },
      endAt,
      { createdById }
    );
  }

  /**
   * Планування завдання для завершення підписки користувача
   */
  async scheduleUserSubscriptionExpiry(userId: number, subscriptionId: number, expiryAt: Date, createdById?: number): Promise<string> {
    return await this.scheduleTask(
      TaskType.USER_SUBSCRIPTION_EXPIRY,
      { userId, subscriptionId },
      expiryAt,
      { createdById }
    );
  }

  /**
   * Планування email кампанії
   */
  async scheduleEmailCampaign(
    campaignId: number,
    subject: string,
    content: string,
    scheduledAt: Date,
    userIds?: number[],
    createdById?: number
  ): Promise<string> {
    return await this.scheduleTask(
      TaskType.EMAIL_CAMPAIGN,
      { campaignId, subject, content, userIds },
      scheduledAt,
      { createdById }
    );
  }

  /**
   * Планування очищення даних
   */
  async scheduleDataCleanup(
    type: 'listings' | 'messages' | 'payments' | 'logs',
    olderThan: Date,
    scheduledAt?: Date,
    limit?: number,
    createdById?: number
  ): Promise<string> {
    return await this.scheduleTask(
      TaskType.DATA_CLEANUP,
      { type, olderThan: olderThan.toISOString(), limit },
      scheduledAt || new Date(),
      { createdById }
    );
  }

  /**
   * Планування користувацького завдання
   */
  async scheduleCustomTask(
    functionName: string,
    params: any,
    scheduledAt: Date,
    createdById?: number
  ): Promise<string> {
    return await this.scheduleTask(
      TaskType.CUSTOM,
      { functionName, params },
      scheduledAt,
      { createdById }
    );
  }

  /**
   * Отримання списку завдань
   */
  async getTasks(
    filters: {
      status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
      type?: string;
      createdById?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tasks: any[], total: number }> {
    try {
      const where = {
        status: filters.status,
        type: filters.type,
        createdById: filters.createdById,
      };
      
      const [tasks, total] = await Promise.all([
        prisma.scheduledTask.findMany({
          where,
          take: filters.limit,
          skip: filters.offset,
          orderBy: { scheduledFor: 'asc' },
        }),
        prisma.scheduledTask.count({ where }),
      ]);
      
      return { tasks, total };
    } catch (error) {
      logger.error(`Error getting tasks: ${error}`);
      throw error;
    }
  }

  /**
   * Отримання інформації про завдання
   */
  async getTask(taskId: string): Promise<any> {
    try {
      return await prisma.scheduledTask.findUnique({
        where: { id: taskId },
      });
    } catch (error) {
      logger.error(`Error getting task ${taskId}: ${error}`);
      throw error;
    }
  }

  async pauseScheduledTask(taskId: string): Promise<boolean> {
    const updated = await prisma.scheduledTask.updateMany({
      where: { id: taskId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PAUSED' },
    });
    return updated.count > 0;
  }

  async resumeScheduledTask(taskId: string): Promise<boolean> {
    const updated = await prisma.scheduledTask.updateMany({
      where: { id: taskId, status: 'PAUSED' },
      data: { status: 'PENDING' },
    });
    return updated.count > 0;
  }


}

export const scheduledTaskService = new ScheduledTaskService();