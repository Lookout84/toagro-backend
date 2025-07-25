import { Router } from 'express';
import { testController } from '../controllers/testController';
import { upload } from '../utils/fileUpload';

const router = Router();

/**
 * @swagger
 * /api/test/geolocation:
 *   post:
 *     summary: Тестовий endpoint для перевірки геолокаційних даних
 *     tags: [Test]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: userGeolocation
 *         type: string
 *         description: Геолокація користувача (JSON)
 *       - in: formData
 *         name: mapLocation
 *         type: string
 *         description: Дані з карти (JSON)
 *       - in: formData
 *         name: location
 *         type: string
 *         description: Локація (JSON)
 *       - in: formData
 *         name: title
 *         type: string
 *         description: Назва тесту
 *     responses:
 *       200:
 *         description: Дані успішно отримано
 *       500:
 *         description: Помилка сервера
 */
router.post('/geolocation', upload.array('images'), testController.testGeolocation);

export default router;
