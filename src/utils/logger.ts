import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from '../config/env';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');

// Створюємо директорію для логів якщо її немає
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Кольори для рівнів логування
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Додаємо кольори до winston
winston.addColors(colors);

// Форматування логів
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Транспорти для різних середовищ
const transports = [
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    level: 'error',
    format: fileFormat,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
  }),
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    format: fileFormat,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
  }),
];

if (env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat,
    })
  );
}

// Основной логгер
const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// Мідлвар для логування HTTP запитів
export const httpLoggerMiddleware = (req: Request, res: Response, next: Function) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms - ${req.ip}`
    );
  });

  next();
};

// Створюємо stream для morgan
export const httpStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Типізація для логера
type LogFn = (message: string, meta?: Record<string, unknown>) => void;

interface CustomLogger extends winston.Logger {
  http: LogFn;
}

export default logger as CustomLogger;