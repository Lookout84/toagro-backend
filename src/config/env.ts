import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  // === База даних ===
  DATABASE_URL: z.string().url(),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),

  // === Redis ===
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().optional(),

  // === Автентифікація ===
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  // === Платіжна система ===
  LIQPAY_PUBLIC_KEY: z.string(),
  LIQPAY_PRIVATE_KEY: z.string(),

  // === Email ===
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string(),
  SMTP_PASSWORD: z.string(),
  EMAIL_FROM: z.string().email(),

  // === Налаштування сервера ===
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),

  // === Rate Limiting ===
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 хвилин
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const envParseResult = envSchema.safeParse(process.env);

if (!envParseResult.success) {
  console.error(
    "❌ Invalid environment variables:",
    envParseResult.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = envParseResult.data;
export type EnvConfig = z.infer<typeof envSchema>;

// Допоміжний тип для автодоповнення
declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvConfig {}
  }
}