import { Router } from 'express';
import { brandController } from '../controllers/brandController';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Публічні маршрути (доступні всім)
router.get('/all', apiLimiter, brandController.getAllBrands);
router.get('/', apiLimiter, brandController.getBrands);
router.get('/popular', apiLimiter, brandController.getPopularBrands);
router.get('/:idOrSlug', apiLimiter, brandController.getBrand);

// Маршрути, що потребують прав адміністратора
router.use(authenticate, isAdmin);
router.post('/', authenticate, isAdmin, brandController.createBrand);
router.put('/:id', authenticate, isAdmin, brandController.updateBrand);
router.delete('/:id', authenticate, isAdmin, brandController.deleteBrand);

export default router;
