import { z } from "zod";

// Допоміжні схеми
const ukrainianPhoneRegex = /^\+380\d{9}$/;
const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

// Enum для стану техніки
export const ConditionEnum = z.enum(["новий", "б/в"]);
export type ConditionType = z.infer<typeof ConditionEnum>;

// Enum для статусу оголошення
export const ListingStatusEnum = z.enum(["DRAFT", "ACTIVE", "SOLD", "ARCHIVED"]);
export type ListingStatusType = z.infer<typeof ListingStatusEnum>;

// Базові схеми
const priceSchema = z.number().positive("Ціна має бути додатнім числом").max(10_000_000);
const yearSchema = z.number().int().min(1900).max(new Date().getFullYear()).optional();

// Основні схеми
export const createListingSchema = z.object({
  title: z.string()
    .min(5, "Мінімум 5 символів")
    .max(100, "Максимум 100 символів"),
  description: z.string()
    .min(20, "Мінімум 20 символів")
    .max(2000, "Максимум 2000 символів"),
  price: priceSchema,
  categoryId: z.number().int().positive("Оберіть категорію"),
  year: yearSchema,
  condition: ConditionEnum.optional(),
  location: z.string().max(200),
  photos: z.array(z.string().regex(urlRegex, "Невірний формат URL"))
    .min(1, "Додайте мінімум 1 фото")
    .max(20, "Максимум 20 фото"),
}).strict();

export const updateListingSchema = createListingSchema
  .partial()
  .extend({
    status: ListingStatusEnum.optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "Хоча б одне поле має бути оновлено"
  });

export const listingFilterSchema = z.object({
  minPrice: priceSchema.optional(),
  maxPrice: priceSchema.optional(),
  category: z.number().int().positive().optional(),
  year: yearSchema,
  condition: ConditionEnum.optional(),
  searchQuery: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(10)
});

// Схема для публічної відповіді API
export const listingResponseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  year: z.number().nullable(),
  condition: z.string().nullable(),
  location: z.string(),
  status: ListingStatusEnum,
  photos: z.array(z.string()),
  createdAt: z.date(),
  category: z.object({
    id: z.number(),
    name: z.string()
  }),
  seller: z.object({
    id: z.number(),
    email: z.string(),
    rating: z.number().nullable()
  })
});

// Типи для TypeScript
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListingFilterInput = z.infer<typeof listingFilterSchema>;
export type ListingResponse = z.infer<typeof listingResponseSchema>;

// Додаткові утиліти
export const listingParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID має бути числом").transform(Number)
});