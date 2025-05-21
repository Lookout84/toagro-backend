import { Router } from 'express';
import { countriesController } from '../controllers/countriesController';
import { authenticate, isAdmin } from '../middleware/auth';

const router = Router();

// Публічний ендпоінт для отримання списку країн
router.get('/', countriesController.getCountries);

// Публічний ендпоінт для отримання країни за ID
router.get('/:id', countriesController.getCountryById);

// Адмінські ендпоінти для CRUD
router.post('/', authenticate, isAdmin, countriesController.createCountry);
router.put('/:id', authenticate, isAdmin, countriesController.updateCountry);
router.delete('/:id', authenticate, isAdmin, countriesController.deleteCountry);

export default router;