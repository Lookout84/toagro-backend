import express from 'express';
import { moderationController } from '../controllers/moderationController';
import { authenticateUser, requireModeratorOrAdmin } from '../middleware/auth';

const router = express.Router();

// Всі маршрути потребують аутентифікації та ролі модератора або адміністратора
router.use(authenticateUser, requireModeratorOrAdmin);

// Маршрути для модерації оголошень
router.get('/listings', moderationController.getListingsForModeration);
router.post('/listings/:id/approve', moderationController.approveListing);
router.post('/listings/:id/reject', moderationController.rejectListing);

// Маршрути для модерації компаній
router.post('/companies/:id/verify', moderationController.verifyCompany);

export default router;