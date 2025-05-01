import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';
import { notificationService, NotificationPriority } from './notificationService';
import { NotificationType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

// Queue configuration constants
const BULK_NOTIFICATION_QUEUE = 'bulk_notifications';
const BATCH_SIZE = 100; // Number of notifications in one batch
const BATCH_INTERVAL = 1000; // Interval between sending batches in milliseconds

/**
 * Interface for user filtering during bulk notifications
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
 * Bulk notification task statuses (must match Prisma enum)
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
 * Interface for bulk notification task
 */
export interface BulkNotificationTask {
  id: string;
  type: NotificationType;
  subject?: string | null;
  content: string;
  userFilter?: UserFilter;
  templateName?: string | null;
  totalSent: number;
  totalFailed: number;
  status: BulkNotificationStatusType;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: number;
  senderId?: number | null;
  campaignId?: number | null;
  priority?: NotificationPriority;
  templateVariables?: Record<string, string>;
  // Include Prisma relation fields
  createdBy?: any;
  sender?: any;
  campaign?: any;
}

/**
 * User data interface for notification processing
 */
interface UserNotificationData {
  id: number;
  email?: string;
  name?: string;
  phoneNumber?: string | null;
}

interface SendOptions {
  templateName?: string;
  templateVariables?: Record<string, string>;
  senderId?: number;
  campaignId?: number;
  priority?: NotificationPriority;
}
/**
 * Service for managing bulk notification tasks
 */
class BulkNotificationService {
  private activeJobs: Map<string, BulkNotificationTask> = new Map();
  
  /**
   * Initialize bulk notification queue
   */
  async initializeBulkNotifications(): Promise<void> {
    try {
      await rabbitmq.assertQueue(BULK_NOTIFICATION_QUEUE, { durable: true });
      logger.info('Bulk notification queue successfully initialized');
    } catch (error) {
      logger.error(`Error initializing bulk notification queue: ${error}`);
      throw error;
    }
  }

  /**
   * Add bulk notification task to queue
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
      const now = new Date();
      
      const taskData: Prisma.BulkNotificationCreateInput = {
        id: taskId,
        type,
        content,
        subject: options.subject,
        userFilter: options.userFilter as Prisma.InputJsonValue,
        templateName: options.templateName,
        status: 'PENDING',
        totalSent: 0,
        totalFailed: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: { connect: { id: createdById } },
        sender: options.senderId ? { connect: { id: options.senderId } } : undefined,
        campaign: options.campaignId ? { connect: { id: options.campaignId } } : undefined,
        priority: options.priority || NotificationPriority.NORMAL,
      };
  
      await prisma.bulkNotification.create({ data: taskData });
  
      const task: BulkNotificationTask = {
        id: taskId,
        type,
        content,
        subject: options.subject,
        userFilter: options.userFilter,
        templateName: options.templateName,
        totalSent: 0,
        totalFailed: 0,
        status: 'PENDING' as BulkNotificationStatusType,
        createdAt: now,
        updatedAt: now,
        createdById,
        senderId: options.senderId || null,
        campaignId: options.campaignId || null,
        priority: options.priority || NotificationPriority.NORMAL,
        templateVariables: options.templateVariables,
      };
  
      await rabbitmq.sendToQueue(BULK_NOTIFICATION_QUEUE, task);
      return taskId;
    } catch (error) {
      logger.error(`Failed to enqueue bulk notification: ${error}`);
      throw error;
    }
  }

  /**
   * Add bulk email notification task
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
   * Add bulk SMS notification task
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
   * Add bulk Push notification task
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
   * Start bulk notification worker
   */
  async startBulkNotificationWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(BULK_NOTIFICATION_QUEUE, async (content: any) => {
        const task = content as BulkNotificationTask;
        try {
          logger.info(`Starting bulk notification task processing: ${task.id}`);
          
          // Update task status in database
          await this.updateTaskStatus(task.id, 'PROCESSING', { startedAt: new Date() });
          
          // Update local task object
          task.status = 'PROCESSING';
          task.startedAt = new Date();
          this.activeJobs.set(task.id, task);
          
          // Get users by filter
          const users = await this.getUsersByFilter(task.userFilter);
          logger.info(`Found ${users.length} users for task ${task.id}`);
          
          if (users.length === 0) {
            await this.completeTask(task.id, 0, 0);
            return;
          }
          
          // Process notifications in batches
          let totalSuccess = 0;
          let totalFailure = 0;
          
          for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const { successCount, failureCount } = await this.processBatch(task, batch);
            
            totalSuccess += successCount;
            totalFailure += failureCount;
            
            // Update task counters in database
            await this.updateTaskCounters(task.id, successCount, failureCount);
            
            // Add delay between batches to avoid overload
            if (i + BATCH_SIZE < users.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
            }
          }
          
          await this.completeTask(task.id, totalSuccess, totalFailure);
        } catch (error) {
          logger.error(`Error processing bulk notification task: ${error}`);
          await this.failTask(task.id, error);
        }
      });
      
      logger.info('Bulk notification worker successfully started');
    } catch (error) {
      logger.error(`Error starting bulk notification worker: ${error}`);
      throw error;
    }
  }

  /**
   * Update task status in database
   */
  private async updateTaskStatus(
    taskId: string, 
    status: BulkNotificationStatusType, 
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: {
          status,
          updatedAt: new Date(),
          ...additionalData
        }
      });
    } catch (error) {
      logger.error(`Failed to update task status for ${taskId}: ${error}`);
      throw error;
    }
  }

  /**
   * Update task counters in database
   */
  private async updateTaskCounters(
    taskId: string,
    successIncrement: number,
    failureIncrement: number
  ): Promise<void> {
    try {
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: {
          totalSent: { increment: successIncrement },
          totalFailed: { increment: failureIncrement },
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error(`Failed to update task counters for ${taskId}: ${error}`);
      // Don't throw here to avoid interrupting the process
    }
  }

  /**
   * Mark task as successfully completed
   */
  private async completeTask(taskId: string, successCount: number, failureCount: number): Promise<void> {
    try {
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
          totalSent: { increment: successCount },
          totalFailed: { increment: failureCount }
        }
      });
      this.activeJobs.delete(taskId);
      logger.info(`Task ${taskId} completed successfully`);
    } catch (error) {
      logger.error(`Failed to complete task ${taskId}: ${error}`);
    }
  }

  /**
   * Mark task as failed
   */
  private async failTask(taskId: string, error: any): Promise<void> {
    try {
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });
      this.activeJobs.delete(taskId);
      logger.error(`Task ${taskId} failed: ${error}`);
    } catch (dbError) {
      logger.error(`Failed to update failed task ${taskId} in database: ${dbError}`);
    }
  }
  
  /**
   * Process batch of users
   */
  private async processBatch(
    task: BulkNotificationTask, 
    users: UserNotificationData[]
  ): Promise<{ successCount: number, failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        await this.processUserNotification(task, user);
        successCount++;
      } catch (error) {
        logger.error(`Error sending notification to user ${user.id}: ${error}`);
        failureCount++;
      }
    }

    return { successCount, failureCount };
  }

  /**
   * Process notification for a single user
   */
  private async processUserNotification(
    task: BulkNotificationTask, 
    user: UserNotificationData
  ): Promise<void> {
    // Prepare personalized content with template variables
    const variables = this.prepareTemplateVariables(task, user);
    const content = this.replaceTemplateVariables(task.content, variables);
    const subject = task.subject ? this.replaceTemplateVariables(task.subject, variables) : '';
    
    switch (task.type) {
      case NotificationType.EMAIL:
        await this.processEmailNotification(task, user, subject, content, variables);
        break;
      case NotificationType.SMS:
        await this.processSmsNotification(task, user, content);
        break;
      case NotificationType.PUSH:
        await this.processPushNotification(task, user, subject, content);
        break;
      default:
        throw new Error(`Unsupported notification type: ${task.type}`);
    }
  }

  /**
   * Prepare template variables for a user
   */
  private prepareTemplateVariables(
    task: BulkNotificationTask, 
    user: UserNotificationData
  ): Record<string, string> {
    return {
      name: user.name || 'user',
      email: user.email || '',
      id: user.id.toString(),
      ...(task.templateVariables || {})
    };
  }

  /**
   * Replace template variables in text
   */
  private replaceTemplateVariables(
    text: string, 
    variables: Record<string, string>
  ): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Process email notification
   */
  private async processEmailNotification(
    task: BulkNotificationTask,
    user: UserNotificationData,
    subject: string,
    content: string,
    variables: Record<string, string>
  ): Promise<void> {
    if (!user.email) {
      throw new Error(`User ${user.id} has no email address`);
    }
    
    // Send notification
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
   * Process SMS notification
   */
  private async processSmsNotification(
    task: BulkNotificationTask,
    user: UserNotificationData,
    content: string
  ): Promise<void> {
    if (!user.phoneNumber) {
      throw new Error(`User ${user.id} has no phone number`);
    }
    
    await notificationService.sendSmsNotification(
      user.id,
      user.phoneNumber,
      content,
      task.priority
    );
  }

  /**
   * Process Push notification
   */
  private async processPushNotification(
    task: BulkNotificationTask,
    user: UserNotificationData,
    title: string,
    content: string
  ): Promise<void> {
    const deviceTokens = await this.getUserDeviceTokens(user.id);
    
    if (deviceTokens.length === 0) {
      throw new Error(`User ${user.id} has no registered devices`);
    }
    
    let successCount = 0;
    
    for (const deviceToken of deviceTokens) {
      try {
        await notificationService.sendPushNotification(
          user.id,
          deviceToken,
          title || 'Notification',
          content,
          undefined,
          task.priority
        );
        successCount++;
      } catch (error) {
        logger.error(`Error sending push notification to device ${deviceToken}: ${error}`);
      }
    }
    
    if (successCount === 0) {
      throw new Error(`Failed to send push notifications to all devices for user ${user.id}`);
    }
  }

  /**
   * Get user device tokens
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
   * Get users by filter
   */
  private async getUsersByFilter(filter?: UserFilter): Promise<UserNotificationData[]> {
    try {
      if (!filter) {
        // If no filter is specified, return all verified users
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
      
      // Build filter conditions
      const where: Prisma.UserWhereInput = {};
      
      if (filter.role) {
        where.role = filter.role as any; // Cast to any to handle the enum
      }
      
      if (filter.isVerified !== undefined) {
        where.isVerified = filter.isVerified;
      }
      
      if (filter.createdBefore || filter.createdAfter) {
        where.createdAt = {};
        if (filter.createdBefore) {
          where.createdAt.lt = filter.createdBefore instanceof Date 
            ? filter.createdBefore 
            : new Date(filter.createdBefore);
        }
        if (filter.createdAfter) {
          where.createdAt.gt = filter.createdAfter instanceof Date 
            ? filter.createdAfter 
            : new Date(filter.createdAfter);
        }
      }
      
      if (filter.lastLoginBefore || filter.lastLoginAfter) {
        where.lastLoginAt = {};
        if (filter.lastLoginBefore) {
          where.lastLoginAt.lt = filter.lastLoginBefore instanceof Date 
            ? filter.lastLoginBefore 
            : new Date(filter.lastLoginBefore);
        }
        if (filter.lastLoginAfter) {
          where.lastLoginAt.gt = filter.lastLoginAfter instanceof Date 
            ? filter.lastLoginAfter 
            : new Date(filter.lastLoginAfter);
        }
      }
      
      if (filter.hasListings !== undefined) {
        where.listings = filter.hasListings ? { some: {} } : { none: {} };
      }
      
      if (filter.specificIds && filter.specificIds.length > 0) {
        where.id = { in: filter.specificIds };
      }
      
      if (filter.categoryIds && filter.categoryIds.length > 0) {
        // Use correct Prisma relation field name based on schema
        // Check if it's UserCategory or similar in your schema
        (where as any).userCategories = {
          some: {
            categoryId: { in: filter.categoryIds },
          },
        };
      }
      
      // Get filtered users
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
   * Get task status
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
    try {
      // Check if task is in active jobs map
      const activeTask = this.activeJobs.get(taskId);
      if (activeTask) {
        return {
          id: activeTask.id,
          status: activeTask.status,
          totalSent: activeTask.totalSent,
          totalFailed: activeTask.totalFailed,
          startedAt: activeTask.startedAt?.toISOString(),
          completedAt: activeTask.completedAt?.toISOString(),
          type: activeTask.type,
          subject: activeTask.subject || undefined,
          createdById: activeTask.createdById
        };
      }
    
      // Get task from database
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
        type: task.type,
        subject: task.subject || undefined,
        createdById: task.createdById
      };
    } catch (error) {
      logger.error(`Error getting task status for ${taskId}: ${error}`);
      return null;
    }
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      // Check if task is active and remove from active jobs
      const activeTask = this.activeJobs.get(taskId);
      if (activeTask) {
        this.activeJobs.delete(taskId);
      }
      
      // Update task status in database
      await prisma.bulkNotification.update({
        where: { id: taskId },
        data: { 
          status: 'CANCELLED',
          completedAt: new Date(),
          updatedAt: new Date()
        },
      });
      
      logger.info(`Task ${taskId} cancelled successfully`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling task ${taskId}: ${error}`);
      return false;
    }
  }

  /**
   * Get list of active jobs
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
      status: task.status,
      startedAt: task.startedAt?.toISOString(),
      totalSent: task.totalSent,
      totalFailed: task.totalFailed,
      createdById: task.createdById
    }));
  }
}

// Export single service instance
export const bulkNotificationService = new BulkNotificationService();