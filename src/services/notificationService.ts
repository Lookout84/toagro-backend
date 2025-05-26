import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { sendEmail } from '../utils/emailSender';
import { config } from '../config/env';
import { prisma } from '../config/db';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import {
  Notification as PrismaNotification,
  NotificationType,
  NotificationPriority,
  Prisma,
} from '@prisma/client';

// Ініціалізація DOMPurify для санітизації HTML
const { window } = new JSDOM('');
const domPurify = DOMPurify(window);

// Константи для обміну та черг
const NOTIFICATION_EXCHANGE = 'notifications';
const EMAIL_QUEUE = 'email_notifications';
const SMS_QUEUE = 'sms_notifications';
const PUSH_QUEUE = 'push_notifications';
const DLX_SUFFIX = '_dlx';

// Ліміти
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_SMS_LENGTH = 160;
const MAX_QUEUE_LENGTH = 10000;
const DLX_MESSAGE_TTL = 86400000; // 24 години

interface Attachment {
  filename: string;
  path?: string;
  content?: string;
  encoding?: string;
  size?: number;
}

// Змінюємо на Record<string, unknown> для сумісності з Prisma.JsonValue
type NotificationMetadata = Record<string, unknown>;

interface BaseNotificationParams {
  userId: number;
  type: NotificationType;
  subject?: string;
  content: string;
  priority?: NotificationPriority;
  metadata?: NotificationMetadata;
  linkUrl?: string;
  attachments?: Attachment[];
}

interface EmailNotificationParams extends BaseNotificationParams {
  type: typeof NotificationType.EMAIL;
  email: string;
}

interface SmsNotificationParams extends BaseNotificationParams {
  type: typeof NotificationType.SMS;
  phoneNumber: string;
}

interface PushNotificationParams extends BaseNotificationParams {
  type: 'PUSH';
  deviceToken: string;
  title: string;
}

type NotificationParams =
  | EmailNotificationParams
  | SmsNotificationParams
  | PushNotificationParams;

interface NotificationTemplate {
  id: number;
  name: string;
  type: NotificationType;
  subject?: string;
  content: string;
  variables: string[];
}

class NotificationValidator {
  static validateEmail(params: EmailNotificationParams): void {
    if (!params.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
      throw new Error('Invalid email address');
    }

    if (params.attachments) {
      const totalSize = params.attachments.reduce((sum, attachment) => {
        return sum + (attachment.size || 0);
      }, 0);

      if (totalSize > MAX_ATTACHMENT_SIZE) {
        throw new Error(
          `Attachments total size exceeds limit of ${MAX_ATTACHMENT_SIZE} bytes`
        );
      }
    }
  }

  static validateSms(params: SmsNotificationParams): void {
    if (!params.phoneNumber || !/^\+?[\d\s-]+$/.test(params.phoneNumber)) {
      throw new Error('Invalid phone number');
    }

    if (params.content.length > MAX_SMS_LENGTH) {
      throw new Error(`SMS message too long, max ${MAX_SMS_LENGTH} characters`);
    }
  }

  static validatePush(params: PushNotificationParams): void {
    if (!params.deviceToken || params.deviceToken.length < 64) {
      throw new Error('Invalid device token');
    }
  }
}

class RateLimiter {
  constructor(
    private readonly limit: number,
    private readonly window: 'second' | 'minute' | 'hour',
    private readonly storage = new Map<
      string,
      { count: number; expiresAt: number }
    >()
  ) {}

  async check(key: string): Promise<boolean> {
    const now = Date.now();
    const windowMs = this.getWindowMs();

    this.storage.forEach((value, key) => {
      if (value.expiresAt <= now) {
        this.storage.delete(key);
      }
    });

    const record = this.storage.get(key) || {
      count: 0,
      expiresAt: now + windowMs,
    };

    if (record.count >= this.limit) {
      return false;
    }

    record.count++;
    this.storage.set(key, record);
    return true;
  }

  private getWindowMs(): number {
    switch (this.window) {
      case 'second':
        return 1000;
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }
}

class NotificationTemplateManager {
  private templates = new Map<string, NotificationTemplate>();

  async loadTemplates(): Promise<void> {
    try {
      const dbTemplates = await prisma.notificationTemplate.findMany();

      dbTemplates.forEach((template) => {
        this.templates.set(template.name, {
          id: template.id,
          name: template.name,
          type: template.type as NotificationType,
          subject: template.subject || undefined,
          content: template.content,
          variables: template.variables as string[],
        });
      });

      logger.info(`Loaded ${dbTemplates.length} notification templates`);
    } catch (error) {
      logger.error('Failed to load notification templates', { error });
      throw error;
    }
  }

