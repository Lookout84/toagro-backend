import { Router } from 'express';
import { chatController } from '../controllers/chatController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';

const router = Router();

// All chat routes are protected
router.use(authenticate);

// Message schema
const sendMessageSchema = z.object({
  body: z.object({
    receiverId: z.number().int().positive(),
    content: z.string().min(1, 'Message content is required'),
    listingId: z.number().int().positive().optional(),
  }),
});

// Routes
router.post(
  '/messages',
  validate(sendMessageSchema),
  chatController.sendMessage
);

router.get(
  '/conversations',
  chatController.getUserConversations
);

router.get(
  '/conversations/:userId',
  chatController.getConversation
);

router.post(
  '/conversations/:userId/read',
  chatController.markMessagesAsRead
);

router.get(
  '/unread',
  chatController.getUnreadMessagesCount
);

export default router;