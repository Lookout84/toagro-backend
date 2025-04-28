import { Request, Response, NextFunction } from 'express';
import { chatService } from '../services/chatService';
import { logger } from '../utils/logger';

export const chatController = {
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const senderId = req.userId!;
      const { receiverId, content, listingId } = req.body;
      
      const result = await chatService.sendMessage({
        content,
        senderId,
        receiverId,
        listingId,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Message sent successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const otherUserId = parseInt(req.params.userId);
      const { page, limit } = req.query;
      
      const result = await chatService.getConversation(
        userId,
        otherUserId,
        page ? parseInt(page as string) : undefined,
        limit ? parseInt(limit as string) : undefined
      );
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const result = await chatService.getUserConversations(userId);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async markMessagesAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const conversationUserId = parseInt(req.params.userId);
      
      const result = await chatService.markMessagesAsRead(userId, conversationUserId);
      
      res.status(200).json({
        status: 'success',
        message: 'Messages marked as read',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnreadMessagesCount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const result = await chatService.getUnreadMessagesCount(userId);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};