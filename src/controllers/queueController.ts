import { Request, Response, NextFunction } from 'express';
import { rabbitmq } from '../utils/rabbitmq';
import { logger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config/env';

// Функція для роботи з помилками
const handleAxiosError = (error: unknown): { message: string } => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.message || error.message
    };
  }
  
  return {
    message: error instanceof Error ? error.message : 'Unknown error'
  };
};

export const queueController = {
  /**
   * Отримання статистики черг
   */
  async getQueueStats(req: Request, res: Response, next: NextFunction) {
    try {
      // RabbitMQ Management API вимагає HTTP Basic Auth
      const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
      
      // Отримуємо статистику черг через Management API
      const response = await axios.get(`http://${config.rabbitmqUrl}:15672/api/queues`, {
        headers: {
          'Authorization': `Basic ${authString}`
        }
      });
      
      const queues = response.data.map((queue: any) => ({
        name: queue.name,
        messages: queue.messages,
        consumers: queue.consumers,
        state: queue.state,
        messageStat: {
          ready: queue.messages_ready,
          unacknowledged: queue.messages_unacknowledged,
          total: queue.messages
        },
        messageRate: {
          incoming: queue.message_stats?.publish_details?.rate || 0,
          deliverGet: queue.message_stats?.deliver_get_details?.rate || 0,
          ack: queue.message_stats?.ack_details?.rate || 0
        }
      }));
      
      res.status(200).json({
        status: 'success',
        data: {
          queues
        }
      });
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error fetching queue stats: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати статистику черг',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Отримання списку всіх черг
   */
  async listQueues(req: Request, res: Response, next: NextFunction) {
    try {
      // RabbitMQ Management API вимагає HTTP Basic Auth
      const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
      
      // Отримуємо список черг через Management API
      const response = await axios.get(`http://${config.rabbitmqUrl}:15672/api/queues`, {
        headers: {
          'Authorization': `Basic ${authString}`
        }
      });
      
      const queues = response.data.map((queue: any) => ({
        name: queue.name,
        vhost: queue.vhost,
        durable: queue.durable,
        autoDelete: queue.auto_delete,
        exclusive: queue.exclusive,
        messages: queue.messages,
        consumers: queue.consumers
      }));
      
      res.status(200).json({
        status: 'success',
        data: {
          queues
        }
      });
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error listing queues: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати список черг',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Очищення черги
   */
  async purgeQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.params;
      
      // Очищаємо чергу через RabbitMQ клієнт
      try {
        const messageCount = await rabbitmq.purgeQueue(queueName);
        
        res.status(200).json({
          status: 'success',
          message: `Черга ${queueName} успішно очищена`,
          data: {
            queueName,
            messageCount
          }
        });
      } catch (purgeError) {
        // Якщо клієнт не зміг очистити чергу, спробуємо через API
        const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
        
        await axios.delete(`http://${config.rabbitmqUrl}:15672/api/queues/%2F/${queueName}/contents`, {
          headers: {
            'Authorization': `Basic ${authString}`
          }
        });
        
        res.status(200).json({
          status: 'success',
          message: `Черга ${queueName} успішно очищена через API`
        });
      }
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error purging queue: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося очистити чергу',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Видалення черги
   */
  async deleteQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.params;
      
      // Видаляємо чергу через RabbitMQ клієнт
      try {
        const messageCount = await rabbitmq.deleteQueue(queueName);
        
        res.status(200).json({
          status: 'success',
          message: `Черга ${queueName} успішно видалена`,
          data: {
            queueName,
            messageCount
          }
        });
      } catch (deleteError) {
        // Якщо клієнт не зміг видалити чергу, спробуємо через API
        const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
        
        await axios.delete(`http://${config.rabbitmqUrl}:15672/api/queues/%2F/${queueName}`, {
          headers: {
            'Authorization': `Basic ${authString}`
          }
        });
        
        res.status(200).json({
          status: 'success',
          message: `Черга ${queueName} успішно видалена через API`
        });
      }
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error deleting queue: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося видалити чергу',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Відправка тестового повідомлення в чергу
   */
  async sendTestMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.params;
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({
          status: 'error',
          message: 'Повідомлення не вказано'
        });
      }
      
      // Додаємо метадані
      const testMessage = {
        ...message,
        _meta: {
          type: 'test',
          sentBy: (req as any).userId, // Приведення типу, оскільки userId може бути додано в middleware
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      };
      
      // Відправляємо тестове повідомлення в чергу
      const success = await rabbitmq.sendToQueue(queueName, testMessage);
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: `Тестове повідомлення надіслано в чергу ${queueName}`,
          data: {
            queueName,
            sentAt: new Date().toISOString()
          }
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Не вдалося надіслати повідомлення в чергу'
        });
      }
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error sending test message: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося надіслати тестове повідомлення',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Отримання повідомлень з черги
   */
  async getQueueMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { queueName } = req.params;
      const count = parseInt(req.query.count as string) || 10;
      const requeue = req.query.requeue === 'true';
      
      // RabbitMQ Management API вимагає HTTP Basic Auth
      const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
      
      // Отримуємо повідомлення з черги через Management API
      const response = await axios.post(
        `http://${config.rabbitmqUrl}:15672/api/queues/%2F/${queueName}/get`, 
        {
          count,
          requeue,
          encoding: 'auto',
          truncate: 50000  // Обмеження розміру повідомлення
        },
        {
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Форматуємо повідомлення
      const messages = response.data.map((msg: any) => {
        try {
          return {
            messageId: msg.properties.message_id,
            payload: msg.payload,
            properties: msg.properties,
            routingKey: msg.routing_key,
            redelivered: msg.redelivered,
            exchange: msg.exchange,
          };
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
          return {
            error: `Failed to parse message: ${errorMsg}`,
            raw: msg
          };
        }
      });
      
      res.status(200).json({
        status: 'success',
        data: {
          queueName,
          messages,
          count: messages.length,
          requeued: requeue
        }
      });
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error getting queue messages: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати повідомлення з черги',
        error: errorDetails.message
      });
    }
  },
  
  /**
   * Отримання інформації про споживачів
   */
  async getConsumers(req: Request, res: Response, next: NextFunction) {
    try {
      // RabbitMQ Management API вимагає HTTP Basic Auth
      const authString = Buffer.from(`${config.rabbitmqUser}:${config.rabbitmqPassword}`).toString('base64');
      
      // Отримуємо інформацію про споживачів через Management API
      const response = await axios.get(`http://${config.rabbitmqUrl}:15672/api/consumers`, {
        headers: {
          'Authorization': `Basic ${authString}`
        }
      });
      
      // Групуємо споживачів за чергами
      const consumersByQueue: { [queue: string]: any[] } = {};
      
      response.data.forEach((consumer: any) => {
        const queueName = consumer.queue.name;
        
        if (!consumersByQueue[queueName]) {
          consumersByQueue[queueName] = [];
        }
        
        consumersByQueue[queueName].push({
          consumerTag: consumer.consumer_tag,
          channelDetails: consumer.channel_details,
          ackRequired: consumer.ack_required,
          exclusive: consumer.exclusive,
          arguments: consumer.arguments
        });
      });
      
      res.status(200).json({
        status: 'success',
        data: {
          consumersByQueue,
          totalConsumers: response.data.length
        }
      });
    } catch (error) {
      const errorDetails = handleAxiosError(error);
      logger.error(`Error getting consumers: ${errorDetails.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Не вдалося отримати інформацію про споживачів',
        error: errorDetails.message
      });
    }
  }
};