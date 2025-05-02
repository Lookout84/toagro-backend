import { Request, Response, NextFunction } from 'express';
import { paymentService } from '../services/paymentService';
import { logger } from '../utils/logger';

export const paymentController = {
  /**
 * @swagger
 * /api/transactions:
 *   post:
 *     tags:
 *       - Transactions
 *     summary: Створення нового платежу
 *     description: Створює новий платіж для автентифікованого користувача
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - description
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1000.00
 *               currency:
 *                 type: string
 *                 default: UAH
 *                 example: UAH
 *               description:
 *                 type: string
 *                 example: Оплата за послуги
 *               orderId:
 *                 type: string
 *                 example: ORDER-12345
 *     responses:
 *       201:
 *         description: Платіж успішно створено
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Payment created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment:
 *                       $ref: '#/definitions/Payment'
 *                     paymentLink:
 *                       type: string
 *                       example: https://www.liqpay.ua/api/3/checkout?data=xxx&signature=yyy
 *       400:
 *         description: Помилка валідації даних
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 *       401:
 *         description: Користувач не автентифікований
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Error'
 */
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