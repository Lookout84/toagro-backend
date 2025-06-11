import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import {scheduledTaskController} from '../controllers/scheduledTaskController';
import {categoryController} from '../controllers/categoryController';
import { authenticate, isAdmin, requireAdmin } from '../middleware/auth';
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
// router.get('/categories/:id', categoryController.getCategoryById);
router.post('/categories', categoryController.createCategory);
router.put('/categories/:id', categoryController.updateCategory);
router.delete('/categories/:id', categoryController.deleteCategory);
// Маршрут для призначення модератора (тільки для адміністраторів)
router.post('/users/:id/set-moderator', authenticate, isAdmin, adminController.setUserAsModerator);
router.get('/companies', authenticate, requireAdmin, adminController.getAllCompanies);
router.get('/companies/:id', authenticate, requireAdmin, adminController.getCompanyById);
router.get('/users/:userId/company', authenticate, requireAdmin, adminController.getCompanyProfileByUser);
router.post('/companies/:id/verify', authenticate, requireAdmin, adminController.verifyCompany);
router.post('/documents/:documentId/verify', authenticate, requireAdmin, adminController.verifyDocument);
router.get('/reports', authenticate, requireAdmin, adminController.getAllReports);
router.get('/reports/:id', authenticate, requireAdmin, adminController.getReportById);
router.post('/reports/:id/resolve', authenticate, requireAdmin, adminController.resolveReport);
router.get('/system-health', authenticate, requireAdmin, adminController.getSystemHealth);
router.get('/scheduled-tasks', authenticate, requireAdmin, scheduledTaskController.getTasks);
router.get('/scheduled-tasks/:id', authenticate, requireAdmin, scheduledTaskController.getTask);
router.post('/scheduled-tasks/:id/cancel', authenticate, requireAdmin, scheduledTaskController.cancelTask);
router.get('/scheduled-tasks/types', authenticate, requireAdmin, scheduledTaskController.getTaskTypes);
router.get('/recurring-tasks', authenticate, requireAdmin, scheduledTaskController.getRecurringTasks);
router.post('/recurring-tasks/:id/cancel', authenticate, requireAdmin, scheduledTaskController.cancelRecurringTask);
router.post('/scheduled-tasks/:id/pause', authenticate, requireAdmin, scheduledTaskController.pauseScheduledTask);
router.post('/scheduled-tasks/:id/resume', authenticate, requireAdmin, scheduledTaskController.resumeScheduledTask);

export default router;