  getTemplate(name: string): NotificationTemplate | undefined {
    return this.templates.get(name);
  }

  sanitizeContent(content: string, variables: Record<string, string>): string {
    let sanitized = content;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      sanitized = sanitized.replace(regex, value);
    });

    return domPurify.sanitize(sanitized);
  }
}

interface RabbitmqService {
  assertExchange(exchange: string, type: string, options?: any): Promise<any>;
  assertQueue(queue: string, options?: any): Promise<any>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<any>;
  publishToExchange(
    exchange: string,
    routingKey: string,
    content: any,
    options?: any
  ): Promise<boolean>;
  consumeQueue(
    queue: string,
    callback: (content: any) => Promise<void>
  ): Promise<void>;
}

class NotificationQueue {
  constructor(private readonly rabbitmq: RabbitmqService) {}

  async initialize(): Promise<void> {
    try {
      await this.rabbitmq.assertExchange(NOTIFICATION_EXCHANGE, 'topic', {
        durable: true,
        alternateExchange: 'notifications_fallback',
      });

      const queueOptions = {
        durable: true,
        deadLetterExchange: `${NOTIFICATION_EXCHANGE}${DLX_SUFFIX}`,
        maxLength: MAX_QUEUE_LENGTH,
      };

      await Promise.all([
        this.rabbitmq.assertQueue(EMAIL_QUEUE, queueOptions),
        this.rabbitmq.assertQueue(SMS_QUEUE, queueOptions),
        this.rabbitmq.assertQueue(PUSH_QUEUE, queueOptions),
        this.rabbitmq.bindQueue(
          EMAIL_QUEUE,
          NOTIFICATION_EXCHANGE,
          'notification.email'
        ),
        this.rabbitmq.bindQueue(
          SMS_QUEUE,
          NOTIFICATION_EXCHANGE,
          'notification.sms'
        ),
        this.rabbitmq.bindQueue(
          PUSH_QUEUE,
          NOTIFICATION_EXCHANGE,
          'notification.push'
        ),
        this.setupDeadLetterQueue(),
      ]);

      logger.info('Notification queues initialized');
    } catch (error) {
      logger.error('Failed to initialize notification queues', { error });
      throw error;
    }
  }

  private async setupDeadLetterQueue(): Promise<void> {
    const dlxExchange = `${NOTIFICATION_EXCHANGE}${DLX_SUFFIX}`;
    await this.rabbitmq.assertExchange(dlxExchange, 'direct', {
      durable: true,
    });

    const dlqOptions = { durable: true, messageTtl: DLX_MESSAGE_TTL };
    await Promise.all([
      this.rabbitmq.assertQueue(`${EMAIL_QUEUE}${DLX_SUFFIX}`, dlqOptions),
      this.rabbitmq.assertQueue(`${SMS_QUEUE}${DLX_SUFFIX}`, dlqOptions),
      this.rabbitmq.assertQueue(`${PUSH_QUEUE}${DLX_SUFFIX}`, dlqOptions),
      this.rabbitmq.bindQueue(
        `${EMAIL_QUEUE}${DLX_SUFFIX}`,
        dlxExchange,
        EMAIL_QUEUE
      ),
      this.rabbitmq.bindQueue(
        `${SMS_QUEUE}${DLX_SUFFIX}`,
        dlxExchange,
        SMS_QUEUE
      ),
      this.rabbitmq.bindQueue(
        `${PUSH_QUEUE}${DLX_SUFFIX}`,
        dlxExchange,
        PUSH_QUEUE
      ),
    ]);
  }

  async publish(notification: PrismaNotification): Promise<boolean> {
    const routingKey = this.getRoutingKey(notification.type);
    const options = this.getPublishOptions(notification);

    try {
      return await this.rabbitmq.publishToExchange(
        NOTIFICATION_EXCHANGE,
        routingKey,
        notification,
        options
      );
    } catch (error) {
      logger.error('Failed to publish notification', { error, notification });
      throw error;
    }
  }

  private getRoutingKey(type: NotificationType): string {
    return `notification.${type.toLowerCase()}`;
  }

  private getPublishOptions(notification: PrismaNotification): {
    priority?: number;
  } {
    return {
      priority:
        notification.priority === NotificationPriority.HIGH
          ? 10
          : notification.priority === NotificationPriority.LOW
            ? 1
            : 5,
    };
  }
}

