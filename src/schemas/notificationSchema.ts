import { z } from 'zod';
import { NotificationType, NotificationPriority } from '../services/notificationService';

export const sendNotificationSchema = z.object({
  body: z.object({
    userId: z.number().int().positive('ID користувача повинен бути позитивним числом'),
    type: z.enum([NotificationType.EMAIL, NotificationType.SMS, NotificationType.PUSH], {
      errorMap: () => ({ message: 'Невірний тип сповіщення' })
    }),
    subject: z.string().min(1, 'Тема не може бути порожньою').optional(),
    content: z.string().min(1, 'Контент не може бути порожнім'),
    email: z.string().email('Невірний формат email').optional(),
    phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, 'Невірний формат номера телефону').optional(),
    deviceToken: z.string().optional(),
    priority: z.enum([
      NotificationPriority.LOW, NotificationPriority.NORMAL, NotificationPriority.HIGH
    ], {
      errorMap: () => ({ message: 'Невірний пріоритет' })
    }).optional(),
  }).refine(data => {
    // Перевіряємо, що поля відповідають типу сповіщення
    if (data.type === NotificationType.EMAIL && !data.email) {
      return false;
    }
    if (data.type === NotificationType.SMS && !data.phoneNumber) {
      return false;
    }
    if (data.type === NotificationType.PUSH && !data.deviceToken) {
      return false;
    }
    return true;
  }, {
    message: 'Не вказані необхідні поля для обраного типу сповіщення',
    path: ['type'],
  }),
});

export const sendTemplateNotificationSchema = z.object({
  body: z.object({
    userId: z.number().int().positive('ID користувача повинен бути позитивним числом'),
    templateName: z.string().min(1, 'Назва шаблону не може бути порожньою'),
    variables: z.record(z.string(), z.string()).optional(),
    email: z.string().email('Невірний формат email').optional(),
    phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, 'Невірний формат номера телефону').optional(),
    deviceToken: z.string().optional(),
    priority: z.enum([
      NotificationPriority.LOW, NotificationPriority.NORMAL, NotificationPriority.HIGH
    ], {
      errorMap: () => ({ message: 'Невірний пріоритет' })
    }).optional(),
  }),
});

export const sendTestNotificationSchema = z.object({
  body: z.object({
    deviceToken: z.string().optional(),
  }),
});