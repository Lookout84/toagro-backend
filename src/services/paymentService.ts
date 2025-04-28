import { prisma } from '../config/db';
import { liqpay } from '../utils/liqpay';
import { logger } from '../utils/logger';
import { config } from '../config/env';

interface CreatePaymentData {
  userId: number;
  amount: number;
  currency?: string;
  description: string;
  orderId?: string;
}

export const paymentService = {
  async createPayment(data: CreatePaymentData) {
    const { userId, amount, currency = 'UAH', description, orderId } = data;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate a unique transaction ID
    const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalOrderId = orderId || `ORDER-${Date.now()}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount,
        currency,
        status: 'PENDING',
        transactionId,
        orderId: finalOrderId,
      },
    });

    // Generate payment link
    const paymentLink = liqpay.createPaymentLink({
      amount,
      currency,
      description,
      order_id: transactionId,
      result_url: `http://${config.host}:${config.port}/payment/result`,
      server_url: `http://${config.host}:${config.port}/api/transactions/callback`,
    });

    return {
      payment,
      paymentLink,
    };
  },

  async processPaymentCallback(data: string, signature: string) {
    // Validate callback
    if (!liqpay.validateCallback(data, signature)) {
      throw new Error('Invalid callback signature');
    }

    const decodedData = liqpay.decodeData(data);
    logger.info(`Payment callback received: ${JSON.stringify(decodedData)}`);

    if (!decodedData) {
      throw new Error('Failed to decode payment data');
    }

    const { order_id: transactionId, status, amount, currency } = decodedData;

    // Update payment status
    let paymentStatus: 'COMPLETED' | 'FAILED' | 'PENDING';
    switch (status) {
      case 'success':
      case 'wait_accept':
        paymentStatus = 'COMPLETED';
        break;
      case 'failure':
      case 'error':
        paymentStatus = 'FAILED';
        break;
      default:
        paymentStatus = 'PENDING';
    }

    await prisma.payment.update({
      where: { transactionId },
      data: {
        status: paymentStatus,
        completedAt: paymentStatus === 'COMPLETED' ? new Date() : null,
      },
    });

    return { message: 'Payment callback processed' };
  },

  async getUserPayments(userId: number) {
    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { payments };
  },

  async getPaymentDetails(userId: number, transactionId: string) {
    const payment = await prisma.payment.findFirst({
      where: {
        transactionId,
        userId,
      },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    return { payment };
  },
};