class NotificationService {
  private readonly queue: NotificationQueue;
  private readonly templateManager: NotificationTemplateManager;
  private readonly rateLimiters: Map<NotificationType, RateLimiter>;

  constructor() {
    this.queue = new NotificationQueue(rabbitmq);
    this.templateManager = new NotificationTemplateManager();
    this.rateLimiters = new Map([
      [NotificationType.EMAIL, new RateLimiter(100, 'minute')],
      [NotificationType.SMS, new RateLimiter(10, 'minute')],
      [NotificationType.PUSH, new RateLimiter(1000, 'minute')],
    ]);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.queue.initialize(),
      this.templateManager.loadTemplates(),
    ]);
    logger.info('Notification service initialized');
  }

  async createNotification(
    params: BaseNotificationParams
  ): Promise<PrismaNotification> {
    try {
      // Правильне використання JsonValue для полів metadata та attachments
      let metadataJson: Prisma.JsonValue | undefined = undefined;
      let attachmentsJson: Prisma.JsonValue | undefined = undefined;

      if (params.metadata) {
        // Безпечне перетворення користувацьких даних на JsonValue
        metadataJson = this.convertToJsonValue(params.metadata);
      }

      if (params.attachments) {
        // Безпечне перетворення вкладень на JsonValue
        attachmentsJson = this.convertToJsonValue(params.attachments);
      }

      // Prisma expects undefined, not null, for optional JSON fields
      const notificationData: Prisma.NotificationCreateInput = {
        user: { connect: { id: params.userId } },
        type: params.type,
        subject: params.subject,
        content: params.content,
        priority: params.priority || NotificationPriority.NORMAL,
        metadata: metadataJson === null ? undefined : metadataJson,
        linkUrl: params.linkUrl,
        attachments: attachmentsJson === null ? undefined : attachmentsJson,
      };

      const notification = await prisma.notification.create({
        data: notificationData,
      });

      logger.info('Notification created', { notificationId: notification.id });
      return notification;
    } catch (error) {
      logger.error('Failed to create notification', { error, params });
      throw error;
    }
  }

  // Допоміжний метод для безпечного перетворення на JsonValue
  private convertToJsonValue(data: any): Prisma.JsonValue {
    try {
      // Спочатку перетворюємо на JSON і назад для видалення непідтримуваних типів
      const jsonString = JSON.stringify(data);
      return JSON.parse(jsonString);
    } catch (e) {
      logger.warn(
        'Failed to convert data to JsonValue, using empty object instead',
        { data }
      );
      return {};
    }
  }

  async sendNotification(
    params: NotificationParams
  ): Promise<PrismaNotification> {
    try {
      this.validateNotification(params);
      await this.checkRateLimit(params.type, params.userId);

      const notification = await this.createNotification(params);
      await this.queue.publish(notification);

      return notification;
    } catch (error) {
      logger.error('Failed to send notification', { error, params });
      throw error;
    }
  }

  async sendEmailNotification(
    params: Omit<EmailNotificationParams, 'type'>
  ): Promise<PrismaNotification> {
    const fullParams: EmailNotificationParams = {
      ...params,
      type: NotificationType.EMAIL,
    };

    return this.sendNotification(fullParams);
  }

  async sendSmsNotification(
    params: Omit<SmsNotificationParams, 'type'>
  ): Promise<PrismaNotification> {
    const fullParams: SmsNotificationParams = {
      ...params,
      type: NotificationType.SMS,
    };

    return this.sendNotification(fullParams);
  }

  async sendPushNotification(
    params: Omit<PushNotificationParams, 'type'>
  ): Promise<PrismaNotification> {
    const fullParams: PushNotificationParams = {
      ...params,
      type: NotificationType.PUSH,
    };

    return this.sendNotification(fullParams);
  }

  async sendTemplateNotification(
    templateName: string,
    userId: number,
    variables: Record<string, string>,
    options?: {
      email?: string;
      phoneNumber?: string;
      deviceToken?: string;
      priority?: NotificationPriority;
      metadata?: NotificationMetadata;
      linkUrl?: string;
    }
  ): Promise<PrismaNotification> {
    try {
      const template = this.templateManager.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      const userContact = await this.getUserContact(userId, options);
      const sanitizedContent = this.templateManager.sanitizeContent(
        template.content,
        variables
      );
      const sanitizedSubject = template.subject
        ? this.templateManager.sanitizeContent(template.subject, variables)
        : undefined;

      const baseParams = {
        userId,
        subject: sanitizedSubject,
        content: sanitizedContent,
        priority: options?.priority,
        metadata: options?.metadata,
        linkUrl: options?.linkUrl,
      };

      switch (template.type) {
        case NotificationType.EMAIL:
          if (!userContact.email) {
            throw new Error(`Email not provided for user ${userId}`);
          }
          return this.sendEmailNotification({
            ...baseParams,
            email: userContact.email,
          });

        case NotificationType.SMS:
          if (!userContact.phoneNumber) {
            throw new Error(`Phone number not provided for user ${userId}`);
          }
          return this.sendSmsNotification({
            ...baseParams,
            phoneNumber: userContact.phoneNumber,
          });

        case NotificationType.PUSH:
          if (!options?.deviceToken) {
            throw new Error(`Device token not provided for user ${userId}`);
          }
          return this.sendPushNotification({
            ...baseParams,
            deviceToken: options.deviceToken,
            title: sanitizedSubject || 'New notification',
          });

        default:
          throw new Error(`Unsupported notification type: ${template.type}`);
      }
    } catch (error) {
      logger.error('Failed to send template notification', {
        error,
        templateName,
        userId,
      });
      throw error;
    }
  }

  async markAsRead(notificationId: number): Promise<PrismaNotification> {
    try {
      const notification = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      logger.info('Notification marked as read', { notificationId });
      return notification;
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error,
        notificationId,
      });
      throw error;
    }
  }

  async startEmailNotificationWorker(): Promise<void> {
    await rabbitmq.consumeQueue(
      EMAIL_QUEUE,
      async (content: PrismaNotification) => {
        try {
          logger.info('Processing email notification', {
            notificationId: content.id,
          });

          // Безпечне отримання email з metadata
          const metadata = content.metadata as Record<string, unknown> | null;

          const email =
            metadata && typeof metadata === 'object' && 'email' in metadata
              ? String(metadata.email)
              : undefined;

          if (!email) {
            throw new Error(
              'Email address is missing in notification metadata'
            );
          }

          // Безпечне отримання вкладень
          const attachments = content.attachments
            ? (content.attachments as unknown as Attachment[])
            : undefined;

          const success = await sendEmail({
            to: email,
            subject: content.subject || '',
            html: content.content,
            attachments: Array.isArray(attachments) ? attachments : [],
          });

          if (!success) {
            throw new Error('Email sending failed');
          }

          await this.markAsSent(content.id);
          logger.info('Email sent successfully', {
            notificationId: content.id,
          });
        } catch (error) {
          logger.error('Failed to process email notification', {
            error,
            notificationId: content.id,
          });
          throw error;
        }
      }
    );

    logger.info('Email notification worker started');
  }

  async startSmsNotificationWorker(): Promise<void> {
    await rabbitmq.consumeQueue(
      SMS_QUEUE,
      async (content: PrismaNotification) => {
        try {
          logger.info('Processing SMS notification', {
            notificationId: content.id,
          });

          // Тут має бути реальний код відправки SMS
          await new Promise((resolve) => setTimeout(resolve, 500));

          await this.markAsSent(content.id);
          logger.info('SMS sent successfully', { notificationId: content.id });
        } catch (error) {
          logger.error('Failed to process SMS notification', {
            error,
            notificationId: content.id,
          });
          throw error;
        }
      }
    );

    logger.info('SMS notification worker started');
  }

  async startPushNotificationWorker(): Promise<void> {
    await rabbitmq.consumeQueue(
      PUSH_QUEUE,
      async (content: PrismaNotification) => {
        try {
          logger.info('Processing push notification', {
            notificationId: content.id,
          });

          // Тут має бути реальний код відправки Push
          await new Promise((resolve) => setTimeout(resolve, 300));

          await this.markAsSent(content.id);
          logger.info('Push notification sent successfully', {
            notificationId: content.id,
          });
        } catch (error) {
          logger.error('Failed to process push notification', {
            error,
            notificationId: content.id,
          });
          throw error;
        }
      }
    );

    logger.info('Push notification worker started');
  }

  async startAllWorkers(): Promise<void> {
    await Promise.all([
      this.startEmailNotificationWorker(),
      this.startSmsNotificationWorker(),
      this.startPushNotificationWorker(),
    ]);
    logger.info('All notification workers started');
  }

  private async markAsSent(notificationId: number): Promise<void> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { metadata: true },
      });

      // Безпечне оновлення metadata як JsonValue
      let updatedMetadata: Prisma.JsonValue = {
        sentAt: new Date().toISOString(),
      };

      if (notification?.metadata && typeof notification.metadata === 'object') {
        updatedMetadata = {
          ...notification.metadata,
          sentAt: new Date().toISOString(),
        };
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          metadata: updatedMetadata === null ? undefined : updatedMetadata,
        },
      });
    } catch (error) {
      logger.error('Failed to mark notification as sent', {
        error,
        notificationId,
      });
    }
  }

  private async getMetadata(
    notificationId: number
  ): Promise<NotificationMetadata | undefined> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { metadata: true },
    });

    // Безпечне повернення metadata як NotificationMetadata
    if (notification?.metadata && typeof notification.metadata === 'object') {
      return notification.metadata as NotificationMetadata;
    }
    return undefined;
  }

  private async getUserContact(
    userId: number,
    options?: { email?: string; phoneNumber?: string }
  ): Promise<{ email?: string; phoneNumber?: string }> {
    const contact = {
      email: options?.email,
      phoneNumber: options?.phoneNumber,
    };

    if (!contact.email || !contact.phoneNumber) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phoneNumber: true },
      });

      if (user) {
        contact.email = contact.email || user.email;
        contact.phoneNumber =
          contact.phoneNumber || user.phoneNumber || undefined;
      }
    }

    return contact;
  }

  private validateNotification(params: NotificationParams): void {
    switch (params.type) {
      case NotificationType.EMAIL:
        NotificationValidator.validateEmail(params);
        break;
      case NotificationType.SMS:
        NotificationValidator.validateSms(params);
        break;
      case NotificationType.PUSH:
        NotificationValidator.validatePush(params);
        break;
      default:
        this.assertNever(params);
    }
  }

  private assertNever(x: never): never {
    throw new Error(`Unsupported notification type: ${JSON.stringify(x)}`);
  }

  private async checkRateLimit(
    type: NotificationType,
    userId: number
  ): Promise<void> {
    const limiter = this.rateLimiters.get(type);
    if (!limiter) return;

    const key = `${type}:${userId}`;
    if (!(await limiter.check(key))) {
      throw new Error(`Rate limit exceeded for ${type} notifications`);
    }
  }
}

