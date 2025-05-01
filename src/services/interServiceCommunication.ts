import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';

/**
 * Типи запитів між сервісами
 */
export enum RequestType {
  GET_USER_INFO = 'get_user_info',
  GET_LISTING_INFO = 'get_listing_info',
  CHECK_PAYMENT_STATUS = 'check_payment_status',
  GET_CATEGORY_TREE = 'get_category_tree',
  VERIFY_TOKEN = 'verify_token',
  UPDATE_SEARCH_INDEX = 'update_search_index',
  GENERATE_REPORT = 'generate_report',
  ANALYZE_USER_ACTIVITY = 'analyze_user_activity',
}

/**
 * Інтерфейс запиту між сервісами
 */
export interface ServiceRequest {
  id: string;
  type: RequestType;
  payload: any;
  replyTo: string;
  correlationId?: string;
  timestamp: string;
  source?: string;
  expiresAt?: string;
}

/**
 * Інтерфейс відповіді між сервісами
 */
export interface ServiceResponse {
  requestId: string;
  success: boolean;
  data?: any;
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
  correlationId?: string;
  timestamp: string;
  source?: string;
}

/**
 * Опції для конфігурації запиту
 */
export interface RequestOptions {
  timeout?: number;
  correlationId?: string;
  expiresIn?: number;
}

/**
 * Сервіс для міжсервісної комунікації через RabbitMQ
 */
class InterServiceCommunication {
  private requestCallbacks = new Map<string, { 
    resolve: Function; 
    reject: Function; 
    timeout: NodeJS.Timeout;
    correlationId?: string;
  }>();
  
  private replyQueueName: string = '';
  private requestTimeout: number = 30000; // 30 секунд таймаут для запитів за замовчуванням
  // private serviceName: string = config.serviceName || 'toagro-api';
  private serviceName: string = (config as any).serviceName || 'toagro-api';
  // Налаштування обміну
  private readonly RPC_EXCHANGE = 'rpc_exchange';
  
  // Обробники запитів
  private requestHandlers = new Map<RequestType, (payload: any) => Promise<any>>();
  
  /**
   * Ініціалізація міжсервісної комунікації
   */
  async initialize(): Promise<void> {
    try {
      // Підключення до RabbitMQ, якщо ще не підключено
      await rabbitmq.connect();
      
      // Створити обмін для RPC (Remote Procedure Call)
      await rabbitmq.assertExchange(this.RPC_EXCHANGE, 'topic');
      
      // Створити тимчасову приватну чергу для відповідей з унікальним ім'ям
      this.replyQueueName = `reply_queue_${this.serviceName}_${process.env.NODE_ENV || 'development'}_${uuidv4()}`;
      await rabbitmq.assertQueue(this.replyQueueName, { 
        durable: false, 
        exclusive: true,
        autoDelete: true,
      });
      
      // Прив'язуємо чергу відповідей до обміну з ключем, що відповідає імені черги
      await rabbitmq.bindQueue(this.replyQueueName, this.RPC_EXCHANGE, this.replyQueueName);
      
      // Споживання відповідей з черги
      await rabbitmq.consumeQueue(this.replyQueueName, this.handleResponse.bind(this));
      
      logger.info(`Inter-service communication initialized with reply queue: ${this.replyQueueName}`);
    } catch (error) {
      logger.error(`Failed to initialize inter-service communication: ${error}`);
      throw error;
    }
  }
  
