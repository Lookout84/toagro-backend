import { z } from 'zod';

// Enum для умов товару (в нижньому регістрі для API)
export const listingConditionEnum = z.enum(['new', 'used']);
export type ListingCondition = z.infer<typeof listingConditionEnum>;
export const currencyEnum = z.enum(['UAH', 'USD', 'EUR']);
export type Currency = z.infer<typeof currencyEnum>;
export const priceTypeEnum = z.enum(['NETTO', 'BRUTTO']);
export type PriceType = z.infer<typeof priceTypeEnum>;

// Перетворювач для обробки рядків і чисел
const numberTransformer = (val: any) => {
  if (typeof val === 'string') return Number(val);
  if (typeof val === 'number') return val;
  return undefined;
};

// Схема для вкладеної локації (Country → Region → Community → settlement + координати)
export const locationInputSchema = z.object({
  countryId: z.preprocess(
    numberTransformer,
    z.number({
      required_error: "Оберіть країну",
      invalid_type_error: "ID країни має бути числом",
    }).int().positive()
  ),
  regionId: z.preprocess(
    numberTransformer,
    z.number({
      required_error: "Оберіть область",
      invalid_type_error: "ID області має бути числом",
    }).int().positive()
  ),
  communityId: z.preprocess(
    numberTransformer,
    z.number({
      invalid_type_error: "ID громади має бути числом",
    }).int().positive().optional() // <-- зробити не обов'язковим
  ),
  settlement: z.string({
    required_error: "Населений пункт є обов'язковим полем",
  }).min(2, 'Населений пункт повинен містити мінімум 2 символи'),
  latitude: z.preprocess(
    numberTransformer,
    z.number().optional()
  ),
  longitude: z.preprocess(
    numberTransformer,
    z.number().optional()
  ),
});

// Схема для motorizedSpec (основні поля, можна розширити)
export const motorizedSpecSchema = z.object({
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.preprocess(numberTransformer, z.number().int().min(1900).max(new Date().getFullYear()).optional()),
  serialNumber: z.string().optional(),
  enginePower: z.number().optional(),
  enginePowerKw: z.number().optional(),
  engineModel: z.string().optional(),
  fuelType: z.enum(['DIESEL', 'GASOLINE', 'ELECTRIC', 'HYBRID', 'GAS']).optional(),
  fuelCapacity: z.number().optional(),
  transmission: z.enum(['MANUAL', 'AUTOMATIC', 'HYDROSTATIC', 'CVT']).optional(),
  numberOfGears: z.number().optional(),
  length: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  weight: z.number().optional(),
  wheelbase: z.number().optional(),
  groundClearance: z.number().optional(),
  workingWidth: z.number().optional(),
  capacity: z.number().optional(),
  liftCapacity: z.number().optional(),
  threePtHitch: z.boolean().optional(),
  pto: z.boolean().optional(),
  ptoSpeed: z.string().optional(),
  frontAxle: z.string().optional(),
  rearAxle: z.string().optional(),
  frontTireSize: z.string().optional(),
  rearTireSize: z.string().optional(),
  hydraulicFlow: z.number().optional(),
  hydraulicPressure: z.number().optional(),
  grainTankCapacity: z.number().optional(),
  headerWidth: z.number().optional(),
  threshingWidth: z.number().optional(),
  cleaningArea: z.number().optional(),
  engineHours: z.number().optional(),
  mileage: z.number().optional(),
  lastServiceDate: z.string().optional(),
  nextServiceDate: z.string().optional(),
  isOperational: z.boolean().optional(),
  images: z.array(z.string()).optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
}).partial();

// Базова схема для спільних полів
const listingBaseSchema = {
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

  price: z.preprocess(
    numberTransformer,
    z
      .number({
        required_error: "Ціна є обов'язковим полем",
        invalid_type_error: 'Ціна має бути числом',
      })
      .positive('Ціна має бути додатнім числом')
  ),

  priceType: priceTypeEnum.default('NETTO'), // Додаємо тип ціни (нетто/брутто)

  vatIncluded: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(false)
  ), // Додаємо прапорець "ціна з ПДВ"

  currency: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    currencyEnum.default('UAH')
  ),

  location: locationInputSchema,

  category: z.string({
    required_error: "Категорія є обов'язковим полем",
  }),

  categoryId: z.preprocess(
    numberTransformer,
    z
      .number({
        required_error: "ID категорії є обов'язковим полем",
        invalid_type_error: 'ID категорії має бути числом',
      })
      .int('ID категорії має бути цілим числом')
      .positive('ID категорії має бути додатнім числом')
  ),

  brandId: z.preprocess(
    numberTransformer,
    z
      .number({
        invalid_type_error: 'ID бренду має бути числом',
      })
      .int('ID бренду має бути цілим числом')
      .positive('ID бренду має бути додатнім числом')
      .optional()
  ),

  images: z.preprocess(
    (val) => (Array.isArray(val) ? val : val ? [val] : []),
    z.array(z.string()).default([])
  ),

  condition: z.preprocess(
    (val) => (typeof val === 'string' ? val.toLowerCase() : val),
    listingConditionEnum.default('used')
  ),

  // Додаємо motorizedSpec як вкладений об'єкт (опціонально)
  motorizedSpec: motorizedSpecSchema.optional(),
};

// Схема для створення оголошення
export const createListingSchema = z.object(listingBaseSchema);

export type CreateListingInput = z.infer<typeof createListingSchema>;

// Схема для оновлення оголошення (всі поля необов'язкові)
export const updateListingSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(listingBaseSchema).map(([key, schema]) => [
        key,
        schema.optional(),
      ])
    ),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Потрібно вказати хоча б одне поле для оновлення',
  });

export type UpdateListingInput = z.infer<typeof updateListingSchema>;

// Схема для параметрів запиту при отриманні списку оголошень
export const listingQuerySchema = z.object({
  category: z.string().optional(),
  categoryId: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive().optional()
  ),
  brandId: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive().optional()
  ),
  minPrice: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().positive().optional()
  ),
  maxPrice: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().positive().optional()
  ),
  regionId: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive().optional()
  ),
  communityId: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive().optional()
  ),
  settlement: z.string().optional(),
  search: z.string().optional(),
  condition: z.preprocess(
    (val) => (typeof val === 'string' ? val.toLowerCase() : val),
    z.enum(['new', 'used']).optional()
  ),
  priceType: priceTypeEnum.optional(),
  vatIncluded: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().optional()
  ),
  page: z.preprocess(
    (val) => (val ? Number(val) : 1),
    z.number().int().positive().default(1)
  ),
  limit: z.preprocess(
    (val) => (val ? Number(val) : 10),
    z.number().int().positive().max(100, 'Максимальний ліміт - 100').default(10)
  ),
  sortBy: z.enum(['createdAt', 'price', 'views']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListingQueryInput = z.infer<typeof listingQuerySchema>;

// Схема для параметра ID оголошення
export const listingIdParamSchema = z.object({
  id: z.preprocess(
    (val) => Number(val),
    z.number().int().positive('ID оголошення має бути додатнім числом')
  ),
  currency: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum(['UAH', 'USD', 'EUR']).optional()
  ),
});

export type ListingIdParamInput = z.infer<typeof listingIdParamSchema>;