export const notificationService = new NotificationService();
export type {
  NotificationParams,
  EmailNotificationParams,
  SmsNotificationParams,
  PushNotificationParams,
  NotificationTemplate,
  Attachment,
  NotificationMetadata,
};
// import { rabbitmq } from '../utils/rabbitmq';
// import { logger } from '../utils/logger';
// import { sendEmail } from '../utils/emailSender';
// import { config } from '../config/env';
// import { prisma } from '../config/db';

// // Константи для обміну та черг
// const NOTIFICATION_EXCHANGE = 'notifications';
// const EMAIL_QUEUE = 'email_notifications';
// const SMS_QUEUE = 'sms_notifications';
// const PUSH_QUEUE = 'push_notifications';

// /**
//  * Типи сповіщень, що підтримуються системою
//  * Використовуємо типи з Prisma
//  */
// import { Prisma, NotificationType } from '@prisma/client';
// export { NotificationType };

// /**
//  * Рівні пріоритету сповіщень
//  */
// export enum NotificationPriority {
//   LOW = 'low',
//   NORMAL = 'normal',
//   HIGH = 'high',
// }

// interface CreateNotificationParams {
//   userId: number;
//   type: NotificationType;
//   title: string;
//   message: string;
//   data?: any;
// }
// /**
//  * Базовий інтерфейс для всіх сповіщень
//  */
// interface BaseNotification {
//   id?: string;
//   userId: number;
//   type: NotificationType;
//   priority?: NotificationPriority;
//   createdAt?: string;
// }

