import express from 'express';
import { listingController } from '../controllers/listingController';
import { authenticate } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Діагностичні маршрути для тестування
router.post('/test-no-validation', (req, res) => {
  try {
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Content-Type:', req.headers['content-type']);

    res.status(200).json({
      status: 'success',
      message: 'Дані отримано успішно (без валідації)',
      receivedData: req.body,
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Помилка в тестовому ендпоінті',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Публічні маршрути
router.get('/', apiLimiter, listingController.getListings);
router.get('/:id', apiLimiter, listingController.getListing);

// Захищені маршрути (потрібна авторизація)
router.post('/', authenticate, listingController.createListing);
router.put('/:id', authenticate, listingController.updateListing);
router.delete('/:id', authenticate, listingController.deleteListing);
router.get('/user/me', authenticate, listingController.getUserListings);
router.post(
  '/listings/:id/favorite',
  authenticate,
  listingController.toggleFavorite
);

// Отримання списку обраних оголошень
router.get(
  '/favorites',
  authenticate,
  listingController.getFavorites
);


export default router;