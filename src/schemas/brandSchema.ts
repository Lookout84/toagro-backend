import { z } from 'zod';

/**
 * Схема валідації для створення нового бренду
 */
export const createBrandSchema = z.object({
  name: z
    .string({ required_error: "Назва бренду є обов'язковою" })
    .min(2, 'Назва бренду повинна містити мінімум 2 символи')
    .max(100, 'Назва бренду не може перевищувати 100 символів'),
  description: z
    .string()
    .max(1000, 'Опис не може перевищувати 1000 символів')
    .optional(),
  logo: z.string().url('Логотип має бути валідним URL').optional(),
  active: z.boolean().default(true),
  popular: z.boolean().default(false),
});

/**
 * Тип даних для створення бренду
 */
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

/**
 * Схема валідації для оновлення бренду
 */
export const updateBrandSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Назва бренду повинна містити мінімум 2 символи')
      .max(100, 'Назва бренду не може перевищувати 100 символів')
      .optional(),
    description: z
      .string()
      .max(1000, 'Опис не може перевищувати 1000 символів')
      .optional(),
    logo: z.string().url('Логотип має бути валідним URL').optional().nullable(),
    active: z.boolean().optional(),
    popular: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Потрібно вказати хоча б одне поле для оновлення',
  });

/**
 * Тип даних для оновлення бренду
 */
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/**
 * Схема для параметрів запиту при отриманні списку брендів
 */
export const getBrandsQuerySchema = z.object({
  search: z.string().optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  popular: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().positive('Номер сторінки має бути додатнім').default(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(
      z
        .number()
        .positive('Ліміт має бути додатнім')
        .max(100, 'Максимальний ліміт - 100')
        .default(50)
    ),
  sortBy: z.enum(['name', 'createdAt']).optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Тип даних для параметрів запиту при отриманні списку брендів
 */
export type GetBrandsQueryInput = z.infer<typeof getBrandsQuerySchema>;

/**
 * Схема для параметрів запиту при отриманні популярних брендів
 */
export const getPopularBrandsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .pipe(
      z
        .number()
        .positive('Ліміт має бути додатнім')
        .max(50, 'Максимальний ліміт - 50')
        .default(10)
    ),
});

/**
 * Тип даних для параметрів запиту при отриманні популярних брендів
 */
export type GetPopularBrandsQueryInput = z.infer<
  typeof getPopularBrandsQuerySchema
>;

/**
 * Схема для параметрів запиту при отриманні бренду за ID або slug
 */
export const getBrandParamSchema = z.object({
  idOrSlug: z.string({
    required_error: "Ідентифікатор або slug бренду є обов'язковим",
  }),
});

/**
 * Тип даних для параметрів запиту при отриманні бренду за ID або slug
 */
export type GetBrandParamInput = z.infer<typeof getBrandParamSchema>;

/**
 * Схема для параметрів запиту при оновленні або видаленні бренду
 */
export const brandIdParamSchema = z.object({
  id: z
    .string({
      required_error: "ID бренду є обов'язковим",
    })
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive('ID бренду має бути додатнім числом')),
});

/**
 * Тип даних для параметрів запиту при оновленні або видаленні бренду
 */
export type BrandIdParamInput = z.infer<typeof brandIdParamSchema>;