// /**
//  * Інтерфейс для email сповіщень
//  */
// interface EmailNotification extends BaseNotification {
//   type: "EMAIL";
//   email: string;
//   subject: string;
//   content: string;
//   attachments?: Array<{
//     filename: string;
//     path?: string;       // Для файлів на диску
//     content?: string;
//     encoding?: string;
//   }>;
// }

// /**
//  * Інтерфейс для SMS сповіщень
//  */
// interface SmsNotification extends BaseNotification {
//   type: "SMS";
//   phoneNumber: string;
//   message: string;
// }

// /**
//  * Інтерфейс для Push сповіщень
//  */
// interface PushNotification extends BaseNotification {
//   type: "PUSH";
//   deviceToken: string;
//   title: string;
//   body: string;
//   data?: Record<string, any>;
// }

// /**
//  * Об'єднаний тип сповіщень
//  */
// type Notification = EmailNotification | SmsNotification | PushNotification;

// /**
//  * Інтерфейс для шаблону сповіщення
//  */
// interface NotificationTemplate {
//   id: number;
//   name: string;
//   type: NotificationType;
//   title?: string; // Додаткове поле для заголовка, якщо потрібно
//   subject?: string;
//   content: string;
//   variables: string[];
// }

// /**
//  * Сервіс для роботи з сповіщеннями
//  */
// class NotificationService {
//   /**
//    * Шаблони сповіщень, кешовані для швидкого доступу
//    */
//   private templates: Map<string, NotificationTemplate> = new Map();
// /**
//    * Створення нового сповіщення
//    */
//   async createNotification(params: CreateNotificationParams): Promise<any> {
//     try {
//       const { userId, type, title, message, data } = params;

