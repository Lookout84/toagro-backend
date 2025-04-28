import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { sendEmail } from '../utils/emailSender';
import { config } from '../config/env';
import { prisma } from '../config/db';

// Константи для обміну та черг
const NOTIFICATION_EXCHANGE = 'notifications';
const EMAIL_QUEUE = 'email_notifications';
const SMS_QUEUE = 'sms_notifications';
const PUSH_QUEUE = 'push_notifications';

/**
 * Типи сповіщень, що підтримуються системою
 */
export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

/**
 * Рівні пріоритету сповіщень
 */
export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

/**
 * Базовий інтерфейс для всіх сповіщень
 */
interface BaseNotification {
  id?: string;
  userId: number;
  type: NotificationType;
  priority?: NotificationPriority;
  createdAt?: string;
}

/**
 * Інтерфейс для email сповіщень
 */
interface EmailNotification extends BaseNotification {
  type: NotificationType.EMAIL;
  email: string;
  subject: string;
  content: string;
  attachments?: Array<{
    filename: string;
    path?: string;       // Для файлів на диску
    content?: string;  
    encoding?: string;
  }>;
}

/**
 * Інтерфейс для SMS сповіщень
 */
interface SmsNotification extends BaseNotification {
  type: NotificationType.SMS;
  phoneNumber: string;
  message: string;
}

/**
 * Інтерфейс для Push сповіщень
 */
interface PushNotification extends BaseNotification {
  type: NotificationType.PUSH;
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Об'єднаний тип сповіщень
 */
type Notification = EmailNotification | SmsNotification | PushNotification;

/**
 * Інтерфейс для шаблону сповіщення
 */
interface NotificationTemplate {
  id: number;
  name: string;
  type: NotificationType;
  subject?: string;
  content: string;
  variables: string[];
}

/**
 * Сервіс для роботи з сповіщеннями
 */
class NotificationService {
  /**
   * Шаблони сповіщень, кешовані для швидкого доступу
   */
  private templates: Map<string, NotificationTemplate> = new Map();

  /**
   * Ініціалізація сервісу сповіщень
   */
  async initializeNotifications(): Promise<void> {
    try {
      // Налаштування обміну типу "topic"
      await rabbitmq.assertExchange(NOTIFICATION_EXCHANGE, 'topic');
      
      // Налаштування черг
      await rabbitmq.assertQueue(EMAIL_QUEUE, { durable: true });
      await rabbitmq.assertQueue(SMS_QUEUE, { durable: true });
      await rabbitmq.assertQueue(PUSH_QUEUE, { durable: true });
      
      // Прив'язка черг до обміну
      await rabbitmq.bindQueue(EMAIL_QUEUE, NOTIFICATION_EXCHANGE, 'notification.email');
      await rabbitmq.bindQueue(SMS_QUEUE, NOTIFICATION_EXCHANGE, 'notification.sms');
      await rabbitmq.bindQueue(PUSH_QUEUE, NOTIFICATION_EXCHANGE, 'notification.push');
      
      // Завантаження шаблонів сповіщень з бази даних (якщо є)
      await this.loadTemplates();
      
      logger.info('Notification queues and exchanges initialized');
    } catch (error) {
      logger.error(`Failed to initialize notification service: ${error}`);
      throw error;
    }
  }

  /**
   * Завантаження шаблонів сповіщень з бази даних
   */
  private async loadTemplates(): Promise<void> {
    try {
      // Тут має бути код для завантаження шаблонів з бази даних
      // Для прикладу, створимо кілька базових шаблонів
      
      const defaultTemplates: NotificationTemplate[] = [
        {
          id: 1,
          name: 'welcome_email',
          type: NotificationType.EMAIL,
          subject: 'Ласкаво просимо до ToAgro!',
          content: '<h1>Вітаємо, {{name}}!</h1><p>Ми раді, що ви приєдналися до спільноти ToAgro!</p>',
          variables: ['name'],
        },
        {
          id: 2,
          name: 'new_message',
          type: NotificationType.EMAIL,
          subject: 'Нове повідомлення на ToAgro',
          content: '<h1>Привіт, {{name}}!</h1><p>Ви отримали нове повідомлення від {{senderName}}.</p>',
          variables: ['name', 'senderName'],
        },
        {
          id: 3,
          name: 'listing_created',
          type: NotificationType.EMAIL,
          subject: 'Ваше оголошення створено',
          content: '<h1>Привіт, {{name}}!</h1><p>Ваше оголошення "{{listingTitle}}" успішно опубліковано.</p>',
          variables: ['name', 'listingTitle'],
        },
      ];
      
      // Кешуємо шаблони для швидкого доступу
      defaultTemplates.forEach(template => {
        this.templates.set(template.name, template);
      });
      
      logger.info(`Loaded ${defaultTemplates.length} notification templates`);
    } catch (error) {
      logger.error(`Failed to load notification templates: ${error}`);
    }
  }

