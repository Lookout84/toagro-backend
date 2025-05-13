import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { logger } from './logger';

// Створюємо директорію для завантажень, якщо вона не існує
const uploadDir = path.join(process.cwd(), 'uploads');
const imagesDir = path.join(uploadDir, 'images');

// Переконуємося, що директорії існують
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  logger.info('Створено директорію для завантажень');
}

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
  logger.info('Створено директорію для зображень');
}

// Налаштування зберігання файлів
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, imagesDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Створюємо унікальне ім'я файлу з оригінальним розширенням
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueFilename = `${uuidv4()}${ext}`;
    cb(null, uniqueFilename);
  }
});

// Фільтр для перевірки типу файлу
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Непідтримуваний формат файлу. Підтримуються лише JPEG, PNG, GIF та WEBP'));
  }
};

// Налаштування multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 10 // максимальна кількість файлів
  }
});

// Функція для видалення файлу
export const deleteFile = (filePath: string): boolean => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Файл видалено: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Помилка видалення файлу: ${error}`);
    return false;
  }
};

// Отримання URL для зображення
export const getImageUrl = (filename: string): string => {
  return `/uploads/images/${filename}`;
};