//       logger.info(`Creating notification for user ${userId} of type ${type}`);

//       // Створення запису в базі даних
//       const notification = await prisma.notification.create({
//         data: {
//           userId,
//           type,
//           title,
//           message,
//           data,
//           isRead: false,
//         },
//       });

//       // Тут можна додати код для відправки через RabbitMQ, якщо потрібно

//       return notification;
//     } catch (error: any) {
//       logger.error(`Failed to create notification: ${error.message}`);
//       throw error;
//     }
//   }
//   /**
//    * Ініціалізація сервісу сповіщень
//    */
//   async initializeNotifications(): Promise<void> {
//     try {
//       // Налаштування обміну типу "topic"
//       await rabbitmq.assertExchange(NOTIFICATION_EXCHANGE, 'topic');

//       // Налаштування черг
//       await rabbitmq.assertQueue(EMAIL_QUEUE, { durable: true });
//       await rabbitmq.assertQueue(SMS_QUEUE, { durable: true });
//       await rabbitmq.assertQueue(PUSH_QUEUE, { durable: true });

//       // Прив'язка черг до обміну
//       await rabbitmq.bindQueue(EMAIL_QUEUE, NOTIFICATION_EXCHANGE, 'notification.email');
//       await rabbitmq.bindQueue(SMS_QUEUE, NOTIFICATION_EXCHANGE, 'notification.sms');
//       await rabbitmq.bindQueue(PUSH_QUEUE, NOTIFICATION_EXCHANGE, 'notification.push');

//       // Завантаження шаблонів сповіщень з бази даних (якщо є)
//       await this.loadTemplates();

//       logger.info('Notification queues and exchanges initialized');
//     } catch (error) {
//       logger.error(`Failed to initialize notification service: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Завантаження шаблонів сповіщень з бази даних
//    */
//   private async loadTemplates(): Promise<void> {
//     try {
//       // Тут має бути код для завантаження шаблонів з бази даних
//       // Для прикладу, створимо кілька базових шаблонів

//       const defaultTemplates: NotificationTemplate[] = [
//         {
//           id: 1,
//           name: 'welcome_email',
//           type: NotificationType.EMAIL,
//           subject: 'Ласкаво просимо до ToAgro!',
//           content: '<h1>Вітаємо, {{name}}!</h1><p>Ми раді, що ви приєдналися до спільноти ToAgro!</p>',
//           variables: ['name'],
//         },
//         {
//           id: 2,
//           name: 'new_message',
//           type: NotificationType.EMAIL,
//           subject: 'Нове повідомлення на ToAgro',
//           content: '<h1>Привіт, {{name}}!</h1><p>Ви отримали нове повідомлення від {{senderName}}.</p>',
//           variables: ['name', 'senderName'],
//         },
//         {
//           id: 3,
//           name: 'listing_created',
//           type: NotificationType.EMAIL,
//           subject: 'Ваше оголошення створено',
//           content: '<h1>Привіт, {{name}}!</h1><p>Ваше оголошення "{{listingTitle}}" успішно опубліковано.</p>',
//           variables: ['name', 'listingTitle'],
//         },
//       ];

//       // Кешуємо шаблони для швидкого доступу
//       defaultTemplates.forEach(template => {
//         this.templates.set(template.name, template);
//       });

//       logger.info(`Loaded ${defaultTemplates.length} notification templates`);
//     } catch (error) {
//       logger.error(`Failed to load notification templates: ${error}`);
//     }
//   }

//   /**
//    * Відправка сповіщення в чергу
//    */
//   async sendNotification(notification: Notification): Promise<boolean> {
//     try {
//       // Додаємо додаткові дані
//       const enrichedNotification = {
//         ...notification,
//         id: notification.id || `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
//         priority: notification.priority || NotificationPriority.NORMAL,
//         createdAt: notification.createdAt || new Date().toISOString(),
//       };

