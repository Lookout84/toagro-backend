import { Router } from 'express';
import { categoryController } from '../controllers/categoryController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  categoryFilterSchema
} from '../schemas/categorySchema';

const router = Router();

// Публічні маршрути з обмеженням частоти запитів
router.get('/', apiLimiter, validate(categoryFilterSchema), categoryController.getCategories);
router.get('/tree', apiLimiter, categoryController.getCategoryTree);
router.get('/:id', apiLimiter, validate(getCategorySchema), categoryController.getCategory);
router.get('/slug/:slug', apiLimiter, categoryController.getCategoryBySlug);

// Захищені маршрути (тільки для адміністраторів)
router.use(authenticate, isAdmin);
router.post('/', validate(createCategorySchema), categoryController.createCategory);
router.put('/:id', validate(updateCategorySchema), categoryController.updateCategory);
router.delete('/:id', validate(getCategorySchema), categoryController.deleteCategory);

export default router;