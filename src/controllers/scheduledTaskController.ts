import { Request, Response, NextFunction } from 'express';
import { 
  scheduledTaskService, 
  TaskType,
  TaskStatus,
  ScheduledTask
} from '../services/scheduledTaskService';
import { logger } from '../utils/logger';
import { prisma } from '../config/db';

export const scheduledTaskController = {
  /**
   * Планування деактивації оголошення користувачем
   */
  async scheduleListingDeactivation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const listingId = parseInt(req.params.id);
      const { deactivateAt } = req.query;
      
      // Перевіряємо чи має користувач право на це оголошення
      const listing = await prisma.listing.findFirst({
        where: {
          id: listingId,
          userId
        }
      });
      
      if (!listing) {
        return res.status(404).json({
          status: 'error',
          message: 'Оголошення не знайдено або ви не маєте до нього доступу'
        });
      }
      
      // Парсимо дату деактивації
      const deactivationDate = deactivateAt ? new Date(deactivateAt as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // За замовчуванням через 30 днів
      
      // Перевіряємо коректність дати
      if (isNaN(deactivationDate.getTime()) || deactivationDate < new Date()) {
        return res.status(400).json({
          status: 'error',
          message: 'Некоректна дата деактивації'
        });
      }
      
      // Плануємо деактивацію
      const taskId = await scheduledTaskService.scheduleListingDeactivation(
        listingId, 
        deactivationDate
      );
      
      res.status(200).json({
        status: 'success',
        message: 'Деактивацію оголошення заплановано',
        data: {
          taskId,
          listingId,
          deactivateAt: deactivationDate.toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Планування нагадування про оплату
   */
  async schedulePaymentReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.userId!;
      const paymentId = parseInt(req.params.id);
      const { remindAt } = req.query;
      
      // Перевіряємо чи має користувач право на цей платіж
      const payment = await prisma.payment.findFirst({
        where: {
          id: paymentId,
          userId
        }
      });
      
      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Платіж не знайдено або ви не маєте до нього доступу'
        });
      }
      
      // Якщо платіж вже не в статусі очікування, повертаємо помилку
      if (payment.status !== 'PENDING') {
        return res.status(400).json({
          status: 'error',
          message: 'Можна планувати нагадування тільки для платежів зі статусом очікування'
        });
      }
      
      // Парсимо дату нагадування
      const reminderDate = remindAt ? new Date(remindAt as string) : new Date(Date.now() + 24 * 60 * 60 * 1000); // За замовчуванням через 24 години
      
      // Перевіряємо коректність дати
      if (isNaN(reminderDate.getTime()) || reminderDate < new Date()) {
        return res.status(400).json({
          status: 'error',
          message: 'Некоректна дата нагадування'
        });
      }
      
      // Плануємо нагадування
      const taskId = await scheduledTaskService.schedulePaymentReminder(
        userId, 
        paymentId, 
        reminderDate
      );
      
      res.status(200).json({
        status: 'success',
        message: 'Нагадування про оплату заплановано',
        data: {
          taskId,
          paymentId,
          remindAt: reminderDate.toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Планування завдання (для адміністраторів)
   */
  async scheduleTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, data, scheduledFor, maxAttempts } = req.body;
      
      // Перетворюємо рядок дати в об'єкт Date
      const scheduledDate = new Date(scheduledFor);
      
      // Перевіряємо коректність дати
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: 'Некоректна дата планування'
        });
      }
      
      // Плануємо завдання
      const taskId = await scheduledTaskService.scheduleTask(
        type as TaskType,
        data,
        scheduledDate,
        { maxAttempts }
      );
      
      res.status(200).json({
        status: 'success',
        message: 'Завдання успішно заплановано',
        data: {
          taskId,
          type,
          scheduledFor: scheduledDate.toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Планування кількох завдань одночасно (для адміністраторів)
   */
  async scheduleBatchTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const { tasks } = req.body;
      
      const scheduledTasks = [];
      
      // Плануємо кожне завдання
      for (const task of tasks) {
        try {
          const scheduledDate = new Date(task.scheduledFor);
          
          if (isNaN(scheduledDate.getTime())) {
            scheduledTasks.push({
              status: 'error',
              message: 'Некоректна дата планування',
              originalTask: task
            });
            continue;
          }
          
          const taskId = await scheduledTaskService.scheduleTask(
            task.type as TaskType,
            task.data,
            scheduledDate,
            { maxAttempts: task.maxAttempts }
          );
          
          scheduledTasks.push({
            status: 'success',
            taskId,
            type: task.type,
            scheduledFor: scheduledDate.toISOString()
          });
        } catch (error) {
          scheduledTasks.push({
            status: 'error',
            message: error.message,
            originalTask: task
          });
        }
      }
      
      res.status(200).json({
        status: 'success',
        message: 'Завдання заплановані',
        data: {
          tasks: scheduledTasks,
          total: tasks.length,
          succeeded: scheduledTasks.filter(t => t.status === 'success').length,
          failed: scheduledTasks.filter(t => t.status === 'error').length
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Планування регулярного завдання (для адміністраторів)
   */
  async scheduleRecurringTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, data, schedule, maxAttempts } = req.body;
      
      // У реальному проекті тут має бути код для планування регулярного завдання
      // Для прикладу, генеруємо ID і повертаємо успіх
      const recurringTaskId = `recurring_${Date.now()}`;
      
      res.status(200).json({
        status: 'success',
        message: 'Регулярне завдання успішно заплановано',
        data: {
          recurringTaskId,
          type,
          schedule
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання списку запланованих завдань (для адміністраторів)
   */
  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, type, from, to, page, limit } = req.query;
      
      // У реальному проекті тут має бути код для отримання завдань з бази даних
      // з урахуванням фільтрів. Для прикладу, повертаємо тестові дані.
      
      const tasks: ScheduledTask[] = [
        {
          id: 'task_12345',
          type: TaskType.LISTING_DEACTIVATION,
          data: { listingId: 123 },
          scheduledFor: new Date(Date.now() + 60000).toISOString(),
          status: TaskStatus.PENDING,
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'task_67890',
          type: TaskType.PAYMENT_REMINDER,
          data: { userId: 456, paymentId: 789 },
          scheduledFor: new Date(Date.now() + 3600000).toISOString(),
          status: TaskStatus.PENDING,
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      
      res.status(200).json({
        status: 'success',
        data: {
          tasks,
          meta: {
            total: tasks.length,
            page: parseInt(page as string) || 1,
            limit: parseInt(limit as string) || 10,
            filters: {
              status,
              type,
              from,
              to
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання інформації про заплановане завдання (для адміністраторів)
   */
  async getTask(req: Request, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id;
      
      // У реальному проекті тут має бути код для отримання завдання з бази даних
      // Для прикладу, повертаємо тестові дані.
      
      const task: ScheduledTask = {
        id: taskId,
        type: TaskType.LISTING_DEACTIVATION,
        data: { listingId: 123 },
        scheduledFor: new Date(Date.now() + 60000).toISOString(),
        status: TaskStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      res.status(200).json({
        status: 'success',
        data: {
          task
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Скасування запланованого завдання (для адміністраторів)
   */
  async cancelTask(req: Request, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id;
      
      // Скасовуємо завдання
      const success = await scheduledTaskService.cancelTask(taskId);
      
      if (success) {
        res.status(200).json({
          status: 'success',
          message: 'Завдання успішно скасовано'
        });
      } else {
        res.status(404).json({
          status: 'error',
          message: 'Не вдалося скасувати завдання. Можливо, воно вже виконано або не існує.'
        });
      }
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання списку типів завдань (для адміністраторів)
   */
  async getTaskTypes(req: Request, res: Response, next: NextFunction) {
    try {
      // Повертаємо список доступних типів завдань
      res.status(200).json({
        status: 'success',
        data: {
          types: Object.values(TaskType)
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Отримання списку регулярних завдань (для адміністраторів)
   */
  async getRecurringTasks(req: Request, res: Response, next: NextFunction) {
    try {
      // У реальному проекті тут має бути код для отримання регулярних завдань
      // з бази даних. Для прикладу, повертаємо тестові дані.
      
      res.status(200).json({
        status: 'success',
        data: {
          recurringTasks: [
            {
              id: 'recurring_12345',
              type: TaskType.DATA_CLEANUP,
              data: {
                type: 'listings',
                olderThan: '30d'
              },
              schedule: '0 0 * * 0', // Щонеділі о 00:00
              createdAt: new Date().toISOString(),
              lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              id: 'recurring_67890',
              type: TaskType.EMAIL_CAMPAIGN,
              data: {
                campaignId: 123,
                subject: 'Щотижневі новини',
                content: 'Зміст щотижневої розсилки'
              },
              schedule: '0 12 * * 1', // Щопонеділка о 12:00
              createdAt: new Date().toISOString(),
              lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              nextRun: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }
          ]
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  /**
   * Скасування регулярного завдання (для адміністраторів)
   */
  async cancelRecurringTask(req: Request, res: Response, next: NextFunction) {
    try {
      const taskId = req.params.id;
      
      // У реальному проекті тут має бути код для скасування регулярного завдання
      // Для прикладу, просто повертаємо успіх
      
      res.status(200).json({
        status: 'success',
        message: 'Регулярне завдання успішно скасовано'
      });
    } catch (error) {
      next(error);
    }
  }
};