//       // Визначаємо маршрутний ключ залежно від типу сповіщення
//       let routingKey = '';

//       switch (notification.type) {
//         case NotificationType.EMAIL:
//           routingKey = 'notification.email';
//           break;
//         case NotificationType.SMS:
//           routingKey = 'notification.sms';
//           break;
//         case NotificationType.PUSH:
//           routingKey = 'notification.push';
//           break;
//       }

//       // Відправляємо в чергу
//       const result = await rabbitmq.publishToExchange(
//         NOTIFICATION_EXCHANGE,
//         routingKey,
//         enrichedNotification,
//         // Для високопріоритетних повідомлень встановлюємо відповідний пріоритет
//         enrichedNotification.priority === NotificationPriority.HIGH ? { priority: 10 } : undefined
//       );

//       logger.info(
//         `Notification ${enrichedNotification.id} sent to queue with routing key ${routingKey}`
//       );

//       return result;
//     } catch (error) {
//       logger.error(`Failed to send notification: ${error}`);
//       return false;
//     }
//   }

//   /**
//    * Відправка email сповіщення
//    */
//   async sendEmailNotification(
//     userId: number,
//     email: string,
//     subject: string,
//     content: string,
//     options?: {
//       priority?: NotificationPriority;
//       attachments?: EmailNotification['attachments'];
//     }
//   ): Promise<boolean> {
//     const notification: EmailNotification = {
//       userId,
//       type: NotificationType.EMAIL,
//       email,
//       subject,
//       content,
//       priority: options?.priority,
//       attachments: options?.attachments,
//     };

//     return await this.sendNotification(notification);
//   }

//   /**
//    * Відправка SMS сповіщення
//    */
//   async sendSmsNotification(
//     userId: number,
//     phoneNumber: string,
//     message: string,
//     priority?: NotificationPriority
//   ): Promise<boolean> {
//     const notification: SmsNotification = {
//       userId,
//       type: NotificationType.SMS,
//       phoneNumber,
//       message,
//       priority,
//     };

//     return await this.sendNotification(notification);
//   }

//   /**
//    * Відправка Push сповіщення
//    */
//   async sendPushNotification(
//     userId: number,
//     deviceToken: string,
//     title: string,
//     body: string,
//     data?: Record<string, any>,
//     priority?: NotificationPriority
//   ): Promise<boolean> {
//     const notification: PushNotification = {
//       userId,
//       type: NotificationType.PUSH,
//       deviceToken,
//       title,
//       body,
//       data,
//       priority,
//     };

//     return await this.sendNotification(notification);
//   }

//   /**
//    * Відправка сповіщення за шаблоном
//    */
//   async sendTemplateNotification(
//     templateName: string,
//     userId: number,
//     variables: Record<string, string>,
//     options?: {
//       email?: string;
//       phoneNumber?: string;
//       deviceToken?: string;
//       priority?: NotificationPriority;
//     }
//   ): Promise<boolean> {
//     try {
//       // Отримуємо шаблон
//       const template = this.templates.get(templateName);

//       if (!template) {
//         logger.error(`Template ${templateName} not found`);
//         return false;
//       }

//       // Якщо email не вказано, намагаємося отримати з бази даних
//       let userContact: { email?: string; phoneNumber?: string } = {
//         email: options?.email,
//         phoneNumber: options?.phoneNumber,
//       };

//       if (!userContact.email || !userContact.phoneNumber) {
//         const user = await prisma.user.findUnique({
//           where: { id: userId },
//           select: { email: true, phoneNumber: true },
//         });

//         if (user) {
//           userContact.email = userContact.email || user.email;
//           userContact.phoneNumber = userContact.phoneNumber || user.phoneNumber || undefined;
//         }
//       }

//       // Заповнюємо шаблон змінними
//       let content = template.content;
//       let subject = template.subject || '';

//       Object.entries(variables).forEach(([key, value]) => {
//         const regex = new RegExp(`{{${key}}}`, 'g');
//         content = content.replace(regex, value);
//         if (subject) {
//           subject = subject.replace(regex, value);
//         }
//       });

//       // Відправляємо сповіщення відповідно до типу шаблону
//       switch (template.type) {
//         case NotificationType.EMAIL:
//           if (!userContact.email) {
//             logger.error(`Cannot send email notification: email not provided for user ${userId}`);
//             return false;
//           }
//           return await this.sendEmailNotification(
//             userId,
//             userContact.email,
//             subject,
//             content,
//             { priority: options?.priority }
//           );

