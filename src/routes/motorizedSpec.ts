import { Router } from 'express';
import { motorizedSpecController } from '../controllers/motorizedSpecController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:listingId', motorizedSpecController.getByListing);
router.post('/:listingId', authenticate, motorizedSpecController.createOrUpdate);
router.put('/:listingId', authenticate, motorizedSpecController.createOrUpdate);
router.delete('/:listingId', authenticate, motorizedSpecController.delete);

export default router;