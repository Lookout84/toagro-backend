import { createHash, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { env } from '../config/env';

const prisma = new PrismaClient();

interface LiqPayParams {
  amount: number;
  currency?: 'UAH' | 'USD' | 'EUR';
  orderId?: string;
  description?: string;
  resultUrl?: string;
  serverUrl?: string;
}

interface LiqPayCallbackData {
  data: string;
  signature: string;
}

interface DecodedLiqPayData {
  order_id: string;
  payment_id: string;
  status: 'success' | 'failure' | 'error' | 'subscribed' | 'unsubscribed' | 'reversed';
  amount: number;
  currency: string;
  transaction_id: string;
}

export class LiqPayService {
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly apiUrl = 'https://www.liqpay.ua/api/3/checkout';

  constructor() {
    this.publicKey = env.LIQPAY_PUBLIC_KEY;
    this.privateKey = env.LIQPAY_PRIVATE_KEY;
  }

  /**
   * Генерує дані для платіжної форми
   */
  async createPaymentData(params: LiqPayParams) {
    const orderId = params.orderId || this.generateOrderId();
    const currency = params.currency || 'UAH';
    
    const data = {
      public_key: this.publicKey,
      version: '3',
      action: 'pay',
      amount: params.amount,
      currency,
      description: params.description || 'Оплата агротехніки',
      order_id: orderId,
      result_url: params.resultUrl || `${env.CLIENT_URL}/payment-success`,
      server_url: params.serverUrl || `${env.API_URL}/api/payments/callback`,
      language: 'uk'
    };

    const encodedData = this.base64Encode(JSON.stringify(data));
    const signature = this.createSignature(encodedData);

    await prisma.transaction.create({
      data: {
        amount: params.amount,
        status: 'PENDING',
        paymentId: orderId,
        buyer: { connect: { id: /* ID покупця */ } }, // Додайте логіку отримання ID
        listing: { connect: { id: /* ID оголошення */ } } // Додайте логіку отримання ID
      }
    });

    return {
      data: encodedData,
      signature,
      url: this.apiUrl
    };
  }

  /**
   * Обробка зворотного виклику від LiqPay
   */
  async handleCallback({ data, signature }: LiqPayCallbackData) {
    try {
      const decodedData = this.decodeLiqPayData(data);
      const isValid = this.verifySignature(data, signature);

      if (!isValid) {
        logger.error('Invalid LiqPay signature', { data });
        throw new Error('Invalid signature');
      }

      const transaction = await prisma.transaction.update({
        where: { paymentId: decodedData.order_id },
        data: {
          status: decodedData.status.toUpperCase(),
          paymentId: decodedData.payment_id
        }
      });

      // Додаткова логіка при успішній оплаті
      if (decodedData.status === 'success') {
        await this.handleSuccessfulPayment(decodedData, transaction);
      }

      return { success: true };
    } catch (error) {
      logger.error('LiqPay callback error:', error);
      throw error;
    }
  }

  private async handleSuccessfulPayment(data: DecodedLiqPayData, transaction: any) {
    // Оновлення статусу оголошення
    await prisma.listing.update({
      where: { id: transaction.listingId },
      data: { status: 'SOLD' }
    });

    // Відправка повідомлення продавцю
    // ... додайте логіку сповіщення ...
  }

  private generateOrderId() {
    return `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private base64Encode(str: string) {
    return Buffer.from(str).toString('base64');
  }

  private base64Decode(str: string) {
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  private createSignature(data: string) {
    const sha1 = createHmac('sha1', this.privateKey)
      .update(data)
      .digest('base64');
    return sha1;
  }

  private verifySignature(receivedData: string, receivedSignature: string) {
    const computedSignature = this.createSignature(receivedData);
    return computedSignature === receivedSignature;
  }

  private decodeLiqPayData(encodedData: string): DecodedLiqPayData {
    try {
      return JSON.parse(this.base64Decode(encodedData));
    } catch (error) {
      logger.error('Error decoding LiqPay data', { encodedData });
      throw new Error('Invalid LiqPay data');
    }
  }
}

// Ініціалізація сервісу
export const liqPay = new LiqPayService();