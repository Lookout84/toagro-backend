import { z } from 'zod';
import { NotificationPriority } from '../services/notificationService';

export const userFilterSchema = z.object({
  body: z.object({
    filter: z.object({
      role: z.string().optional(),
      isVerified: z.boolean().optional(),
      createdBefore: z.string().optional(),
      createdAfter: z.string().optional(),
      categoryIds: z.array(z.number()).optional(),
      lastLoginBefore: z.string().optional(),
      lastLoginAfter: z.string().optional(),
      hasListings: z.boolean().optional(),
      specificIds: z.array(z.number()).optional(),
    }).optional(),
  }),
});

export const bulkEmailNotificationSchema = z.object({
  body: z.object({
    subject: z.string().min(1, 'Тема не може бути порожньою'),
    content: z.string().min(1, 'Контент не може бути порожнім'),
    userFilter: userFilterSchema.shape.body.shape.filter.optional(),
    templateName: z.string().optional(),
    templateVariables: z.record(z.string(), z.string()).optional(),
    priority: z.enum([
      NotificationPriority.LOW, NotificationPriority.NORMAL, NotificationPriority.HIGH
    ], {
      errorMap: () => ({ message: 'Невірний пріоритет' })
    }).optional(),
  }),
});

export const bulkSmsNotificationSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Контент не може бути порожнім').max(160, 'SMS повідомлення не може бути довшим за 160 символів'),
    userFilter: userFilterSchema.shape.body.shape.filter.optional(),
    priority: z.enum([
      NotificationPriority.LOW, NotificationPriority.NORMAL, NotificationPriority.HIGH
    ], {
      errorMap: () => ({ message: 'Невірний пріоритет' })
    }).optional(),
  }),
});

export const bulkPushNotificationSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Заголовок не може бути порожнім'),
    content: z.string().min(1, 'Контент не може бути порожнім'),
    userFilter: userFilterSchema.shape.body.shape.filter.optional(),
    priority: z.enum([
      NotificationPriority.LOW, NotificationPriority.NORMAL, NotificationPriority.HIGH
    ], {
      errorMap: () => ({ message: 'Невірний пріоритет' })
    }).optional(),
  }),
});