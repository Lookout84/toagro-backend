import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  redisUrl: string;
  corsOrigin: string;
  liqpayPublicKey: string;
  liqpayPrivateKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  uploadDir: string;
  rabbitmqUrl: string;
  rabbitmqUser: string;
  rabbitmqPassword: string;
};

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  liqpayPublicKey: process.env.LIQPAY_PUBLIC_KEY || '',
  liqpayPrivateKey: process.env.LIQPAY_PRIVATE_KEY || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  rabbitmqUser: process.env.RABBITMQ_USER || 'guest',
  rabbitmqPassword: process.env.RABBITMQ_PASSWORD || 'guest'
};

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured in .env file');
};