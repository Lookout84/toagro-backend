import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';
import multer from 'multer';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(`Error: ${err.message}`);
  logger.error(err.stack || '');
  
  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  
  // Handle Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'Duplicate entry found';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Record not found';
    }
  }
  
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation error';
    return res.status(statusCode).json({
      status: 'error',
      message,
      errors: err.errors
    });
  }
  
  // Standardized error response
  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Обробник помилок multer
export const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    logger.error(`Помилка завантаження файлу: ${err.message}`);
    
    let message = 'Помилка при завантаженні файлу';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'Файл занадто великий. Максимальний розмір - 10 MB';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Занадто багато файлів. Максимальна кількість - 10';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Неочікуваний формат файлу';
        break;
      default:
        message = err.message;
    }
    
    return res.status(400).json({
      status: 'error',
      message,
      code: err.code
    });
  }
  
  next(err);
};
// import { Request, Response, NextFunction } from 'express';
// import { logger } from '../utils/logger';
// import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
// import { ZodError } from 'zod';

// interface CustomError extends Error {
//   statusCode?: number;
//   code?: string;
// }

// export const errorHandler = (
//   err: CustomError,
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   logger.error(`Error: ${err.message}`);
//   logger.error(err.stack || '');
  
//   // Default error status and message
//   let statusCode = err.statusCode || 500;
//   let message = err.message || 'Internal Server Error';
  
//   // Handle Prisma errors
//   if (err instanceof PrismaClientKnownRequestError) {
//     if (err.code === 'P2002') {
//       statusCode = 409;
//       message = 'Duplicate entry found';
//     } else if (err.code === 'P2025') {
//       statusCode = 404;
//       message = 'Record not found';
//     }
//   }
  
//   // Handle Zod validation errors
//   if (err instanceof ZodError) {
//     statusCode = 400;
//     message = 'Validation error';
//     return res.status(statusCode).json({
//       status: 'error',
//       statusCode,
//       message,
//       errors: err.errors
//     });
//   }
  
//   res.status(statusCode).json({
//     status: 'error',
//     statusCode,
//     message,
//     ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
//   });
// };