import { z } from 'zod';

// Схема для адреси компанії
export const companyAddressSchema = z.object({
  country: z.string().min(2, 'Country is required'),
  region: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  street: z.string().optional(),
  postalCode: z.string().optional(),
});

// Схема для контактної інформації
export const companyContactInfoSchema = z.object({
  phone: z.string().min(5, 'Phone number is required'),
  email: z.string().email('Invalid email format'),
  contactPerson: z.string().optional(),
});

// Схема для створення профілю компанії
export const createCompanyProfileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  companyCode: z.string().min(5, 'Company code is required'),
  vatNumber: z.string().optional(),
  website: z.string().url('Invalid URL format').optional(),
  industry: z.string().optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE']).optional(),
  description: z.string().optional(),
  logoUrl: z.string().url('Invalid URL format').optional(),
  address: companyAddressSchema.optional(),
  contactInfo: companyContactInfoSchema.optional(),
});

// Схема для оновлення профілю компанії
export const updateCompanyProfileSchema = createCompanyProfileSchema.partial();

// Схема для додавання документа
export const companyDocumentSchema = z.object({
  name: z.string().min(2, 'Document name is required'),
  type: z.string().min(2, 'Document type is required'),
  fileUrl: z.string().url('Invalid URL format'),
  expiresAt: z.string().datetime().optional(),
});

// Схема для пошуку компаній
export const companyQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  isVerified: z.string().optional().transform(val => val === 'true'),
  industry: z.string().optional(),
  search: z.string().optional(),
});

// Схема для параметрів ID
export const companyIdParamSchema = z.object({
  id: z.string().transform(val => parseInt(val)),
});