  /**
   * Надсилання запиту до іншого сервісу і очікування відповіді
   */
  async sendRequest<T>(
    type: RequestType, 
    payload: any, 
    options: RequestOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        const requestId = uuidv4();
        const correlationId = options.correlationId || uuidv4();
        const timeout = options.timeout || this.requestTimeout;
        
        // Підготовка запиту
        const request: ServiceRequest = {
          id: requestId,
          type,
          payload,
          replyTo: this.replyQueueName,
          correlationId,
          timestamp: new Date().toISOString(),
          source: this.serviceName,
        };
        
        // Додаємо час завершення, якщо вказано
        if (options.expiresIn) {
          const expiresAt = new Date();
          expiresAt.setMilliseconds(expiresAt.getMilliseconds() + options.expiresIn);
          request.expiresAt = expiresAt.toISOString();
        }
        
        // Налаштувати таймаут для запиту
        const timeoutId = setTimeout(() => {
          const callback = this.requestCallbacks.get(requestId);
          if (callback) {
            this.requestCallbacks.delete(requestId);
            reject(new Error(`Request timeout: ${type}`));
          }
        }, timeout);
        
        // Зберегти колбеки для відповіді
        this.requestCallbacks.set(requestId, { 
          resolve, 
          reject, 
          timeout: timeoutId,
          correlationId,
        });
        
        // Відправити запит
        const routingKey = `request.${type}`;
        rabbitmq.publishToExchange(this.RPC_EXCHANGE, routingKey, request);
        
        logger.info(`Request sent: ${type}, ID: ${requestId}, Correlation ID: ${correlationId}`);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Обробка відповіді на запит
   */
  private async handleResponse(response: ServiceResponse): Promise<void> {
    try {
      const { requestId, success, data, error, correlationId } = response;
      
      // Знайти колбеки для запиту
      const callbacks = this.requestCallbacks.get(requestId);
      
      if (callbacks) {
        // Перевірка correlationId, якщо він був вказаний
        if (callbacks.correlationId && correlationId && callbacks.correlationId !== correlationId) {
          logger.warn(`Correlation ID mismatch for request ${requestId}: expected ${callbacks.correlationId}, got ${correlationId}`);
          return; // Ігноруємо відповідь з невідповідним correlationId
        }
        
        // Очистити таймаут
        clearTimeout(callbacks.timeout);
        
        // Видалити колбеки
        this.requestCallbacks.delete(requestId);
        
        // Виконати відповідний колбек
        if (success) {
          callbacks.resolve(data);
        } else {
          const errorMessage = error?.message || 'Unknown error';
          const errorObj = new Error(errorMessage);
          (errorObj as any).code = error?.code;
          (errorObj as any).details = error?.details;
          callbacks.reject(errorObj);
        }
        
        logger.info(`Response handled for request ID: ${requestId}`);
      } else {
        logger.warn(`Received response for unknown request ID: ${requestId}`);
      }
    } catch (error) {
      logger.error(`Error handling response: ${error}`);
    }
  }
  
  /**
   * Реєстрація обробника запитів певного типу
   */
  registerRequestHandler(
    type: RequestType, 
    handler: (payload: any) => Promise<any>
  ): void {
    this.requestHandlers.set(type, handler);
    logger.info(`Request handler registered for type: ${type}`);
  }
  
  /**
   * Обробка запитів від інших сервісів
   */
  async handleRequests(type: RequestType, handler: (payload: any) => Promise<any>): Promise<void> {
    try {
      // Реєструємо обробник
      this.registerRequestHandler(type, handler);
      
      // Створити чергу для запитів
      const queueName = `rpc_queue_${this.serviceName}_${type}`;
      await rabbitmq.assertQueue(queueName, { durable: true });
      
      // Прив'язати чергу до обміну
      const routingKey = `request.${type}`;
      await rabbitmq.bindQueue(queueName, this.RPC_EXCHANGE, routingKey);
      
      // Споживання запитів з черги
      await rabbitmq.consumeQueue(queueName, async (request: ServiceRequest) => {
        try {
          logger.info(`Handling request: ${type}, ID: ${request.id}, From: ${request.source || 'unknown'}`);
          
          // Перевіряємо, чи не застарів запит
          if (request.expiresAt) {
            const expiresAt = new Date(request.expiresAt);
            if (expiresAt < new Date()) {
              logger.warn(`Request ${request.id} expired at ${request.expiresAt}`);
              // Відправляємо відповідь про помилку
              const errorResponse: ServiceResponse = {
                requestId: request.id,
                success: false,
                error: {
                  code: 'REQUEST_EXPIRED',
                  message: 'Request expired',
                },
                correlationId: request.correlationId,
                timestamp: new Date().toISOString(),
                source: this.serviceName,
              };
              await rabbitmq.publishToExchange(this.RPC_EXCHANGE, request.replyTo, errorResponse);
              return;
            }
          }
          
          // Обробити запит
          const result = await handler(request.payload);
          
          // Створити відповідь
          const response: ServiceResponse = {
            requestId: request.id,
            success: true,
            data: result,
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
            source: this.serviceName,
          };
          
          // Відправити відповідь у чергу відповідей
          await rabbitmq.publishToExchange(this.RPC_EXCHANGE, request.replyTo, response);
          
          logger.info(`Response sent for request ID: ${request.id}`);
        } catch (error) {
          logger.error(`Error handling request ${request.id}: ${error}`);
          
          // Створити відповідь з помилкою
          let errorMessage = 'Internal server error';
          let errorCode = 'INTERNAL_ERROR';
          let errorDetails;
          
          if (error instanceof Error) {
            errorMessage = error.message;
            errorCode = (error as any).code || errorCode;
            errorDetails = (error as any).details;
          }
          
          const response: ServiceResponse = {
            requestId: request.id,
            success: false,
            error: {
              code: errorCode,
              message: errorMessage,
              details: errorDetails,
            },
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
            source: this.serviceName,
          };
          
          // Відправити відповідь у чергу відповідей
          await rabbitmq.publishToExchange(this.RPC_EXCHANGE, request.replyTo, response);
        }
      });
      
      logger.info(`Request handler set up for type: ${type}`);
    } catch (error) {
      logger.error(`Failed to set up request handler for type ${type}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Отримання інформації про користувача
   */
  async getUserInfo(userId: number, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.GET_USER_INFO, 
      { userId },
      options
    );
  }
  
  /**
   * Отримання інформації про оголошення
   */
  async getListingInfo(listingId: number, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.GET_LISTING_INFO, 
      { listingId },
      options
    );
  }
  
  /**
   * Перевірка статусу платежу
   */
  async checkPaymentStatus(transactionId: string, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.CHECK_PAYMENT_STATUS, 
      { transactionId },
      options
    );
  }
  
  /**
   * Отримання дерева категорій
   */
  async getCategoryTree(options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.GET_CATEGORY_TREE, 
      {},
      options
    );
  }
  
  /**
   * Перевірка JWT токена
   */
  async verifyToken(token: string, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.VERIFY_TOKEN, 
      { token },
      options
    );
  }
  
  /**
   * Оновлення пошукового індексу
   */
  async updateSearchIndex(entity: string, id: number, data: any, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.UPDATE_SEARCH_INDEX, 
      { entity, id, data },
      options
    );
  }
  
  /**
   * Генерація звіту
   */
  async generateReport(reportType: string, params: any, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.GENERATE_REPORT, 
      { reportType, params },
      options
    );
  }
  
  /**
   * Аналіз активності користувача
   */
  async analyzeUserActivity(userId: number, period: string, options?: RequestOptions): Promise<any> {
    return this.sendRequest<any>(
      RequestType.ANALYZE_USER_ACTIVITY, 
      { userId, period },
      options
    );
  }
  
  /**
   * Відправлення запиту довільного типу
   */
  async sendCustomRequest<T>(
    type: RequestType | string, 
    payload: any, 
    options?: RequestOptions
  ): Promise<T> {
    return this.sendRequest<T>(
      type as RequestType, 
      payload,
      options
    );
  }
  
  /**
   * Закриття міжсервісної комунікації
   */
  async close(): Promise<void> {
    // Скасування всіх запитів, що очікують
    for (const [requestId, callbacks] of this.requestCallbacks.entries()) {
      clearTimeout(callbacks.timeout);
      callbacks.reject(new Error('Service shutdown'));
      this.requestCallbacks.delete(requestId);
    }
  }
}

// Створюємо єдиний екземпляр сервісу
export const interServiceCommunication = new InterServiceCommunication();