import { z } from 'zod';
import { TaskType } from '../services/scheduledTaskService';

export const scheduleTaskSchema = z.object({
  body: z.object({
    type: z.enum(Object.values(TaskType) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний тип завдання' })
    }),
    data: z.object({}).passthrough(), // Дозволяємо будь-які дані
    scheduledFor: z.string().refine(value => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }, {
      message: 'Невірний формат дати',
    }),
    maxAttempts: z.number().int().positive().optional(),
  }),
});

export const scheduleBatchTasksSchema = z.object({
  body: z.object({
    tasks: z.array(
      z.object({
        type: z.enum(Object.values(TaskType) as [string, ...string[]], {
          errorMap: () => ({ message: 'Невірний тип завдання' })
        }),
        data: z.object({}).passthrough(),
        scheduledFor: z.string().refine(value => {
          const date = new Date(value);
          return !isNaN(date.getTime());
        }, {
          message: 'Невірний формат дати',
        }),
        maxAttempts: z.number().int().positive().optional(),
      })
    ).min(1, 'Має бути принаймні одне завдання')
  }),
});

export const scheduleRecurringTaskSchema = z.object({
  body: z.object({
    type: z.enum(Object.values(TaskType) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний тип завдання' })
    }),
    data: z.object({}).passthrough(), // Дозволяємо будь-які дані
    schedule: z.string().min(1, 'Розклад не може бути порожнім'), // cron-формат
    maxAttempts: z.number().int().positive().optional(),
  }),
});