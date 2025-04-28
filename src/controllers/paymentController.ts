import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/paymentService';
import { logger } from '../utils/logger';

export const paymentController = {
  async createPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { amount, currency, description, orderId } = req.body;
      
      const result = await paymentService.createPayment({
        userId,
        amount,
        currency,
        description,
        orderId,
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Payment created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async handleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { data, signature } = req.body;
      
      await paymentService.processPaymentCallback(data, signature);
      
      res.status(200).json({
        status: 'success',
        message: 'Payment callback processed',
      });
    } catch (error) {
      logger.error(`Payment callback error: ${error}`);
      // Always return 200 to LiqPay even on error
      res.status(200).json({
        status: 'error',
        message: 'Payment callback processing failed',
      });
    }
  },

  async getUserPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const result = await paymentService.getUserPayments(userId);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getPaymentDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const { transactionId } = req.params;
      
      const result = await paymentService.getPaymentDetails(userId, transactionId);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};