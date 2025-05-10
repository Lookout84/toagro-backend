import { Router } from 'express';
import { listingController } from '../controllers/listingController';
import { authenticate, isOwnerOrAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  createListingSchema,
  updateListingSchema,
  listingQuerySchema
} from '../schemas/listingSchema';

const router = Router();

// Public routes with rate limiting
router.get('/', apiLimiter, validate(listingQuerySchema), listingController.getListings);
router.get('/:id', apiLimiter, listingController.getListing);

// Protected routes
router.use(authenticate);
router.post('/', validate(createListingSchema), listingController.createListing);
router.put(
  '/:id',
  validate(updateListingSchema._def.schema || updateListingSchema),
  isOwnerOrAdmin,
  listingController.updateListing
);
router.delete('/:id', isOwnerOrAdmin, listingController.deleteListing);
router.get('/user/me', listingController.getUserListings);

router.post('/test-no-validation', (req, res) => {
  try {
    // Логуємо все, що прийшло
    console.log('=== TEST ENDPOINT ===');
    console.log('Headers:', req.headers);
    console.log('Raw Body:', req.body);
    console.log('Content-Type:', req.headers['content-type']);
    
    // Повертаємо отримані дані
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

// Додайте цей маршрут
router.post('/create-direct', authenticate, listingController.createListingDirect);
// Додайте цей маршрут (без складної валідації)
router.post('/create-simple', authenticate, listingController.createListingSimple);

export default router;