//         case NotificationType.SMS:
//           if (!userContact.phoneNumber) {
//             logger.error(`Cannot send SMS notification: phone number not provided for user ${userId}`);
//             return false;
//           }
//           return await this.sendSmsNotification(
//             userId,
//             userContact.phoneNumber,
//             content,
//             options?.priority
//           );

//         case NotificationType.PUSH:
//           if (!options?.deviceToken) {
//             logger.error(`Cannot send Push notification: device token not provided for user ${userId}`);
//             return false;
//           }
//           return await this.sendPushNotification(
//             userId,
//             options.deviceToken,
//             subject,
//             content,
//             undefined,
//             options.priority
//           );

//         default:
//           logger.error(`Unsupported notification type: ${template.type}`);
//           return false;
//       }
//     } catch (error) {
//       logger.error(`Failed to send template notification: ${error}`);
//       return false;
//     }
//   }

//   /**
//    * Запуск обробника email сповіщень
//    */
//   async startEmailNotificationWorker(): Promise<void> {
//     try {
//       await rabbitmq.consumeQueue(EMAIL_QUEUE, async (content: any) => {
//         try {
//           const notification = content as EmailNotification;
//           logger.info(`Processing email notification to ${notification.email}`);

//           // Відправка email
//           const success = await sendEmail({
//             to: notification.email,
//             subject: notification.subject,
//             html: notification.content,
//             attachments: notification.attachments,
//           });

//           if (!success) {
//             throw new Error(`Failed to send email to ${notification.email}`);
//           }

//           // Можемо записати у базу даних, що повідомлення відправлено
//           // ...

//           logger.info(`Email sent to ${notification.email} successfully`);
//         } catch (error) {
//           logger.error(`Error sending email notification: ${error}`);
//           throw error; // Повторно викидаємо помилку для nack
//         }
//       });

//       logger.info('Email notification worker started');
//     } catch (error) {
//       logger.error(`Failed to start email notification worker: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Запуск обробника SMS сповіщень
//    */
//   async startSmsNotificationWorker(): Promise<void> {
//     try {
//       await rabbitmq.consumeQueue(SMS_QUEUE, async (content: any) => {
//         try {
//           const notification = content as SmsNotification;
//           logger.info(`Processing SMS notification to ${notification.phoneNumber}`);

//           // Тут має бути код для відправки SMS
//           // Для прикладу, просто імітуємо відправку
//           logger.info(`SMS would be sent to ${notification.phoneNumber} with message: ${notification.message}`);

//           // Імітуємо успішну відправку
//           await new Promise(resolve => setTimeout(resolve, 500));

//           logger.info(`SMS sent to ${notification.phoneNumber} successfully`);
//         } catch (error) {
//           logger.error(`Error sending SMS notification: ${error}`);
//           throw error;
//         }
//       });

//       logger.info('SMS notification worker started');
//     } catch (error) {
//       logger.error(`Failed to start SMS notification worker: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Запуск обробника Push сповіщень
//    */
//   async startPushNotificationWorker(): Promise<void> {
//     try {
//       await rabbitmq.consumeQueue(PUSH_QUEUE, async (content: any) => {
//         try {
//           const notification = content as PushNotification;
//           logger.info(`Processing Push notification to device ${notification.deviceToken}`);

//           // Тут має бути код для відправки Push сповіщення
//           // Для прикладу, просто імітуємо відправку
//           logger.info(`Push notification would be sent to device ${notification.deviceToken}`);
//           logger.info(`Title: ${notification.title}`);
//           logger.info(`Body: ${notification.body}`);
//           if (notification.data) {
//             logger.info(`Data: ${JSON.stringify(notification.data)}`);
//           }

//           // Імітуємо успішну відправку
//           await new Promise(resolve => setTimeout(resolve, 300));

//           logger.info(`Push notification sent to device ${notification.deviceToken} successfully`);
//         } catch (error) {
//           logger.error(`Error sending Push notification: ${error}`);
//           throw error;
//         }
//       });

//       logger.info('Push notification worker started');
//     } catch (error) {
//       logger.error(`Failed to start Push notification worker: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Запуск всіх обробників сповіщень
//    */
//   async startAllWorkers(): Promise<void> {
//     await this.startEmailNotificationWorker();
//     await this.startSmsNotificationWorker();
//     await this.startPushNotificationWorker();
//     logger.info('All notification workers started');
//   }
// }

// // Створюємо єдиний екземпляр сервісу
// export const notificationService = new NotificationService();

// // Експортуємо типи та перераховування
// export { NotificationTemplate, Notification, EmailNotification, SmsNotification, PushNotification };
