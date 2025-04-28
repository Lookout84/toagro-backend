import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authenticate, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// All admin routes require authentication and admin privileges
router.use(authenticate, isAdmin);

// Update user role schema
const updateUserRoleSchema = z.object({
  body: z.object({
    role: z.enum(['USER', 'ADMIN']),
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

// Routes
router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/role', validate(updateUserRoleSchema), adminController.updateUserRole);
router.get('/listings', adminController.getAllListings);
router.get('/payments', adminController.getAllPayments);
router.get('/categories', adminController.getAllCategories);

export default router;