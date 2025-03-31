import { z } from "zod";

// Базові схеми для повторного використання
const passwordSchema = z.string()
  .min(8, "Пароль має містити мінімум 8 символів")
  .max(100)
  .regex(/[A-Z]/, "Пароль має містити велику літеру")
  .regex(/[0-9]/, "Пароль має містити цифру");

const emailSchema = z.string()
  .email("Невірний формат електронної пошти")
  .max(100);

// Основні схеми
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  passwordConfirmation: z.string(),
  role: z.enum(["BUYER", "SELLER"]).optional().default("BUYER"),
  phone: z.string()
    .regex(/^\+380\d{9}$/, "Невірний формат телефону (+380XXXXXXXXX)")
    .optional(),
})
.refine(data => data.password === data.passwordConfirmation, {
  message: "Паролі не співпадають",
  path: ["passwordConfirmation"]
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Обов'язкове поле")
});

export const updateProfileSchema = z.object({
  email: emailSchema.optional(),
  phone: z.string()
    .regex(/^\+380\d{9}$/, "Невірний формат телефону (+380XXXXXXXXX)")
    .optional(),
  address: z.string().max(200).optional(),
  currentPassword: z.string().min(1, "Обов'язкове поле для підтвердження змін")
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Обов'язкове поле"),
  newPassword: passwordSchema,
  passwordConfirmation: z.string()
})
.refine(data => data.newPassword === data.passwordConfirmation, {
  message: "Паролі не співпадають",
  path: ["passwordConfirmation"]
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Токен обов'язковий"),
  newPassword: passwordSchema,
  passwordConfirmation: z.string()
})
.refine(data => data.newPassword === data.passwordConfirmation, {
  message: "Паролі не співпадають",
  path: ["passwordConfirmation"]
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema
});

// Типи для TypeScript
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

// Додаткові утиліти
export const userResponseSchema = z.object({
  id: z.number(),
  email: z.string(),
  role: z.enum(["ADMIN", "SELLER", "BUYER"]),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  rating: z.number().nullable(),
  createdAt: z.date()
});

export type UserResponse = z.infer<typeof userResponseSchema>;