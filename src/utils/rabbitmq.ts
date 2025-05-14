import amqp, { Channel, Connection, ConsumeMessage, Options } from 'amqplib';
import { config } from '../config/env';
import { logger } from './logger';

type MessageHandler = (content: any) => Promise<void>;

/**
 * Сервіс для роботи з RabbitMQ
 */
class RabbitMQService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private url: string;
  private connecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private consumers: Map<string, MessageHandler> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly healthCheckInterval: number = 30000; // 30 секунд
  private readonly healthCheckQueue: string = 'health_check_queue';

  constructor() {
    // Формування URL підключення з урахуванням креденшалів
    const { rabbitmqUrl, rabbitmqUser, rabbitmqPassword } = config;

    if (!rabbitmqUrl) {
      throw new Error('RabbitMQ URL is not defined in configuration');
    }

    try {
      // Перевіряємо, чи URL вже містить креденшали
      const urlObj = new URL(rabbitmqUrl);
      
      // Додаємо креденшали, тільки якщо вони не вказані в URL
      if ((!urlObj.username || !urlObj.password) && rabbitmqUser && rabbitmqPassword) {
        urlObj.username = rabbitmqUser;
        urlObj.password = rabbitmqPassword;
      }

      this.url = urlObj.toString();
      logger.debug(`Configured RabbitMQ URL: ${this.url.replace(/\/\/[^:]*:[^@]*@/, '//<credentials>@')}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Invalid RabbitMQ URL: ${errorMsg}`);
      throw new Error(`Invalid RabbitMQ URL: ${errorMsg}`);
    }
  }

  /**
   * Підключення до RabbitMQ
   */
  async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return; // Вже підключено
    }

    if (this.connecting) {
      return; // Вже в процесі підключення
    }

    this.connecting = true;

    try {
      // Підключаємося до RabbitMQ
      this.connection = await amqp.connect(this.url);

      // Налаштовуємо обробники подій
      this.connection.on('error', (err) => {
        logger.error(`RabbitMQ connection error: ${err.message}`);
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.info('RabbitMQ connection closed');
        this.reconnect();
      });

      // Створюємо канал
      this.channel = await this.connection.createChannel();

      // Налаштовуємо обробники подій для каналу
      this.channel.on('error', (err) => {
        logger.error(`RabbitMQ channel error: ${err.message}`);
        this.recreateChannel();
      });

      this.channel.on('close', () => {
        logger.info('RabbitMQ channel closed');
        this.recreateChannel();
      });

      // Створюємо тестову чергу для перевірок
      await this.channel.assertQueue(this.healthCheckQueue, { 
        durable: false, 
        autoDelete: true 
      });

      // Запускаємо періодичну перевірку з'єднання
      this.startHealthCheck();

      // Відновлюємо споживачів
      await this.restoreConsumers();

      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
      this.reconnect();
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Повторне підключення у випадку помилки
   */
  private reconnect(delay: number = 5000): void {
    // Скасовуємо попередній таймер, якщо є
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Очищаємо посилання на з'єднання та канал
    this.connection = null;
    this.channel = null;

    // Зупиняємо перевірку з'єднання
    this.stopHealthCheck();

    logger.info(`Attempting to reconnect to RabbitMQ in ${delay}ms...`);

    // Налаштовуємо таймер для повторного підключення
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error(`Failed to reconnect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
        this.reconnect(Math.min(delay * 2, 60000)); // Експоненціальне відтермінування, максимум 1 хвилина
      }
    }, delay);
  }

  /**
   * Повторне створення каналу
   */
  private async recreateChannel(): Promise<void> {
    if (!this.connection) {
      await this.connect();
      return;
    }

    try {
      // Закриваємо попередній канал, якщо він існує
      if (this.channel) {
        try {
          await this.channel.close();
        } catch (error) {
          logger.debug(`Error closing channel, it might be already closed: ${error instanceof Error ? error.message : String(error)}`);
          // Ігноруємо помилки закриття
        }
      }

      // Створюємо новий канал
      this.channel = await this.connection.createChannel();

      // Налаштовуємо обробники подій
      this.channel.on('error', (err) => {
        logger.error(`RabbitMQ channel error: ${err.message}`);
        this.recreateChannel();
      });

      this.channel.on('close', () => {
        logger.info('RabbitMQ channel closed');
        this.recreateChannel();
      });

      // Створюємо тестову чергу для перевірок
      await this.channel.assertQueue(this.healthCheckQueue, { 
        durable: false, 
        autoDelete: true 
      });

      // Відновлюємо споживачів
      await this.restoreConsumers();

      logger.info('RabbitMQ channel recreated');
    } catch (error) {
      logger.error(`Failed to recreate RabbitMQ channel: ${error instanceof Error ? error.message : String(error)}`);
      this.reconnect();
    }
  }

  /**
   * Відновлення споживачів після перепідключення
   */
  private async restoreConsumers(): Promise<void> {
    if (!this.channel) return;

    try {
      for (const [queue, handler] of this.consumers.entries()) {
        try {
          // Оголошуємо чергу заново
          await this.channel.assertQueue(queue, { durable: true });

          // Налаштовуємо споживання
          await this.setupConsumer(queue, handler);

          logger.info(`Consumer restored for queue: ${queue}`);
        } catch (error) {
          logger.error(
            `Failed to restore consumer for queue ${queue}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      logger.error(`Failed to restore consumers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Налаштування перевірки здоров'я з'єднання
   */
  private startHealthCheck(): void {
    // Скасовуємо попередній таймер, якщо є
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Запускаємо періодичну перевірку
    this.healthCheckTimer = setInterval(async () => {
      try {
        if (!this.channel || !this.connection) {
          throw new Error('Channel or connection is null');
        }

        // Перевіряємо з'єднання з RabbitMQ через тестову чергу
        await this.channel.checkQueue(this.healthCheckQueue);
      } catch (error) {
        logger.warn(`RabbitMQ health check failed: ${error instanceof Error ? error.message : String(error)}`);
        this.reconnect();
      }
    }, this.healthCheckInterval);
  }

  /**
   * Зупинка перевірки здоров'я з'єднання
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Оголошення черги
   */
  async assertQueue(
    queue: string,
    options: Options.AssertQueue = { durable: true }
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      await this.channel.assertQueue(queue, options);
      logger.debug(`Queue ${queue} asserted`);
    } catch (error) {
      logger.error(`Failed to assert queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Оголошення обміну (exchange)
   */
  async assertExchange(
    exchange: string,
    type: string = 'direct',
    options: Options.AssertExchange = { durable: true }
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      await this.channel.assertExchange(exchange, type, options);
      logger.debug(`Exchange ${exchange} of type ${type} asserted`);
    } catch (error) {
      logger.error(`Failed to assert exchange ${exchange}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Прив'язка черги до обміну
   */
  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      await this.channel.bindQueue(queue, exchange, routingKey);
      logger.debug(
        `Queue ${queue} bound to exchange ${exchange} with routing key ${routingKey}`
      );
    } catch (error) {
      logger.error(
        `Failed to bind queue ${queue} to exchange ${exchange}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Відправка повідомлення у чергу
   */
  async sendToQueue(
    queue: string,
    content: any,
    options: Options.Publish = { persistent: true }
  ): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      // Перевіряємо чи існує черга
      await this.assertQueue(queue);

      // Перетворюємо дані в буфер, якщо потрібно
      const buffer = Buffer.isBuffer(content)
        ? content
        : Buffer.from(JSON.stringify(content));

      // Відправляємо повідомлення в чергу
      const result = this.channel.sendToQueue(queue, buffer, options);

      logger.debug(`Message sent to queue ${queue}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send message to queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Відправка повідомлення в чергу з повторними спробами
   */
  async sendToQueueWithRetry(
    queue: string,
    content: any,
    options: Options.Publish = { persistent: true },
    maxRetries: number = 3
  ): Promise<boolean> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      try {
        if (!this.channel || !this.isConnected()) {
          await this.connect();
        }

        if (!this.channel) {
          throw new Error('Failed to establish channel');
        }

        // Перевіряємо чергу перед відправкою
        await this.assertQueue(queue);

        const buffer = Buffer.isBuffer(content)
          ? content
          : Buffer.from(JSON.stringify(content));

        const result = this.channel.sendToQueue(queue, buffer, options);

        if (result) {
          logger.debug(`Message sent to queue ${queue}`);
          return true;
        }
        
        logger.warn(`Failed to send message to queue ${queue} (buffer full), retrying...`);
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempts))
        );
        attempts++;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `Error sending message to queue ${queue} (attempt ${attempts + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempts))
        );
        attempts++;

        try {
          if (!this.isConnected()) {
            await this.connect();
          }
        } catch (connectionError) {
          logger.error(`Failed to reconnect: ${connectionError instanceof Error ? connectionError.message : connectionError}`);
        }
      }
    }

    logger.error(`Failed to send message to queue ${queue} after ${maxRetries} attempts. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    return false;
  }

  /**
   * Відправка повідомлення в обмін
   */
  async publishToExchange(
    exchange: string,
    routingKey: string,
    content: any,
    options: Options.Publish = { persistent: true }
  ): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      // Перевіряємо чи існує обмін
      await this.assertExchange(exchange);

      // Перетворюємо дані в буфер, якщо потрібно
      const buffer = Buffer.isBuffer(content)
        ? content
        : Buffer.from(JSON.stringify(content));

      // Відправляємо повідомлення в обмін
      const result = this.channel.publish(
        exchange,
        routingKey,
        buffer,
        options
      );

      logger.debug(
        `Message published to exchange ${exchange} with routing key ${routingKey}`
      );
      return result;
    } catch (error) {
      logger.error(
        `Failed to publish message to exchange ${exchange}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Відправка повідомлення в обмін з повторними спробами
   */
  async publishWithRetry(
    exchange: string,
    routingKey: string,
    content: any,
    options: Options.Publish = { persistent: true },
    maxRetries: number = 3
  ): Promise<boolean> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      try {
        if (!this.channel || !this.isConnected()) {
          await this.connect();
        }

        if (!this.channel) {
          throw new Error('Failed to establish channel');
        }

        // Перевіряємо exchange перед відправкою
        await this.assertExchange(exchange);

        const buffer = Buffer.isBuffer(content)
          ? content
          : Buffer.from(JSON.stringify(content));

        const result = this.channel.publish(
          exchange,
          routingKey,
          buffer,
          options
        );

        if (result) {
          logger.debug(
            `Message published to exchange ${exchange} with routing key ${routingKey}`
          );
          return true;
        }
        
        // Канал перевантажений, чекаємо перед повторною спробою
        logger.warn(`Channel flow controlled (buffer full), retrying...`);
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempts))
        );
        attempts++;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `Error publishing message (attempt ${attempts + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempts))
        );
        attempts++;

        // Спроба перепідключення
        try {
          if (!this.isConnected()) {
            await this.connect();
          }
        } catch (connectionError) {
          logger.error(`Failed to reconnect: ${connectionError instanceof Error ? connectionError.message : connectionError}`);
        }
      }
    }

    logger.error(`Failed to publish message after ${maxRetries} attempts. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
    return false;
  }

  /**
   * Налаштування споживача для черги
   */
  private async setupConsumer(
    queue: string,
    handler: MessageHandler
  ): Promise<string> {
    if (!this.channel) {
      throw new Error('Channel is not initialized');
    }

    const { consumerTag } = await this.channel.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (msg) {
          try {
            // Розбираємо вміст повідомлення
            const content = JSON.parse(msg.content.toString());

            // Обробляємо повідомлення
            await handler(content);

            // Підтверджуємо обробку повідомлення
            this.channel!.ack(msg);
            logger.debug(`Message from queue ${queue} processed successfully`);
          } catch (error) {
            logger.error(
              `Error processing message from queue ${queue}: ${error instanceof Error ? error.message : error}`
            );

            // Повертаємо повідомлення в чергу, якщо обробка не вдалася
            if (this.channel) {
              this.channel.nack(msg, false, true);
            }
          }
        }
      }
    );

    return consumerTag;
  }

  /**
   * Споживання повідомлень з черги
   */
  async consumeQueue(queue: string, handler: MessageHandler): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      // Перевіряємо чи існує черга
      await this.assertQueue(queue);

      // Зберігаємо обробник для можливого відновлення
      this.consumers.set(queue, handler);

      // Налаштовуємо споживання
      await this.setupConsumer(queue, handler);

      logger.info(`Consumer set up for queue ${queue}`);
    } catch (error) {
      logger.error(`Failed to set up consumer for queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Очищення черги
   */
  async purgeQueue(queue: string): Promise<number> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      const { messageCount } = await this.channel.purgeQueue(queue);
      logger.info(`Queue ${queue} purged, ${messageCount} messages removed`);
      return messageCount;
    } catch (error) {
      logger.error(`Failed to purge queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Видалення черги
   */
  async deleteQueue(
    queue: string,
    options: Options.DeleteQueue = { ifEmpty: false }
  ): Promise<number> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      // Видаляємо обробник, якщо є
      this.consumers.delete(queue);

      const { messageCount } = await this.channel.deleteQueue(queue, options);
      logger.info(`Queue ${queue} deleted, ${messageCount} messages removed`);
      return messageCount;
    } catch (error) {
      logger.error(`Failed to delete queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Видалення обміну
   */
  async deleteExchange(
    exchange: string,
    options: Options.DeleteExchange = {}
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      await this.channel.deleteExchange(exchange, options);
      logger.info(`Exchange ${exchange} deleted`);
    } catch (error) {
      logger.error(`Failed to delete exchange ${exchange}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Отримання інформації про чергу
   */
  async checkQueue(queue: string): Promise<amqp.Replies.AssertQueue> {
    try {
      if (!this.channel) {
        await this.connect();
      }

      if (!this.channel) {
        throw new Error('Failed to establish channel');
      }

      return await this.channel.checkQueue(queue);
    } catch (error) {
      logger.error(`Failed to check queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Перевірка з'єднання з RabbitMQ
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Закриття з'єднання
   */
  async close(): Promise<void> {
    // Зупиняємо перевірку з'єднання
    this.stopHealthCheck();

    // Скасовуємо таймер повторного підключення
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      // Закриваємо канал
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
        logger.info('RabbitMQ channel closed');
      }

      // Закриваємо з'єднання
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        logger.info('RabbitMQ connection closed');
      }
    } catch (error) {
      logger.error(`Error closing RabbitMQ connection: ${error instanceof Error ? error.message : error}`);
    }
  }
}

// Створюємо єдиний екземпляр сервісу
export const rabbitmq = new RabbitMQService();


// import amqp, { Channel, Connection, ConsumeMessage, Options } from 'amqplib';
// import { config } from '../config/env';
// import { logger } from './logger';

// type MessageHandler = (content: any) => Promise<void>;

// /**
//  * Сервіс для роботи з RabbitMQ
//  */
// class RabbitMQService {
//   private connection: Connection | null = null;
//   private channel: Channel | null = null;
//   private url: string;
//   private connecting: boolean = false;
//   private reconnectTimer: NodeJS.Timeout | null = null;
//   private consumers: Map<string, MessageHandler> = new Map();
//   private healthCheckTimer: NodeJS.Timeout | null = null;
//   private readonly healthCheckInterval: number = 30000; // 30 секунд

//   constructor() {
//     // Формування URL підключення з урахуванням креденшалів
//     const { rabbitmqUrl, rabbitmqUser, rabbitmqPassword } = config;

//     if (!rabbitmqUrl) {
//       throw new Error('RabbitMQ URL is not defined in configuration');
//     }

//     // Парсимо URL для додавання користувача і пароля, якщо вони вказані
//     const urlObj = new URL(rabbitmqUrl);
//     if (rabbitmqUser && rabbitmqPassword) {
//       urlObj.username = rabbitmqUser;
//       urlObj.password = rabbitmqPassword;
//     }

//     this.url = urlObj.toString();
//   }

//   /**
//    * Підключення до RabbitMQ
//    */
//   async connect(): Promise<void> {
//     if (this.connection && this.channel) {
//       return; // Вже підключено
//     }

//     if (this.connecting) {
//       return; // Вже в процесі підключення
//     }

//     this.connecting = true;

//     try {
//       // Підключаємося до RabbitMQ
//       this.connection = await amqp.connect(this.url);

//       // Налаштовуємо обробники подій
//       this.connection.on('error', (err) => {
//         logger.error(`RabbitMQ connection error: ${err.message}`);
//         this.reconnect();
//       });

//       this.connection.on('close', () => {
//         logger.info('RabbitMQ connection closed');
//         this.reconnect();
//       });

//       // Створюємо канал
//       this.channel = await this.connection.createChannel();

//       // Налаштовуємо обробники подій для каналу
//       this.channel.on('error', (err) => {
//         logger.error(`RabbitMQ channel error: ${err.message}`);
//         this.recreateChannel();
//       });

//       this.channel.on('close', () => {
//         logger.info('RabbitMQ channel closed');
//         this.recreateChannel();
//       });

//       // Запускаємо періодичну перевірку з'єднання
//       this.startHealthCheck();

//       // Відновлюємо споживачів
//       await this.restoreConsumers();

//       logger.info('Connected to RabbitMQ');
//     } catch (error) {
//       logger.error(`Failed to connect to RabbitMQ: ${error}`);
//       this.reconnect();
//     } finally {
//       this.connecting = false;
//     }
//   }

//   /**
//    * Повторне підключення у випадку помилки
//    */
//   private reconnect(delay: number = 5000): void {
//     // Скасовуємо попередній таймер, якщо є
//     if (this.reconnectTimer) {
//       clearTimeout(this.reconnectTimer);
//     }

//     // Очищаємо посилання на з'єднання та канал
//     this.connection = null;
//     this.channel = null;

//     // Зупиняємо перевірку з'єднання
//     this.stopHealthCheck();

//     logger.info(`Attempting to reconnect to RabbitMQ in ${delay}ms...`);

//     // Налаштовуємо таймер для повторного підключення
//     this.reconnectTimer = setTimeout(async () => {
//       try {
//         await this.connect();
//       } catch (error) {
//         logger.error(`Failed to reconnect to RabbitMQ: ${error}`);
//         this.reconnect(Math.min(delay * 2, 60000)); // Експоненціальне відтермінування, максимум 1 хвилина
//       }
//     }, delay);
//   }

//   /**
//    * Повторне створення каналу
//    */
//   private async recreateChannel(): Promise<void> {
//     if (!this.connection) {
//       await this.connect();
//       return;
//     }

//     try {
//       // Закриваємо попередній канал, якщо він існує
//       if (this.channel) {
//         try {
//           await this.channel.close();
//         } catch (error) {
//           // Ігноруємо помилки закриття
//         }
//       }

//       // Створюємо новий канал
//       this.channel = await this.connection.createChannel();

//       // Налаштовуємо обробники подій
//       this.channel.on('error', (err) => {
//         logger.error(`RabbitMQ channel error: ${err.message}`);
//         this.recreateChannel();
//       });

//       this.channel.on('close', () => {
//         logger.info('RabbitMQ channel closed');
//         this.recreateChannel();
//       });

//       // Відновлюємо споживачів
//       await this.restoreConsumers();

//       logger.info('RabbitMQ channel recreated');
//     } catch (error) {
//       logger.error(`Failed to recreate RabbitMQ channel: ${error}`);
//       this.reconnect();
//     }
//   }

//   /**
//    * Відновлення споживачів після перепідключення
//    */
//   private async restoreConsumers(): Promise<void> {
//     if (!this.channel) return;

//     try {
//       for (const [queue, handler] of this.consumers.entries()) {
//         try {
//           // Оголошуємо чергу заново
//           await this.channel.assertQueue(queue, { durable: true });

//           // Налаштовуємо споживання
//           await this.setupConsumer(queue, handler);

//           logger.info(`Consumer restored for queue: ${queue}`);
//         } catch (error) {
//           logger.error(
//             `Failed to restore consumer for queue ${queue}: ${error}`
//           );
//         }
//       }
//     } catch (error) {
//       logger.error(`Failed to restore consumers: ${error}`);
//     }
//   }

//   /**
//    * Налаштування перевірки здоров'я з'єднання
//    */
//   private startHealthCheck(): void {
//     // Скасовуємо попередній таймер, якщо є
//     if (this.healthCheckTimer) {
//       clearTimeout(this.healthCheckTimer);
//     }

//     // Запускаємо періодичну перевірку
//     this.healthCheckTimer = setInterval(async () => {
//       try {
//         if (!this.channel || !this.connection) {
//           throw new Error('Channel or connection is null');
//         }

//         // Перевіряємо з'єднання з RabbitMQ
//         if (this.channel.checkQueue) {
//           // Перевіряємо чи існує тестова черга
//           await this.channel.checkQueue('health_check_queue');
//         }
//       } catch (error) {
//         logger.warn(`RabbitMQ health check failed: ${error}`);
//         this.reconnect();
//       }
//     }, this.healthCheckInterval);
//   }

//   /**
//    * Зупинка перевірки здоров'я з'єднання
//    */
//   private stopHealthCheck(): void {
//     if (this.healthCheckTimer) {
//       clearInterval(this.healthCheckTimer);
//       this.healthCheckTimer = null;
//     }
//   }

//   /**
//    * Оголошення черги
//    */
//   async assertQueue(
//     queue: string,
//     options: Options.AssertQueue = { durable: true }
//   ): Promise<void> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       await this.channel!.assertQueue(queue, options);
//       logger.debug(`Queue ${queue} asserted`);
//     } catch (error) {
//       logger.error(`Failed to assert queue ${queue}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Оголошення обміну (exchange)
//    */
//   async assertExchange(
//     exchange: string,
//     type: string = 'direct',
//     options: Options.AssertExchange = { durable: true }
//   ): Promise<void> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       await this.channel!.assertExchange(exchange, type, options);
//       logger.debug(`Exchange ${exchange} of type ${type} asserted`);
//     } catch (error) {
//       logger.error(`Failed to assert exchange ${exchange}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Прив'язка черги до обміну
//    */
//   async bindQueue(
//     queue: string,
//     exchange: string,
//     routingKey: string
//   ): Promise<void> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       await this.channel!.bindQueue(queue, exchange, routingKey);
//       logger.debug(
//         `Queue ${queue} bound to exchange ${exchange} with routing key ${routingKey}`
//       );
//     } catch (error) {
//       logger.error(
//         `Failed to bind queue ${queue} to exchange ${exchange}: ${error}`
//       );
//       throw error;
//     }
//   }

//   /**
//    * Відправка повідомлення у чергу
//    */
//   async sendToQueue(
//     queue: string,
//     content: any,
//     options: Options.Publish = { persistent: true }
//   ): Promise<boolean> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       // Перевіряємо чи існує черга
//       await this.assertQueue(queue);

//       // Перетворюємо дані в буфер, якщо потрібно
//       const buffer = Buffer.isBuffer(content)
//         ? content
//         : Buffer.from(JSON.stringify(content));

//       // Відправляємо повідомлення в чергу
//       const result = this.channel!.sendToQueue(queue, buffer, options);

//       logger.debug(`Message sent to queue ${queue}`);
//       return result;
//     } catch (error) {
//       logger.error(`Failed to send message to queue ${queue}: ${error}`);
//       return false;
//     }
//   }

//   /**
//    * Відправка повідомлення в обмін
//    */
//   async publishToExchange(
//     exchange: string,
//     routingKey: string,
//     content: any,
//     options: Options.Publish = { persistent: true }
//   ): Promise<boolean> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       // Перетворюємо дані в буфер, якщо потрібно
//       const buffer = Buffer.isBuffer(content)
//         ? content
//         : Buffer.from(JSON.stringify(content));

//       // Відправляємо повідомлення в обмін
//       const result = this.channel!.publish(
//         exchange,
//         routingKey,
//         buffer,
//         options
//       );

//       logger.debug(
//         `Message published to exchange ${exchange} with routing key ${routingKey}`
//       );
//       return result;
//     } catch (error) {
//       logger.error(
//         `Failed to publish message to exchange ${exchange}: ${error}`
//       );
//       return false;
//     }
//   }

//   /**
//    * Налаштування споживача для черги
//    */
//   private async setupConsumer(
//     queue: string,
//     handler: MessageHandler
//   ): Promise<string> {
//     if (!this.channel) {
//       throw new Error('Channel is not initialized');
//     }

//     const { consumerTag } = await this.channel.consume(
//       queue,
//       async (msg: ConsumeMessage | null) => {
//         if (msg) {
//           try {
//             // Розбираємо вміст повідомлення
//             const content = JSON.parse(msg.content.toString());

//             // Обробляємо повідомлення
//             await handler(content);

//             // Підтверджуємо обробку повідомлення
//             this.channel!.ack(msg);
//             logger.debug(`Message from queue ${queue} processed successfully`);
//           } catch (error) {
//             logger.error(
//               `Error processing message from queue ${queue}: ${error}`
//             );

//             // Повертаємо повідомлення в чергу, якщо обробка не вдалася
//             this.channel!.nack(msg, false, true);
//           }
//         }
//       }
//     );

//     return consumerTag;
//   }

//   /**
//    * Споживання повідомлень з черги
//    */
//   async consumeQueue(queue: string, handler: MessageHandler): Promise<void> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       // Перевіряємо чи існує черга
//       await this.assertQueue(queue);

//       // Зберігаємо обробник для можливого відновлення
//       this.consumers.set(queue, handler);

//       // Налаштовуємо споживання
//       await this.setupConsumer(queue, handler);

//       logger.info(`Consumer set up for queue ${queue}`);
//     } catch (error) {
//       logger.error(`Failed to set up consumer for queue ${queue}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Очищення черги
//    */
//   async purgeQueue(queue: string): Promise<number> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       const { messageCount } = await this.channel!.purgeQueue(queue);
//       logger.info(`Queue ${queue} purged, ${messageCount} messages removed`);
//       return messageCount;
//     } catch (error) {
//       logger.error(`Failed to purge queue ${queue}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Видалення черги
//    */
//   async deleteQueue(
//     queue: string,
//     options: Options.DeleteQueue = { ifEmpty: false }
//   ): Promise<number> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       // Видаляємо обробник, якщо є
//       this.consumers.delete(queue);

//       const { messageCount } = await this.channel!.deleteQueue(queue, options);
//       logger.info(`Queue ${queue} deleted, ${messageCount} messages removed`);
//       return messageCount;
//     } catch (error) {
//       logger.error(`Failed to delete queue ${queue}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Видалення обміну
//    */
//   async deleteExchange(
//     exchange: string,
//     options: Options.DeleteExchange = {}
//   ): Promise<void> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       await this.channel!.deleteExchange(exchange, options);
//       logger.info(`Exchange ${exchange} deleted`);
//     } catch (error) {
//       logger.error(`Failed to delete exchange ${exchange}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Отримання інформації про чергу
//    */
//   async checkQueue(queue: string): Promise<amqp.Replies.AssertQueue> {
//     try {
//       if (!this.channel) {
//         await this.connect();
//       }

//       return await this.channel!.checkQueue(queue);
//     } catch (error) {
//       logger.error(`Failed to check queue ${queue}: ${error}`);
//       throw error;
//     }
//   }

//   /**
//    * Перевірка з'єднання з RabbitMQ
//    */
//   isConnected(): boolean {
//     return this.connection !== null && this.channel !== null;
//   }

//   /**
//    * Закриття з'єднання
//    */
//   async close(): Promise<void> {
//     // Зупиняємо перевірку з'єднання
//     this.stopHealthCheck();

//     // Скасовуємо таймер повторного підключення
//     if (this.reconnectTimer) {
//       clearTimeout(this.reconnectTimer);
//       this.reconnectTimer = null;
//     }

//     try {
//       // Закриваємо канал
//       if (this.channel) {
//         await this.channel.close();
//         this.channel = null;
//         logger.info('RabbitMQ channel closed');
//       }

//       // Закриваємо з'єднання
//       if (this.connection) {
//         await this.connection.close();
//         this.connection = null;
//         logger.info('RabbitMQ connection closed');
//       }
//     } catch (error) {
//       logger.error(`Error closing RabbitMQ connection: ${error}`);
//     }
//   }
//   // Add this function to src/utils/rabbitmq.ts

//   /**
//    * Safe method to publish to queue with automatic reconnection attempts
//    */
//   async publishWithRetry(
//     exchange: string,
//     routingKey: string,
//     content: any,
//     options: Options.Publish = { persistent: true },
//     maxRetries: number = 3
//   ): Promise<boolean> {
//     let attempts = 0;

//     while (attempts < maxRetries) {
//       try {
//         if (!this.channel || !this.isConnected()) {
//           await this.connect();
//         }

//         const buffer = Buffer.isBuffer(content)
//           ? content
//           : Buffer.from(JSON.stringify(content));

//         const result = this.channel!.publish(
//           exchange,
//           routingKey,
//           buffer,
//           options
//         );

//         if (result) {
//           logger.debug(
//             `Message published to exchange ${exchange} with routing key ${routingKey}`
//           );
//           return true;
//         } else {
//           logger.warn(`Failed to publish message (buffer full), retrying...`);
//           await new Promise((resolve) =>
//             setTimeout(resolve, 1000 * Math.pow(2, attempts))
//           );
//           attempts++;
//         }
//       } catch (error) {
//         logger.error(
//           `Error publishing message (attempt ${attempts + 1}/${maxRetries}): ${error}`
//         );
//         await new Promise((resolve) =>
//           setTimeout(resolve, 1000 * Math.pow(2, attempts))
//         );
//         attempts++;

//         // Try to reconnect
//         if (!this.isConnected()) {
//           await this.connect().catch(() => {
//             // Connection failed, will retry on next iteration
//           });
//         }
//       }
//     }

//     logger.error(`Failed to publish message after ${maxRetries} attempts`);
//     return false;
//   }
// }

// // Створюємо єдиний екземпляр сервісу
// export const rabbitmq = new RabbitMQService();
