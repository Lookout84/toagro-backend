import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { 
  sendNotificationSchema, 
  sendTemplateNotificationSchema,
  sendTestNotificationSchema
} from '../schemas/notificationSchema';

const router = Router();

// Тестові маршрути (доступні для автентифікованих користувачів)
router.use(authenticate);
router.post('/test-email', validate(sendTestNotificationSchema), notificationController.sendTestEmail);
router.post('/test-sms', validate(sendTestNotificationSchema), notificationController.sendTestSms);
router.post('/test-push', validate(sendTestNotificationSchema), notificationController.sendTestPush);

// Налаштування користувача (підписки, налаштування сповіщень)
router.get('/settings', notificationController.getUserSettings);
router.put('/settings', notificationController.updateUserSettings);
router.get('/preferences', notificationController.getUserPreferences);
router.put('/preferences', notificationController.updateUserPreferences);

// Історія сповіщень
router.get('/history', notificationController.getNotificationHistory);
router.get('/history/:id', notificationController.getNotificationDetails);
router.delete('/history/:id', notificationController.deleteNotification);
router.post('/history/read', notificationController.markAllAsRead);
router.post('/history/:id/read', notificationController.markAsRead);

// Адміністративні маршрути
router.use(isAdmin);
router.post('/send', validate(sendNotificationSchema), notificationController.sendNotification);
router.post('/send-template', validate(sendTemplateNotificationSchema), notificationController.sendTemplateNotification);
router.get('/templates', notificationController.getTemplates);
router.get('/templates/:id', notificationController.getTemplate);
router.post('/templates', notificationController.createTemplate);
router.put('/templates/:id', notificationController.updateTemplate);
router.delete('/templates/:id', notificationController.deleteTemplate);

export default router;