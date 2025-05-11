import winston from 'winston';
import path from 'path';

// Не імпортуйте config напряму
// import { config } from '../config/env';

// Створіть спочатку базовий логер, який не залежить від конфігурації
const createLogger = (nodeEnv: string = process.env.NODE_ENV || 'development') => {
  // Формати виводу
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  );
  
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  );
  
  // Налаштування транспортів
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: nodeEnv === 'development' ? consoleFormat : logFormat,
    }),
  ];
  
  // Додаємо логування в файл у production середовищі
  if (nodeEnv === 'production') {
    transports.push(
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/error.log'),
        level: 'error',
      }),
      new winston.transports.File({
        filename: path.join(__dirname, '../../logs/combined.log'),
      })
    );
  }
  
  // Створюємо логер
  return winston.createLogger({
    level: nodeEnv === 'development' ? 'debug' : 'info',
    format: logFormat,
    transports,
  });
};

// Експортуємо екземпляр логера
export const logger = createLogger();

// import winston from 'winston';
// import { config } from '../config/env';

// // Custom log format with request ID support
// const logFormat = winston.format.combine(
//   winston.format.timestamp(),
//   winston.format.metadata({
//     fillExcept: ['timestamp', 'level', 'message', 'service']
//   }),
//   winston.format.json()
// );

// // Console format for development
// const consoleFormat = winston.format.combine(
//   winston.format.colorize(),
//   winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
//   winston.format.printf(
//     (info) => {
//       const { timestamp, level, message, requestId, userId, ...rest } = info;
//       let logString = `${timestamp} ${level}: ${message}`;
      
//       // Add context info if available
//       if (requestId) logString += ` [reqId:${requestId}]`;
//       if (userId) logString += ` [userId:${userId}]`;
      
//       // Add other metadata if present
//       if (Object.keys(rest).length > 0) {
//         logString += ` ${JSON.stringify(rest)}`;
//       }
      
//       return logString;
//     }
//   )
// );

// // Create logger with appropriate transports based on environment
// const transports: winston.transport[] = [
//   new winston.transports.Console({
//     format: config.nodeEnv === 'development' ? consoleFormat : logFormat,
//   })
// ];

// // Add file transports in non-development environments
// if (config.nodeEnv !== 'development') {
//   transports.push(
//     new winston.transports.File({ 
//       filename: 'logs/error.log', 
//       level: 'error',
//       maxsize: 10485760, // 10MB
//       maxFiles: 10,
//     }),
//     new winston.transports.File({ 
//       filename: 'logs/combined.log',
//       maxsize: 10485760, // 10MB
//       maxFiles: 10,
//     })
//   );
// }

// // Create logger
// export const logger = winston.createLogger({
//   level: config.nodeEnv === 'production' ? 'info' : 'debug',
//   format: logFormat,
//   defaultMeta: { service: 'toagro-api' },
//   transports
// });

// // Context logger factory
// export const createContextLogger = (context: {
//   requestId?: string;
//   userId?: number;
//   [key: string]: any;
// }) => {
//   return {
//     info: (message: string, meta?: any) => logger.info(message, { ...context, ...meta }),
//     error: (message: string, meta?: any) => logger.error(message, { ...context, ...meta }),
//     warn: (message: string, meta?: any) => logger.warn(message, { ...context, ...meta }),
//     debug: (message: string, meta?: any) => logger.debug(message, { ...context, ...meta }),
//   };
// };