  /**
   * Відправка сповіщення в чергу
   */
  async sendNotification(notification: Notification): Promise<boolean> {
    try {
      // Додаємо додаткові дані
      const enrichedNotification = {
        ...notification,
        id: notification.id || `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        priority: notification.priority || NotificationPriority.NORMAL,
        createdAt: notification.createdAt || new Date().toISOString(),
      };
      
      // Визначаємо маршрутний ключ залежно від типу сповіщення
      let routingKey = '';
      
      switch (notification.type) {
        case NotificationType.EMAIL:
          routingKey = 'notification.email';
          break;
        case NotificationType.SMS:
          routingKey = 'notification.sms';
          break;
        case NotificationType.PUSH:
          routingKey = 'notification.push';
          break;
      }
      
      // Відправляємо в чергу
      const result = await rabbitmq.publishToExchange(
        NOTIFICATION_EXCHANGE, 
        routingKey, 
        enrichedNotification,
        // Для високопріоритетних повідомлень встановлюємо відповідний пріоритет
        enrichedNotification.priority === NotificationPriority.HIGH ? { priority: 10 } : undefined
      );
      
      logger.info(
        `Notification ${enrichedNotification.id} sent to queue with routing key ${routingKey}`
      );
      
      return result;
    } catch (error) {
      logger.error(`Failed to send notification: ${error}`);
      return false;
    }
  }

  /**
   * Відправка email сповіщення
   */
  async sendEmailNotification(
    userId: number,
    email: string,
    subject: string,
    content: string,
    options?: {
      priority?: NotificationPriority;
      attachments?: EmailNotification['attachments'];
    }
  ): Promise<boolean> {
    const notification: EmailNotification = {
      userId,
      type: NotificationType.EMAIL,
      email,
      subject,
      content,
      priority: options?.priority,
      attachments: options?.attachments,
    };
    
    return await this.sendNotification(notification);
  }

  /**
   * Відправка SMS сповіщення
   */
  async sendSmsNotification(
    userId: number,
    phoneNumber: string,
    message: string,
    priority?: NotificationPriority
  ): Promise<boolean> {
    const notification: SmsNotification = {
      userId,
      type: NotificationType.SMS,
      phoneNumber,
      message,
      priority,
    };
    
    return await this.sendNotification(notification);
  }

  /**
   * Відправка Push сповіщення
   */
  async sendPushNotification(
    userId: number,
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    priority?: NotificationPriority
  ): Promise<boolean> {
    const notification: PushNotification = {
      userId,
      type: NotificationType.PUSH,
      deviceToken,
      title,
      body,
      data,
      priority,
    };
    
    return await this.sendNotification(notification);
  }

  /**
   * Відправка сповіщення за шаблоном
   */
  async sendTemplateNotification(
    templateName: string,
    userId: number,
    variables: Record<string, string>,
    options?: {
      email?: string;
      phoneNumber?: string;
      deviceToken?: string;
      priority?: NotificationPriority;
    }
  ): Promise<boolean> {
    try {
      // Отримуємо шаблон
      const template = this.templates.get(templateName);
      
      if (!template) {
        logger.error(`Template ${templateName} not found`);
        return false;
      }
      
      // Якщо email не вказано, намагаємося отримати з бази даних
      let userContact: { email?: string; phoneNumber?: string } = {
        email: options?.email,
        phoneNumber: options?.phoneNumber,
      };
      
      if (!userContact.email || !userContact.phoneNumber) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, phoneNumber: true },
        });
        
        if (user) {
          userContact.email = userContact.email || user.email;
          userContact.phoneNumber = userContact.phoneNumber || user.phoneNumber || undefined;
        }
      }
      
      // Заповнюємо шаблон змінними
      let content = template.content;
      let subject = template.subject || '';
      
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
        if (subject) {
          subject = subject.replace(regex, value);
        }
      });
      
      // Відправляємо сповіщення відповідно до типу шаблону
      switch (template.type) {
        case NotificationType.EMAIL:
          if (!userContact.email) {
            logger.error(`Cannot send email notification: email not provided for user ${userId}`);
            return false;
          }
          return await this.sendEmailNotification(
            userId,
            userContact.email,
            subject,
            content,
            { priority: options?.priority }
          );
          
        case NotificationType.SMS:
          if (!userContact.phoneNumber) {
            logger.error(`Cannot send SMS notification: phone number not provided for user ${userId}`);
            return false;
          }
          return await this.sendSmsNotification(
            userId,
            userContact.phoneNumber,
            content,
            options?.priority
          );
          
        case NotificationType.PUSH:
          if (!options?.deviceToken) {
            logger.error(`Cannot send Push notification: device token not provided for user ${userId}`);
            return false;
          }
          return await this.sendPushNotification(
            userId,
            options.deviceToken,
            subject,
            content,
            undefined,
            options.priority
          );
          
        default:
          logger.error(`Unsupported notification type: ${template.type}`);
          return false;
      }
    } catch (error) {
      logger.error(`Failed to send template notification: ${error}`);
      return false;
    }
  }

  /**
   * Запуск обробника email сповіщень
   */
  async startEmailNotificationWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(EMAIL_QUEUE, async (content: any) => {
        try {
          const notification = content as EmailNotification;
          logger.info(`Processing email notification to ${notification.email}`);
          
          // Відправка email
          const success = await sendEmail({
            to: notification.email,
            subject: notification.subject,
            html: notification.content,
            attachments: notification.attachments,
          });
          
          if (!success) {
            throw new Error(`Failed to send email to ${notification.email}`);
          }
          
          // Можемо записати у базу даних, що повідомлення відправлено
          // ...
          
          logger.info(`Email sent to ${notification.email} successfully`);
        } catch (error) {
          logger.error(`Error sending email notification: ${error}`);
          throw error; // Повторно викидаємо помилку для nack
        }
      });
      
      logger.info('Email notification worker started');
    } catch (error) {
      logger.error(`Failed to start email notification worker: ${error}`);
      throw error;
    }
  }

  /**
   * Запуск обробника SMS сповіщень
   */
  async startSmsNotificationWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(SMS_QUEUE, async (content: any) => {
        try {
          const notification = content as SmsNotification;
          logger.info(`Processing SMS notification to ${notification.phoneNumber}`);
          
          // Тут має бути код для відправки SMS
          // Для прикладу, просто імітуємо відправку
          logger.info(`SMS would be sent to ${notification.phoneNumber} with message: ${notification.message}`);
          
          // Імітуємо успішну відправку
          await new Promise(resolve => setTimeout(resolve, 500));
          
          logger.info(`SMS sent to ${notification.phoneNumber} successfully`);
        } catch (error) {
          logger.error(`Error sending SMS notification: ${error}`);
          throw error;
        }
      });
      
      logger.info('SMS notification worker started');
    } catch (error) {
      logger.error(`Failed to start SMS notification worker: ${error}`);
      throw error;
    }
  }

  /**
   * Запуск обробника Push сповіщень
   */
  async startPushNotificationWorker(): Promise<void> {
    try {
      await rabbitmq.consumeQueue(PUSH_QUEUE, async (content: any) => {
        try {
          const notification = content as PushNotification;
          logger.info(`Processing Push notification to device ${notification.deviceToken}`);
          
          // Тут має бути код для відправки Push сповіщення
          // Для прикладу, просто імітуємо відправку
          logger.info(`Push notification would be sent to device ${notification.deviceToken}`);
          logger.info(`Title: ${notification.title}`);
          logger.info(`Body: ${notification.body}`);
          if (notification.data) {
            logger.info(`Data: ${JSON.stringify(notification.data)}`);
          }
          
          // Імітуємо успішну відправку
          await new Promise(resolve => setTimeout(resolve, 300));
          
          logger.info(`Push notification sent to device ${notification.deviceToken} successfully`);
        } catch (error) {
          logger.error(`Error sending Push notification: ${error}`);
          throw error;
        }
      });
      
      logger.info('Push notification worker started');
    } catch (error) {
      logger.error(`Failed to start Push notification worker: ${error}`);
      throw error;
    }
  }

  /**
   * Запуск всіх обробників сповіщень
   */
  async startAllWorkers(): Promise<void> {
    await this.startEmailNotificationWorker();
    await this.startSmsNotificationWorker();
    await this.startPushNotificationWorker();
    logger.info('All notification workers started');
  }
}

// Створюємо єдиний екземпляр сервісу
export const notificationService = new NotificationService();

// Експортуємо типи та перераховування
export { NotificationTemplate, Notification, EmailNotification, SmsNotification, PushNotification };