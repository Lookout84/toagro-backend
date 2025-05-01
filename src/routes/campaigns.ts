import { Router } from 'express';
import { campaignController } from '../controllers/campaignController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { campaignValidation } from '../schemas/campaignSchema';

const router = Router();

// Всі маршрути вимагають автентифікації
router.use(authenticate);

// Маршрути доступні всім автентифікованим користувачам
router.get('/types', campaignController.getCampaignTypes);
router.get('/statuses', campaignController.getCampaignStatuses);

// Отримання списку кампаній (фільтрація по створювачу відбувається у контролері)
router.get('/', campaignController.getCampaigns);

// Отримання конкретної кампанії (перевірка прав доступу відбувається у сервісі)
router.get('/:id', campaignController.getCampaign);

// Аналітика кампанії
router.get('/:id/analytics', campaignController.getCampaignAnalytics);

// Створення тестової кампанії
router.post('/test', campaignController.createTestCampaign);

// Створення нової кампанії
router.post('/', validate(campaignValidation.createCampaignSchema), campaignController.createCampaign);

// Дублювання існуючої кампанії
router.post('/:id/duplicate', campaignController.duplicateCampaign);

// Оновлення існуючої кампанії
router.put('/:id', validate(campaignValidation.updateCampaignSchema), campaignController.updateCampaign);

// Управління статусом кампанії
router.post('/:id/activate', campaignController.activateCampaign);
router.post('/:id/pause', campaignController.pauseCampaign);
router.post('/:id/cancel', campaignController.cancelCampaign);

// Запуск розсилки для кампанії
router.post('/:id/messages', validate(campaignValidation.startMessagesSchema), campaignController.startCampaignMessages);

// Видалення кампанії
router.delete('/:id', campaignController.deleteCampaign);

export default router;