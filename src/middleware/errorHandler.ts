import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { WebClient } from '@slack/web-api';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { env } from '../config/env';

// Ініціалізація Sentry
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app: require('express')() }),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 0.5,
  });
}

// Slack клієнт для сповіщень
const slack = new WebClient(env.SLACK_WEBHOOK_TOKEN);

class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public details?: Record<string, unknown>
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Отримання активного трейсу OpenTelemetry
  const activeSpan = trace.getActiveSpan();
  
  // Додавання помилки до трейсу
  if (activeSpan) {
    activeSpan.recordException(err);
    activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  }

  // Логування помилки
  logger.error(err.message, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ...(err instanceof AppError ? err.details : {}),
  });

  // Відправка до Sentry
  if (env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { 'route': req.path },
      user: { id: req.user?.id, email: req.user?.email },
    });
  }

  // Обробка специфічних помилок
  if (err.name === 'JsonWebTokenError') {
    return handleJwtError(err, req, res);
  }

  if (err.name === 'RateLimitError') {
    return handleRateLimitError(err, req, res);
  }

  if (err.message.includes('File upload')) {
    return handleFileUploadError(err, req, res);
  }

  // Відправка критичних помилок в Slack
  if (!(err instanceof AppError) || !err.isOperational) {
    sendCriticalAlert(err, req).catch(slackError => {
      logger.error('Slack notification failed:', slackError);
    });
  }

  // Форматування відповіді
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const response = {
    error: statusCode >= 500 ? 'Internal Server Error' : err.message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(err instanceof AppError && { details: err.details }),
    traceId: activeSpan?.spanContext().traceId,
  };

  res.status(statusCode).json(response);
};

// Обробка JWT помилок
function handleJwtError(err: Error, req: Request, res: Response) {
  const response = {
    error: 'Invalid token',
    code: 'INVALID_TOKEN',
    ...(env.NODE_ENV === 'development' && { debug: err.message }),
  };

  return res.status(401).json(response);
}

// Обробка Rate Limit помилок
function handleRateLimitError(err: any, req: Request, res: Response) {
  const retryAfter = err.retryAfter || 60;
  res.set('Retry-After', String(retryAfter));

  return res.status(429).json({
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter,
    limit: err.limit,
    remaining: err.remaining,
  });
}

// Обробка помилок завантаження файлів
function handleFileUploadError(err: Error, req: Request, res: Response) {
  let statusCode = 400;
  let errorCode = 'FILE_UPLOAD_ERROR';

  if (err.message.includes('File too large')) {
    statusCode = 413;
    errorCode = 'FILE_TOO_LARGE';
  } else if (err.message.includes('Invalid file type')) {
    errorCode = 'INVALID_FILE_TYPE';
  }

  return res.status(statusCode).json({
    error: err.message,
    code: errorCode,
  });
}

// Відправка критичних сповіщень
async function sendCriticalAlert(err: Error, req: Request) {
  if (!env.SLACK_ALERT_CHANNEL) return;

  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  const userInfo = req.user 
    ? `User: ${req.user.id} ${req.user.email}` 
    : 'Unauthenticated';

  try {
    await slack.chat.postMessage({
      channel: env.SLACK_ALERT_CHANNEL,
      text: `🚨 Critical Error Occurred`,
      attachments: [
        {
          color: '#ff0000',
          fields: [
            {
              title: 'Error',
              value: `\`\`\`${err.message}\`\`\``,
              short: false,
            },
            {
              title: 'Path',
              value: `${req.method} ${req.path}`,
              short: true,
            },
            {
              title: 'Trace ID',
              value: traceId || 'N/A',
              short: true,
            },
            {
              title: 'Environment',
              value: env.NODE_ENV,
              short: true,
            },
            {
              title: 'User',
              value: userInfo,
              short: true,
            },
          ],
          ts: Math.floor(Date.now() / 1000).toString(),
        },
      ],
    });

    // Додаткова відправка email для критичних помилок
    if (env.ADMIN_EMAIL) {
      await emailService.sendEmail(
        env.ADMIN_EMAIL,
        EmailType.CriticalError,
        {
          error: err.message,
          stack: err.stack,
          path: `${req.method} ${req.path}`,
          traceId,
          userInfo,
        }
      );
    }
  } catch (slackError) {
    logger.error('Failed to send Slack alert:', slackError);
  }
}

// Декоратор для трейсингу помилок
export function withErrorTracing(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const tracer = trace.getTracer('app-tracer');
    return tracer.startActiveSpan(propertyKey, async (span) => {
      try {
        const result = await originalMethod.apply(this, args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: (error as Error).message 
        });
        throw error;
      } finally {
        span.end();
      }
    });
  };

  return descriptor;
}