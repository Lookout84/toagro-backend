import { Router } from 'express';
import { bulkNotificationController } from '../controllers/bulkNotificationController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { 
  bulkEmailNotificationSchema,
  bulkSmsNotificationSchema,
  bulkPushNotificationSchema,
  userFilterSchema
} from '../schemas/bulkNotificationSchema';

const router = Router();

// Всі маршрути для масових розсилок вимагають прав адміністратора
router.use(authenticate, isAdmin);

// Маршрути для масових розсилок
router.post('/email', validate(bulkEmailNotificationSchema), bulkNotificationController.sendBulkEmail);
router.post('/sms', validate(bulkSmsNotificationSchema), bulkNotificationController.sendBulkSms);
router.post('/push', validate(bulkPushNotificationSchema), bulkNotificationController.sendBulkPush);

// Маршрути для управління завданнями масових розсилок
router.get('/tasks', bulkNotificationController.getTasks);
router.get('/tasks/:id', bulkNotificationController.getTaskStatus);
router.delete('/tasks/:id', bulkNotificationController.cancelTask);

// Допоміжні маршрути
router.get('/active-jobs', bulkNotificationController.getActiveJobs);
router.post('/filter-users', validate(userFilterSchema), bulkNotificationController.previewFilteredUsers);

export default router;