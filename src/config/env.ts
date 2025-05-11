import dotenv from 'dotenv';

// Завантажуємо конфігурацію з .env файлу
dotenv.config();

// Визначаємо інтерфейс для конфігурації
export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  redisUrl?: string;
  corsOrigin: string;
  liqpayPublicKey?: string;
  liqpayPrivateKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  uploadDir: string;
  rabbitmqUrl?: string;
  serviceName: string;
  rabbitmqUser?: string;
  rabbitmqPassword?: string;
  jwtRefreshSecret?: string; // Додаємо для refresh токенів
}

// Перевіряємо необхідні змінні оточення
const requiredEnvVars = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET'];

// Перевіряємо наявність необхідних змінних
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`
  );
  process.exit(1); // Завершуємо процес із помилкою
}

// Створюємо об'єкт конфігурації
export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || 'localhost',
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!, // Використовуємо JWT_SECRET як запасний варіант
  redisUrl: process.env.REDIS_URL,
  corsOrigin: process.env.CORS_ORIGIN || '*', // Дозволяємо всі джерела за замовчуванням для розробки
  liqpayPublicKey: process.env.LIQPAY_PUBLIC_KEY,
  liqpayPrivateKey: process.env.LIQPAY_PRIVATE_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqUser: process.env.RABBITMQ_USER,
  rabbitmqPassword: process.env.RABBITMQ_PASSWORD,
  serviceName: process.env.SERVICE_NAME || 'toagro-api',
};

// Використовуємо звичайний console.log замість logger для уникнення циклічних залежностей
console.log(
  `Application configuration loaded: Environment: ${config.nodeEnv}, Port: ${config.port}`
);

// Імпортуємо та ініціалізуємо логер після створення конфігурації
import { logger } from '../utils/logger';
logger.info(
  `Application configuration loaded: Environment: ${config.nodeEnv}, Port: ${config.port}`
);

// import dotenv from 'dotenv';
// import { logger } from '../utils/logger';

// dotenv.config();

// export interface Config {
//   nodeEnv: string;
//   port: number;
//   host: string;
//   databaseUrl: string;
//   jwtSecret: string;
//   jwtExpiresIn: string;
//   redisUrl?: string;
//   corsOrigin: string;
//   liqpayPublicKey?: string;
//   liqpayPrivateKey?: string;
//   smtpHost?: string;
//   smtpPort?: number;
//   smtpUser?: string;
//   smtpPass?: string;
//   uploadDir: string;
//   rabbitmqUrl?: string;
//   serviceName: string;
//   rabbitmqUser?: string;
//   rabbitmqPassword?: string;
// }

// // Required environment variables
// const requiredEnvVars = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET'];

// // Check for missing required variables
// const missingEnvVars = requiredEnvVars.filter(
//   (varName) => !process.env[varName]
// );
// if (missingEnvVars.length > 0) {
//   throw new Error(
//     `Missing required environment variables: ${missingEnvVars.join(', ')}`
//   );
// }

// export const config: Config = {
//   nodeEnv: process.env.NODE_ENV || 'development',
//   port: parseInt(process.env.PORT || '5000', 10),
//   host: process.env.HOST || 'localhost',
//   databaseUrl: process.env.DATABASE_URL!,
//   jwtSecret: process.env.JWT_SECRET!,
//   jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
//   redisUrl: process.env.REDIS_URL,
//   corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5001',
//   liqpayPublicKey: process.env.LIQPAY_PUBLIC_KEY,
//   liqpayPrivateKey: process.env.LIQPAY_PRIVATE_KEY,
//   smtpHost: process.env.SMTP_HOST,
//   smtpPort: process.env.SMTP_PORT
//     ? parseInt(process.env.SMTP_PORT, 10)
//     : undefined,
//   smtpUser: process.env.SMTP_USER,
//   smtpPass: process.env.SMTP_PASS,
//   uploadDir: process.env.UPLOAD_DIR || 'uploads',
//   rabbitmqUrl: process.env.RABBITMQ_URL,
//   rabbitmqUser: process.env.RABBITMQ_USER,
//   rabbitmqPassword: process.env.RABBITMQ_PASSWORD,
//   serviceName: process.env.SERVICE_NAME || 'toagro-api',
// };

// // Log configuration (omitting sensitive data)
// logger.info(
//   `Application configuration loaded: Environment: ${config.nodeEnv}, Port: ${config.port}`
// );

// import dotenv from 'dotenv';
// dotenv.config();

// export interface Config {
//   nodeEnv: string;
//   port: number;
//   host: string;
//   databaseUrl: string;
//   jwtSecret: string;
//   jwtExpiresIn: string;
//   redisUrl: string;
//   corsOrigin: string;
//   liqpayPublicKey: string;
//   liqpayPrivateKey: string;
//   smtpHost: string;
//   smtpPort: number;
//   smtpUser: string;
//   smtpPass: string;
//   uploadDir: string;
//   rabbitmqUrl: string;
//   serviceName: string;
//   rabbitmqUser: string;
//   rabbitmqPassword: string;
// };

// export const config: Config = {
//   nodeEnv: process.env.NODE_ENV || 'development',
//   port: Number(process.env.PORT) || 5000,
//   host: process.env.HOST || 'localhost',
//   databaseUrl: process.env.DATABASE_URL || '',
//   jwtSecret: process.env.JWT_SECRET || '',
//   jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
//   redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
//   corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5001',
//   liqpayPublicKey: process.env.LIQPAY_PUBLIC_KEY || '',
//   liqpayPrivateKey: process.env.LIQPAY_PRIVATE_KEY || '',
//   smtpHost: process.env.SMTP_HOST || '',
//   smtpPort: Number(process.env.SMTP_PORT) || 587,
//   smtpUser: process.env.SMTP_USER || '',
//   smtpPass: process.env.SMTP_PASS || '',
//   uploadDir: process.env.UPLOAD_DIR || 'uploads',
//   rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://195.162.70.72:15672',
//   rabbitmqUser: process.env.RABBITMQ_USER || 'guest',
//   rabbitmqPassword: process.env.RABBITMQ_PASSWORD || 'guest',
//   serviceName: process.env.SERVICE_NAME || 'toagro-api'
// };

// if (!process.env.JWT_SECRET) {
//   throw new Error('JWT_SECRET is not configured in .env file');
// };
