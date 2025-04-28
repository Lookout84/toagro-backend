import { Router } from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Payment schema
const createPaymentSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be a positive number'),
    currency: z.string().length(3, 'Currency must be a 3-letter code (e.g., UAH)').optional(),
    description: z.string().min(5, 'Description must be at least 5 characters'),
    orderId: z.string().optional(),
  }),
});

// Callback validation schema
const callbackSchema = z.object({
  body: z.object({
    data: z.string(),
    signature: z.string(),
  }),
});

// Public route for LiqPay callback
router.post(
  '/callback',
  validate(callbackSchema),
  paymentController.handleCallback
);

// Protected routes
router.use(authenticate);

router.post(
  '/',
  validate(createPaymentSchema),
  paymentController.createPayment
);

router.get(
  '/',
  paymentController.getUserPayments
);

router.get(
  '/:transactionId',
  paymentController.getPaymentDetails
);

export default router;