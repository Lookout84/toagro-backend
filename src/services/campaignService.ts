import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { CampaignType, CampaignStatus } from '@prisma/client';
import { bulkNotificationService } from './bulkNotificationService';
import { scheduledTaskService } from './scheduledTaskService';
import { TaskType } from './scheduledTaskService';
import { NotificationType, NotificationPriority } from './notificationService';

interface CreateCampaignData {
  name: string;
  description?: string;
  type: CampaignType;
  startDate?: Date;
  endDate?: Date;
  targetAudience?: any;
  goal?: string;
  budget?: number;
  createdById: number;
}

interface UpdateCampaignData {
  name?: string;
  description?: string;
  type?: CampaignType;
  status?: CampaignStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  targetAudience?: any;
  goal?: string;
  budget?: number;
}

interface CampaignFilters {
  status?: CampaignStatus;
  type?: CampaignType;
  createdById?: number;
  search?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
  endDateFrom?: Date;
  endDateTo?: Date;
  page?: number;
  limit?: number;
}

export const campaignService = {
  /**
   * Створення нової кампанії
   */
  async createCampaign(data: CreateCampaignData) {
    try {
      // Створюємо кампанію
      const campaign = await prisma.campaign.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          status: CampaignStatus.DRAFT,
          startDate: data.startDate,
          endDate: data.endDate,
          targetAudience: data.targetAudience,
          goal: data.goal,
          budget: data.budget,
          createdById: data.createdById,
        },
      });

      logger.info(`Campaign ${campaign.id} created by user ${data.createdById}`);

      // Якщо вказано дату початку, плануємо автоматичний запуск
      if (data.startDate && data.startDate > new Date()) {
        await this.scheduleCampaignStart(campaign.id, data.startDate);
      }

      // Якщо вказано дату закінчення, плануємо автоматичне завершення
      if (data.endDate) {
        await this.scheduleCampaignEnd(campaign.id, data.endDate);
      }

      return campaign;
    } catch (error) {
      logger.error(`Error creating campaign: ${error}`);
      throw error;
    }
  },

  /**
   * Оновлення існуючої кампанії
   */
  async updateCampaign(id: number, data: UpdateCampaignData) {
    try {
      // Отримуємо поточну кампанію
      const existingCampaign = await prisma.campaign.findUnique({
        where: { id },
      });

      if (!existingCampaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      // Оновлюємо кампанію
      const campaign = await prisma.campaign.update({
        where: { id },
        data,
      });

      logger.info(`Campaign ${id} updated`);

      // Якщо змінено дату початку, оновлюємо заплановане завдання
      if (data.startDate !== undefined && data.startDate !== existingCampaign.startDate) {
        // Скасовуємо попереднє завдання, якщо воно існує
        // У реальному проекті тут має бути код для скасування завдання

        // Плануємо нове завдання, якщо дата початку в майбутньому
        if (data.startDate && data.startDate > new Date()) {
          await this.scheduleCampaignStart(campaign.id, data.startDate);
        }
      }

      // Якщо змінено дату закінчення, оновлюємо заплановане завдання
      if (data.endDate !== undefined && data.endDate !== existingCampaign.endDate) {
        // Скасовуємо попереднє завдання, якщо воно існує
        // У реальному проекті тут має бути код для скасування завдання

        // Плануємо нове завдання, якщо дата закінчення вказана
        if (data.endDate) {
          await this.scheduleCampaignEnd(campaign.id, data.endDate);
        }
      }

      // Якщо статус змінено на ACTIVE, виконуємо активацію кампанії
      if (data.status === CampaignStatus.ACTIVE && existingCampaign.status !== CampaignStatus.ACTIVE) {
        await this.activateCampaign(campaign.id);
      }

      // Якщо статус змінено на PAUSED або CANCELLED, призупиняємо або скасовуємо кампанію
      if (
        (data.status === CampaignStatus.PAUSED || data.status === CampaignStatus.CANCELLED) &&
        existingCampaign.status === CampaignStatus.ACTIVE
      ) {
        await this.deactivateCampaign(campaign.id, data.status);
      }

      return campaign;
    } catch (error) {
      logger.error(`Error updating campaign ${id}: ${error}`);
      throw error;
    }
  },

  /**
   * Отримання кампанії за ID
   */
  async getCampaign(id: number) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          bulkNotifications: {
            select: {
              id: true,
              type: true,
              subject: true,
              status: true,
              totalSent: true,
              totalFailed: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      return campaign;
    } catch (error) {
      logger.error(`Error getting campaign ${id}: ${error}`);
      throw error;
    }
  },

  /**
   * Отримання списку кампаній з фільтрацією та пагінацією
   */
  async getCampaigns(filters: CampaignFilters = {}) {
    try {
      const {
        status,
        type,
        createdById,
        search,
        startDateFrom,
        startDateTo,
        endDateFrom,
        endDateTo,
        page = 1,
        limit = 10,
      } = filters;

      const skip = (page - 1) * limit;

      // Побудова умов пошуку
      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (type) {
        where.type = type;
      }

      if (createdById) {
        where.createdById = createdById;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Фільтрація за датами
      if (startDateFrom || startDateTo) {
        where.startDate = {};
        if (startDateFrom) {
          where.startDate.gte = startDateFrom;
        }
        if (startDateTo) {
          where.startDate.lte = startDateTo;
        }
      }

      if (endDateFrom || endDateTo) {
        where.endDate = {};
        if (endDateFrom) {
          where.endDate.gte = endDateFrom;
        }
        if (endDateTo) {
          where.endDate.lte = endDateTo;
        }
      }

      // Отримання кампаній та загальної кількості
      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                bulkNotifications: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.campaign.count({ where }),
      ]);

      return {
        campaigns,
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error(`Error getting campaigns: ${error}`);
      throw error;
    }
  },

  /**
   * Видалення кампанії
   */
  async deleteCampaign(id: number) {
    try {
      // Перевіряємо чи існує кампанія
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          bulkNotifications: true,
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      // Перевіряємо чи можна видалити кампанію
      if (campaign.status === CampaignStatus.ACTIVE) {
        throw new Error(`Cannot delete active campaign. Please pause or cancel it first`);
      }

      // Скасовуємо пов'язані завдання
      // У реальному проекті тут має бути код для скасування завдань

      // Видаляємо кампанію та пов'язані масові розсилки
      await prisma.$transaction([
        prisma.bulkNotification.deleteMany({
          where: { campaignId: id },
        }),
        prisma.campaign.delete({
          where: { id },
        }),
      ]);

      logger.info(`Campaign ${id} deleted`);

      return { success: true };
    } catch (error) {
      logger.error(`Error deleting campaign ${id}: ${error}`);
      throw error;
    }
  },

  /**
   * Активація кампанії
   */
  async activateCampaign(id: number) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
      });

      if (!campaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      if (campaign.status === CampaignStatus.ACTIVE) {
        logger.info(`Campaign ${id} is already active`);
        return campaign;
      }

      // Оновлюємо статус кампанії
      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.ACTIVE,
        },
      });

      logger.info(`Campaign ${id} activated`);

      // Запускаємо відповідні дії в залежності від типу кампанії
      switch (campaign.type) {
        case CampaignType.EMAIL:
        case CampaignType.SMS:
        case CampaignType.PUSH:
        case CampaignType.MIXED:
          // Запускаємо розсилку
          await this.startCampaignMessages(id, campaign.type);
          break;
        case CampaignType.PROMO:
          // Активуємо промо-акції
          // У реальному проекті тут має бути код для активації промо-акцій
          break;
        case CampaignType.EVENT:
          // Запускаємо подію
          // У реальному проекті тут має бути код для запуску подій
          break;
        case CampaignType.NEWSLETTER:
          // Запускаємо розсилку новин
          await this.startNewsletterCampaign(id);
          break;
      }

      return updatedCampaign;
    } catch (error) {
      logger.error(`Error activating campaign ${id}: ${error}`);
      throw error;
    }
  },

  /**
   * Деактивація кампанії (пауза або скасування)
   */
  async deactivateCampaign(id: number, status: CampaignStatus) {
    try {
      // Перевіряємо, що статус є PAUSED або CANCELLED
      if (status !== CampaignStatus.PAUSED && status !== CampaignStatus.CANCELLED) {
        throw new Error(`Invalid deactivation status: ${status}. Must be PAUSED or CANCELLED.`);
      }

      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          bulkNotifications: {
            where: {
              status: 'PROCESSING',
            },
          },
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      if (campaign.status !== CampaignStatus.ACTIVE) {
        logger.info(`Campaign ${id} is not active`);
        return campaign;
      }

      // Зупиняємо активні розсилки
      for (const notification of campaign.bulkNotifications) {
        try {
          await bulkNotificationService.cancelTask(notification.id);
        } catch (error) {
          logger.error(`Error canceling bulk notification ${notification.id}: ${error}`);
        }
      }

      // Оновлюємо статус кампанії
      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: {
          status,
        },
      });

      logger.info(`Campaign ${id} ${status === CampaignStatus.PAUSED ? 'paused' : 'cancelled'}`);

      return updatedCampaign;
    } catch (error) {
      logger.error(`Error deactivating campaign ${id}: ${error}`);
      throw error;
    }
  },

  /**
   * Планування запуску кампанії
   */
  async scheduleCampaignStart(campaignId: number, startDate: Date) {
    try {
      // Плануємо запуск кампанії
      await scheduledTaskService.scheduleTask(
        TaskType.CUSTOM,
        {
          functionName: 'activateCampaign',
          params: { campaignId },
        },
        startDate
      );

      logger.info(`Campaign ${campaignId} scheduled to start at ${startDate.toISOString()}`);
    } catch (error) {
      logger.error(`Error scheduling campaign ${campaignId} start: ${error}`);
      throw error;
    }
  },

  /**
   * Планування завершення кампанії
   */
  async scheduleCampaignEnd(campaignId: number, endDate: Date) {
    try {
      // Плануємо завершення кампанії
      await scheduledTaskService.scheduleTask(
        TaskType.CUSTOM,
        {
          functionName: 'deactivateCampaign',
          params: { campaignId, status: CampaignStatus.COMPLETED },
        },
        endDate
      );

      logger.info(`Campaign ${campaignId} scheduled to end at ${endDate.toISOString()}`);
    } catch (error) {
      logger.error(`Error scheduling campaign ${campaignId} end: ${error}`);
      throw error;
    }
  },

  /**
   * Запуск розсилок для кампанії
   */
  async startCampaignMessages(campaignId: number, type: CampaignType) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Отримуємо цільову аудиторію з кампанії
      const userFilter = campaign.targetAudience || {};

      // Визначаємо тип сповіщення
      let notificationType: NotificationType;
      let subject: string | undefined;
      let content: string;

      switch (type) {
        case CampaignType.EMAIL:
          notificationType = NotificationType.EMAIL;
          subject = `${campaign.name}`;
          content = `Вміст кампанії ${campaign.name}`;
          break;
        case CampaignType.SMS:
          notificationType = NotificationType.SMS;
          content = `${campaign.name}: Короткий текст SMS`;
          break;
        case CampaignType.PUSH:
          notificationType = NotificationType.PUSH;
          subject = campaign.name;
          content = `Сповіщення від кампанії ${campaign.name}`;
          break;
        case CampaignType.MIXED:
          // Для змішаного типу запускаємо окремі розсилки для кожного типу
          await this.startCampaignMessages(campaignId, CampaignType.EMAIL);
          await this.startCampaignMessages(campaignId, CampaignType.SMS);
          await this.startCampaignMessages(campaignId, CampaignType.PUSH);
          return;
        default:
          throw new Error(`Unsupported campaign type for messages: ${type}`);
      }

      // Створюємо масову розсилку
      let taskId: string;

      switch (notificationType) {
        case NotificationType.EMAIL:
            taskId = await bulkNotificationService.enqueueBulkEmailNotification(
                subject!,
                content,
                campaign.createdById,
                {
                  senderId: campaign.createdById,
                  campaignId: campaign.id,
                  priority: NotificationPriority.NORMAL,
                }
              );
          break;
        case NotificationType.SMS:
          taskId = await bulkNotificationService.enqueueBulkSmsNotification(
            content,
            userFilter as any,
            {
              senderId: campaign.createdById,
              campaignId: campaign.id,
              priority: NotificationPriority.NORMAL,
            }
          );
          break;
        case NotificationType.PUSH:
          taskId = await bulkNotificationService.enqueueBulkPushNotification(
            subject!,
            content,
            userFilter as any,
            {
              senderId: campaign.createdById,
              campaignId: campaign.id,
              priority: NotificationPriority.NORMAL,
            }
          );
          break;
      }

      logger.info(`Campaign ${campaignId} started ${notificationType} bulk notification: ${taskId}`);

      return { taskId };
    } catch (error) {
      logger.error(`Error starting campaign ${campaignId} messages: ${error}`);
      throw error;
    }
  },

  /**
   * Запуск розсилки новин для кампанії
   */
  async startNewsletterCampaign(campaignId: number) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Отримуємо цільову аудиторію з кампанії або використовуємо фільтр для підписаних користувачів
      const userFilter = campaign.targetAudience || {
        notificationSettings: {
          newsletterSubscribed: true
        }
      };

      // Створюємо розсилку новин
      const taskId = await bulkNotificationService.enqueueBulkEmailNotification(
        `${campaign.name} - Новини`,
        `<h1>${campaign.name}</h1><p>Шановні користувачі, раді повідомити вас про останні новини.</p>`,
        userFilter as any,
        {
          templateName: 'newsletter_template',
          templateVariables: {
            campaignName: campaign.name,
            date: new Date().toLocaleDateString()
          },
          senderId: campaign.createdById,
          campaignId: campaign.id,
          priority: NotificationPriority.NORMAL,
        }
      );

      logger.info(`Newsletter campaign ${campaignId} started: ${taskId}`);

      return { taskId };
    } catch (error) {
      logger.error(`Error starting newsletter campaign ${campaignId}: ${error}`);
      throw error;
    }
  },

  /**
   * Отримання аналітики кампанії
   */
  async getCampaignAnalytics(id: number) {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          bulkNotifications: true,
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${id} not found`);
      }

      // Підрахунок загальної статистики
      let totalSent = 0;
      let totalFailed = 0;
      let completedNotifications = 0;

      for (const notification of campaign.bulkNotifications) {
        totalSent += notification.totalSent || 0;
        totalFailed += notification.totalFailed || 0;
        if (notification.status === 'COMPLETED') {
          completedNotifications++;
        }
      }

      // Розрахунок ефективності
      const deliveryRate = totalSent > 0 ? ((totalSent - totalFailed) / totalSent) * 100 : 0;
      
      // Повертаємо статистику
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        stats: {
          totalSent,
          totalFailed,
          deliveryRate: Math.round(deliveryRate * 100) / 100,
          completedNotifications,
          totalNotifications: campaign.bulkNotifications.length,
        },
        // Додаткова статистика у реальному проекті
        // clickRate, openRate, conversionRate, etc.
      };
    } catch (error) {
      logger.error(`Error getting analytics for campaign ${id}: ${error}`);
      throw error;
    }
  },
};