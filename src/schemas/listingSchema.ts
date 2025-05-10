import { z } from 'zod';

// Умови товару (у нижньому регістрі для API, але перетворюються у верхній для Prisma)
export const listingConditionEnum = z.enum(['new', 'used']);
export type ListingCondition = z.infer<typeof listingConditionEnum>;

// Схема для створення оголошення
export const createListingSchema = z.object({
  title: z
    .string({
      required_error: "Заголовок є обов'язковим полем",
    })
    .min(3, 'Заголовок повинен містити мінімум 3 символи'),

  description: z
    .string({
      required_error: "Опис є обов'язковим полем",
    })
    .min(10, 'Опис повинен містити мінімум 10 символів'),

  price: z
    .number({
      required_error: "Ціна є обов'язковим полем",
      invalid_type_error: 'Ціна має бути числом',
    })
    .positive('Ціна має бути додатнім числом'),

  location: z
    .string({
      required_error: "Локація є обов'язковим полем",
    })
    .min(2, 'Локація повинна містити мінімум 2 символи'),

  category: z.string({
    required_error: "Категорія є обов'язковим полем",
  }),

  categoryId: z
    .number({
      required_error: "ID категорії є обов'язковим полем",
      invalid_type_error: 'ID категорії має бути числом',
    })
    .int('ID категорії має бути цілим числом')
    .positive('ID категорії має бути додатнім числом'),

  brandId: z
    .number({
      invalid_type_error: 'ID бренду має бути числом',
    })
    .int('ID бренду має бути цілим числом')
    .positive('ID бренду має бути додатнім числом')
    .optional(),

  images: z.array(z.string()).default([]),

  condition: listingConditionEnum.default('used'),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

// Схема для оновлення оголошення
export const updateListingSchema = z
  .object({
    title: z
      .string()
      .min(3, 'Заголовок повинен містити мінімум 3 символи')
      .optional(),
    description: z
      .string()
      .min(10, 'Опис повинен містити мінімум 10 символів')
      .optional(),
    price: z.number().positive('Ціна має бути додатнім числом').optional(),
    location: z
      .string()
      .min(2, 'Локація повинна містити мінімум 2 символи')
      .optional(),
    category: z.string().optional(),
    categoryId: z
      .number()
      .int()
      .positive('ID категорії має бути додатнім числом')
      .optional(),
    brandId: z
      .number()
      .int()
      .positive('ID бренду має бути додатнім числом')
      .optional()
      .nullable(),
    active: z.boolean().optional(),
    images: z.array(z.string()).optional(),
    condition: listingConditionEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Потрібно вказати хоча б одне поле для оновлення',
  });

export type UpdateListingInput = z.infer<typeof updateListingSchema>;

// Схема для параметрів запиту при отриманні списку оголошень
export const listingQuerySchema = z.object({
  category: z.string().optional(),
  categoryId: z
    .string()
    .transform((val) => (val ? parseInt(val) : undefined))
    .optional(),
  brandId: z
    .string()
    .transform((val) => (val ? parseInt(val) : undefined))
    .optional(),
  minPrice: z
    .string()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .optional(),
  location: z.string().optional(),
  search: z.string().optional(),
  condition: z.enum(['new', 'used']).optional(),
  page: z
    .string()
    .transform((val) => (val ? parseInt(val) : 1))
    .pipe(z.number().int().positive().default(1))
    .optional(),
  limit: z
    .string()
    .transform((val) => (val ? parseInt(val) : 10))
    .pipe(
      z
        .number()
        .int()
        .positive()
        .max(100, 'Максимальний ліміт - 100')
        .default(10)
    )
    .optional(),
  sortBy: z
    .enum(['createdAt', 'price', 'views'])
    .default('createdAt')
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});

export type ListingQueryInput = z.infer<typeof listingQuerySchema>;

// Схема для параметра ID оголошення
export const listingIdParamSchema = z.object({
  id: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().int().positive('ID оголошення має бути додатнім числом')),
});

export type ListingIdParamInput = z.infer<typeof listingIdParamSchema>;
