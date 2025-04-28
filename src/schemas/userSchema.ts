// import { z } from 'zod';

// export const registerSchema = z.object({
//   body: z.object({
//     email: z.string().email('Невірний формат електронної пошти'),
//     password: z
//       .string()
//       .min(8, 'Пароль повинен містити принаймні 8 символів')
//       .regex(/[A-Z]/, 'Пароль повинен містити принаймні одну велику літеру')
//       .regex(/[0-9]/, 'Пароль повинен містити принаймні одну цифру'),
//     name: z.string().min(2, 'Ім\'я повинно містити принаймні 2 символи'),
//     phoneNumber: z
//       .string()
//       .regex(/^\+?3?8?(0\d{9})$/, 'Невірний формат номера телефону')
//       .optional(),
//   }),
// });

// export const loginSchema = z.object({
//   body: z.object({
//     email: z.string().email('Невірний формат електронної пошти'),
//     password: z.string().min(1, 'Пароль обов\'язковий'),
//   }),
// });

// export const updateUserSchema = z.object({
//   body: z.object({
//     name: z.string().min(2, 'Ім\'я повинно містити принаймні 2 символи').
//     phoneNumber: z
//       .string()
//       .regex(/^\+?3?8?(0\d{9})$/, 'Невірний формат номера телефону')
//       .optional(),
//     avatar: z.string().optional(),
//   }),
// });

// export const resetPasswordSchema = z.object({
//   body: z.object({
//     token: z.string(),
//     password: z
//       .string()
//       .min(8, 'Пароль повинен містити принаймні 8 символів')
//       .regex(/[A-Z]/, 'Пароль повинен містити принаймні одну велику літеру')
//       .regex(/[0-9]/, 'Пароль повинен містити принаймні одну цифру'),
//   }),
// });

// export const forgotPasswordSchema = z.object({
//   body: z.object({
//     email: z.string().email('Невірний формат електронної пошти'),
//   }),
// });

// export const changePasswordSchema = z.object({
//   body: z.object({
//     currentPassword: z.string().min(1, 'Поточний пароль обов\'язковий'),
//     newPassword: z
//       .string()
//       .min(8, 'Пароль повинен містити принаймні 8 символів')
//       .regex(/[A-Z]/, 'Пароль повинен містити принаймні одну велику літеру')
//       .regex(/[0-9]/, 'Пароль повинен містити принаймні одну цифру'),
//   }),
// });

import { z } from 'zod';

// Загальні валідації для повторного використання
const passwordSchema = z.string()
  .min(8, 'Пароль повинен містити принаймні 8 символів')
  .regex(/[A-Z]/, 'Пароль повинен містити принаймні одну велику літеру')
  .regex(/[0-9]/, 'Пароль повинен містити принаймні одну цифру');

const phoneSchema = z.string()
  .regex(/^\+?3?8?(0\d{9})$/, 'Невірний формат номера телефону')
  .optional();

const emailSchema = z.string().email('Невірний формат електронної пошти');
const nameSchema = z.string().min(2, 'Ім\'я повинно містити принаймні 2 символи');

export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
    phoneNumber: phoneSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Пароль обов\'язковий'),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    phoneNumber: phoneSchema,
    avatar: z.string().optional(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string(),
    password: passwordSchema,
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Поточний пароль обов\'язковий'),
    newPassword: passwordSchema,
  }),
});

// Експорт типів для використання в контролерах
export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];