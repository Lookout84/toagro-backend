import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Назва повинна містити принаймні 2 символи'),
    slug: z.string().min(2, 'Slug повинен містити принаймні 2 символи')
      .regex(/^[a-z0-9-]+$/, 'Slug повинен містити тільки малі літери, цифри та дефіси'),
    description: z.string().optional(),
    image: z.object({}).optional(),
    parentId: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    favorite: z.boolean().optional(),
  }),
});
        
export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Назва повинна містити принаймні 2 символи').optional(),
    slug: z.string().min(2, 'Slug повинен містити принаймні 2 символи')
      .regex(/^[a-z0-9-]+$/, 'Slug повинен містити тільки малі літери, цифри та дефіси')
      .optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    parentId: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    favorite: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

export const getCategorySchema = z.object({
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

export const categoryFilterSchema = z.object({
  query: z.object({
    active: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
    parentId: z.string().optional().transform(val => val ? parseInt(val) : undefined),
    search: z.string().optional(),
  }),
});