import { Router } from 'express';
import { listingController } from '../controllers/listingController';
import { authenticate, isOwnerOrAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  createListingSchema,
  updateListingSchema,
  listingFilterSchema
} from '../schemas/listingSchema';

const router = Router();

// Public routes with rate limiting
router.get('/', apiLimiter, validate(listingFilterSchema), listingController.getListings);
router.get('/:id', apiLimiter, listingController.getListing);

// Protected routes
router.use(authenticate);
router.post('/', validate(createListingSchema), listingController.createListing);
router.put('/:id', validate(updateListingSchema), isOwnerOrAdmin, listingController.updateListing);
router.delete('/:id', isOwnerOrAdmin, listingController.deleteListing);
router.get('/user/me', listingController.getUserListings);

export default router;