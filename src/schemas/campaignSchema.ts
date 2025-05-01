import { z } from 'zod';
import { CampaignType, CampaignStatus } from '@prisma/client';

// Схема для валідації цільової аудиторії
const targetAudienceSchema = z.object({
  role: z.string().optional(),
  isVerified: z.boolean().optional(),
  createdBefore: z.string().optional(),
  createdAfter: z.string().optional(),
  categoryIds: z.array(z.number()).optional(),
  lastLoginBefore: z.string().optional(),
  lastLoginAfter: z.string().optional(),
  hasListings: z.boolean().optional(),
  specificIds: z.array(z.number()).optional(),
}).optional();

// Схема для валідації даних при створенні кампанії
const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Назва повинна містити принаймні 3 символи'),
    description: z.string().optional(),
    type: z.enum(Object.values(CampaignType) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний тип кампанії' })
    }),
    startDate: z.string().optional().refine(value => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    }, {
      message: 'Невірний формат дати початку',
    }),
    endDate: z.string().optional().refine(value => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    }, {
      message: 'Невірний формат дати закінчення',
    }),
    targetAudience: targetAudienceSchema,
    goal: z.string().optional(),
    budget: z.number().nonnegative('Бюджет не може бути від\'ємним').optional(),
  }).refine((data) => {
    // Перевірка, що дата початку не пізніше дати закінчення
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return start <= end;
    }
    return true;
  }, {
    message: 'Дата початку не може бути пізніше дати закінчення',
    path: ['endDate'],
  }),
});

// Схема для валідації даних при оновленні кампанії
const updateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Назва повинна містити принаймні 3 символи').optional(),
    description: z.string().optional().nullable(),
    type: z.enum(Object.values(CampaignType) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний тип кампанії' })
    }).optional(),
    status: z.enum(Object.values(CampaignStatus) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний статус кампанії' })
    }).optional(),
    startDate: z.string().optional().nullable().refine(value => {
      if (value === null || !value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    }, {
      message: 'Невірний формат дати початку',
    }),
    endDate: z.string().optional().nullable().refine(value => {
      if (value === null || !value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    }, {
      message: 'Невірний формат дати закінчення',
    }),
    targetAudience: targetAudienceSchema,
    goal: z.string().optional().nullable(),
    budget: z.number().nonnegative('Бюджет не може бути від\'ємним').optional().nullable(),
  }).refine((data) => {
    // Перевірка, що дата початку не пізніше дати закінчення, якщо обидві вказані
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return start <= end;
    }
    return true;
  }, {
    message: 'Дата початку не може бути пізніше дати закінчення',
    path: ['endDate'],
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

// Схема для валідації даних при запуску розсилки
const startMessagesSchema = z.object({
  body: z.object({
    type: z.enum(Object.values(CampaignType) as [string, ...string[]], {
      errorMap: () => ({ message: 'Невірний тип розсилки' })
    }),
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

export const campaignValidation = {
  createCampaignSchema,
  updateCampaignSchema,
  startMessagesSchema
};