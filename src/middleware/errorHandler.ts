import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

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