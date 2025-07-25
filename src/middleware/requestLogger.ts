import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Логуємо початок запиту
  logger.info(`🚀 ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  
  // Логуємо заголовки (без чутливих даних)
  const sanitizedHeaders = { ...req.headers };
  delete sanitizedHeaders.authorization;
  delete sanitizedHeaders.cookie;
  logger.debug('Headers:', JSON.stringify(sanitizedHeaders, null, 2));
  
  // Логуємо тіло запиту для POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    logger.info('Request Body:', JSON.stringify(req.body, null, 2));
    
    // Логуємо файли, якщо є
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      logger.info('Uploaded Files:', req.files.map(file => ({
        fieldname: file.fieldname,
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype
      })));
    }
  }
  
  // Логуємо query параметри
  if (Object.keys(req.query).length > 0) {
    logger.info('Query Params:', JSON.stringify(req.query, null, 2));
  }
  
  // Перехоплюємо відповідь
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = Date.now() - startTime;
    logger.info(`✅ ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    
    // Логуємо відповідь тільки для помилок або при debug рівні
    if (res.statusCode >= 400) {
      logger.error('Error Response:', body);
    } else if (process.env.LOG_LEVEL === 'debug') {
      logger.debug('Response:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};
