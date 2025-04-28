import crypto from 'crypto';
import { config } from '../config/env';
import { logger } from './logger';

interface LiqpayParams {
  amount: number;
  currency: string;
  description: string;
  order_id: string;
  result_url?: string;
  server_url?: string;
}

export class LiqpayService {
  private readonly publicKey: string;
  private readonly privateKey: string;

  constructor() {
    this.publicKey = config.liqpayPublicKey;
    this.privateKey = config.liqpayPrivateKey;
  }

  createPaymentLink(params: LiqpayParams): string {
    const jsonString = Buffer.from(
      JSON.stringify({
        public_key: this.publicKey,
        version: '3',
        action: 'pay',
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        order_id: params.order_id,
        result_url: params.result_url,
        server_url: params.server_url,
      })
    ).toString('base64');

    const signature = this.generateSignature(jsonString);

    return `https://www.liqpay.ua/api/3/checkout?data=${jsonString}&signature=${signature}`;
  }

  generateSignature(data: string): string {
    return crypto
      .createHash('sha1')
      .update(this.privateKey + data + this.privateKey)
      .digest('base64');
  }

  validateCallback(data: string, signature: string): boolean {
    const expectedSignature = this.generateSignature(data);
    return expectedSignature === signature;
  }

  decodeData(data: string): any {
    try {
      const decodedData = Buffer.from(data, 'base64').toString('utf-8');
      return JSON.parse(decodedData);
    } catch (error) {
      logger.error(`LiqPay data decoding error: ${error}`);
      return null;
    }
  }
}

export const liqpay = new LiqpayService();