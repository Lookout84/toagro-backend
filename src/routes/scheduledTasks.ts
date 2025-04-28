import { Router } from 'express';
import { scheduledTaskController } from '../controllers/scheduledTaskController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { 
  scheduleTaskSchema,
  scheduleBatchTasksSchema,
  scheduleRecurringTaskSchema
} from '../schemas/scheduledTaskSchema';

const router = Router();

// Усі маршрути вимагають автентифікації
router.use(authenticate);

// Маршрути для користувачів
router.get('/listing/:id/schedule-deactivation', scheduledTaskController.scheduleListingDeactivation);
router.get('/payment/:id/reminder', scheduledTaskController.schedulePaymentReminder);

// Маршрути для адміністраторів
router.use(isAdmin);
router.post('/task', validate(scheduleTaskSchema), scheduledTaskController.scheduleTask);
router.post('/batch', validate(scheduleBatchTasksSchema), scheduledTaskController.scheduleBatchTasks);
router.post('/recurring', validate(scheduleRecurringTaskSchema), scheduledTaskController.scheduleRecurringTask);
router.get('/', scheduledTaskController.getTasks);
router.get('/:id', scheduledTaskController.getTask);
router.delete('/:id', scheduledTaskController.cancelTask);
router.get('/types', scheduledTaskController.getTaskTypes);
router.get('/recurring', scheduledTaskController.getRecurringTasks);
router.delete('/recurring/:id', scheduledTaskController.cancelRecurringTask);

export default router;