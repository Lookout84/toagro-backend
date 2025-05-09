import express from 'express';
import { brandController } from '../controllers/brandController';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/roleCheck';

const router = express.Router();

// Публічні маршрути (доступні всім)
router.get('/', brandController.getBrands);
router.get('/popular', brandController.getPopularBrands);
router.get('/:idOrSlug', brandController.getBrand);

// Маршрути, що потребують прав адміністратора
router.post('/', authenticate, isAdmin, brandController.createBrand);
router.put('/:id', authenticate, isAdmin, brandController.updateBrand);
router.delete('/:id', authenticate, isAdmin, brandController.deleteBrand);

export default router;