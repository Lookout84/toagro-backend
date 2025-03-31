import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { LiqPayService } from '../utils/liqpay';
import { redis } from '../utils/redis';

const liqpay = new LiqPayService();

export class PaymentService {
  private readonly RETRY_LIMIT = 3;
  private readonly RETRY_DELAY = 5000;

  async initiatePayment(params: {
    userId: number;
    listingId: number;
    amount: number;
    currency?: 'UAH' | 'USD' | 'EUR';
  }): Promise<{ paymentUrl: string; paymentId: string }> {
    try {
      // Перевірка наявності оголошення
      const listing = await prisma.listing.findUnique({
        where: { id: params.listingId },
        include: { seller: true }
      });

      if (!listing || listing.status !== 'ACTIVE') {
        throw new Error('Оголошення недоступне для покупки');
      }

      // Створення транзакції
      const transaction = await prisma.transaction.create({
        data: {
          amount: params.amount,
          status: 'PENDING',
          buyerId: params.userId,
          sellerId: listing.sellerId,
          listingId: listing.id,
          paymentId: liqpay.generateOrderId()
        }
      });

      // Генерація даних для LiqPay
      const paymentData = await liqpay.createPaymentData({
        amount: params.amount,
        orderId: transaction.paymentId,
        description: `Купівля техніки: ${listing.title}`,
        resultUrl: `${env.CLIENT_URL}/transactions/${transaction.id}`,
        serverUrl: `${env.API_URL}/api/payments/webhook`
      });

      return {
        paymentUrl: paymentData.url,
        paymentId: transaction.paymentId
      };
    } catch (error) {
      logger.error('Payment initiation failed:', error);
      throw new Error('Не вдалося ініціювати платіж');
    }
  }

  async handleWebhook(data: any): Promise<void> {
    try {
      const decodedData = liqpay.decodeLiqPayData(data.data);
      const isValid = liqpay.verifySignature(data.data, data.signature);

      if (!isValid) {
        throw new Error('Невалідний підпис вебхука');
      }

      const transaction = await prisma.transaction.update({
        where: { paymentId: decodedData.order_id },
        data: {
          status: decodedData.status.toUpperCase() as TransactionStatus,
          paymentId: decodedData.payment_id
        },
        include: { listing: true }
      });

      if (decodedData.status === 'success') {
        await prisma.listing.update({
          where: { id: transaction.listingId },
          data: { status: 'SOLD' }
        });

        await this.sendPaymentNotifications(transaction);
      }

      logger.info(`Payment ${transaction.paymentId} status: ${transaction.status}`);
    } catch (error) {
      logger.error('Webhook processing error:', error);
      throw error;
    }
  }

  private async sendPaymentNotifications(transaction: Prisma.TransactionGetPayload<{
    include: { buyer: true; seller: true; listing: true }
  }>) {
    try {
      // Відправка сповіщень покупцю та продавцю
      await Promise.all([
        this.sendEmail(transaction.buyer.email, 'payment-success', transaction),
        this.sendEmail(transaction.seller.email, 'payment-received', transaction)
      ]);

      // Збереження нотифікації в базі
      await prisma.notification.createMany({
        data: [
          {
            userId: transaction.buyerId,
            type: 'PAYMENT_SUCCESS',
            content: JSON.stringify(transaction)
          },
          {
            userId: transaction.sellerId,
            type: 'PAYMENT_RECEIVED',
            content: JSON.stringify(transaction)
          }
        ]
      });
    } catch (error) {
      logger.error('Failed to send payment notifications:', error);
    }
  }

  async retryFailedPayment(paymentId: string): Promise<void> {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { paymentId }
      });

      if (!transaction || transaction.retryCount >= this.RETRY_LIMIT) {
        throw new Error('Ліміт спроб вичерпано');
      }

      if (transaction.status !== 'FAILED') {
        throw new Error('Платіж не потребує повторної спроби');
      }

      // Оновлення статусу та лічильника спроб
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PENDING',
          retryCount: { increment: 1 }
        }
      });

      // Повторна ініціалізація платежу
      const paymentData = await liqpay.createPaymentData({
        amount: transaction.amount,
        orderId: transaction.paymentId
      });

      // Логіка повторного перенаправлення користувача
      await this.storeRetryData(transaction.id, paymentData);
    } catch (error) {
      logger.error('Payment retry failed:', error);
      throw new Error('Не вдалося повторити платіж');
    }
  }

  private async storeRetryData(transactionId: number, paymentData: any) {
    await redis.setEx(
      `payment_retry:${transactionId}`,
      this.RETRY_DELAY,
      JSON.stringify(paymentData)
    );
  }

  async getPaymentStatus(paymentId: string) {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { paymentId },
        include: { listing: true }
      });

      if (!transaction) throw new Error('Транзакція не знайдена');

      if (transaction.status === 'PENDING') {
        const liqpayStatus = await liqpay.getPaymentStatus(paymentId);
        await prisma.transaction.update({
          where: { paymentId },
          data: { status: liqpayStatus }
        });
        return liqpayStatus;
      }

      return transaction.status;
    } catch (error) {
      logger.error('Payment status check failed:', error);
      throw new Error('Не вдалося перевірити статус платежу');
    }
  }
}

export const paymentService = new PaymentService();