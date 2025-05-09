import { z } from 'zod';

export const createListingSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Назва повинна містити принаймні 5 символів'),
    description: z.string().min(20, 'Опис повинен містити принаймні 20 символів'),
    price: z.number().positive('Ціна повинна бути позитивним числом'),
    location: z.string().min(3, 'Розташування повинно містити принаймні 3 символи'),
    category: z.string().min(3, 'Категорія повинна містити принаймні 3 символи'),
    categoryId: z.number().int().positive().optional(),
    condition: z.enum(['new', 'used']).optional(),
    baradId: z.number().int().positive().optional(),
    brand: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
});

export const updateListingSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Назва повинна містити принаймні 5 символів').optional(),
    description: z.string().min(20, 'Опис повинен містити принаймні 20 символів').optional(),
    price: z.number().positive('Ціна повинна бути позитивним числом').optional(),
    location: z.string().min(3, 'Розташування повинно містити принаймні 3 символи').optional(),
    category: z.string().min(3, 'Категорія повинна містити принаймні 3 символи').optional(),
    categoryId: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    condition: z.enum(['new', 'used']).optional(),
    brandId: z.number().int().positive().optional(),
    brand: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val)),
  }),
});

export const listingFilterSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    categoryId: z.string().transform((val) => parseInt(val)).optional(),
    brandId: z.string().transform((val) => parseInt(val)).optional(),
    brand: z.string().optional(),
    minPrice: z.string().transform((val) => parseFloat(val)).optional(),
    maxPrice: z.string().transform((val) => parseFloat(val)).optional(),
    location: z.string().optional(),
    search: z.string().optional(),
    page: z.string().transform((val) => parseInt(val)).optional(),
    limit: z.string().transform((val) => parseInt(val)).optional(),
    sortBy: z.enum(['createdAt', 'price', 'views']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});