import { Router } from 'express';
import { queueController } from '../controllers/queueController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Всі маршрути вимагають прав адміністратора
router.use(authenticate, isAdmin);

// Схема валідації для тестового повідомлення
const testMessageSchema = z.object({
  body: z.object({
    message: z.object({}).passthrough() // Дозволяємо будь-які дані
  })
});

// Отримання статистики по чергах
router.get('/', queueController.getQueueStats);

// Отримання списку всіх черг
router.get('/list', queueController.listQueues);

// Очищення черги
router.delete('/:queueName/purge', queueController.purgeQueue);

// Видалення черги
router.delete('/:queueName', queueController.deleteQueue);

// Відправка тестового повідомлення в чергу
router.post('/:queueName/test', validate(testMessageSchema), queueController.sendTestMessage);

// Отримання повідомлень з черги
router.get('/:queueName/messages', queueController.getQueueMessages);

// Моніторинг споживачів
router.get('/consumers', queueController.getConsumers);

export default router;