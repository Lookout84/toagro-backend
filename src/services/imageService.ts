import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import sharp from 'sharp'; // Потрібно встановити: npm install sharp
import { config } from '../config/env';

const uploadDir = path.join(process.cwd(), config.uploadDir || 'uploads/images');

export const imageService = {
  /**
   * Оптимізація зображення
   */
  async optimizeImage(filePath: string, quality: number = 80): Promise<string> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const filename = path.basename(filePath, ext);
      const optimizedPath = path.join(uploadDir, `${filename}-optimized${ext}`);
      
      await sharp(filePath)
        .resize(1200) // Зменшуємо розмір до максимальної ширини 1200px
        .jpeg({ quality }) // Налаштовуємо якість
        .toFile(optimizedPath);
      
      return optimizedPath;
    } catch (error) {
      logger.error(`Помилка оптимізації зображення: ${error}`);
      return filePath; // Повертаємо оригінальний шлях у разі помилки
    }
  },
  
  /**
   * Видалення зображень за їх URL
   */
  async deleteImages(imageUrls: string[]): Promise<void> {
    for (const url of imageUrls) {
      try {
        // Отримуємо назву файлу з URL
        const filename = url.split('/').pop();
        if (filename) {
          const filePath = path.join(uploadDir, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`Зображення видалено: ${filePath}`);
          }
        }
      } catch (error) {
        logger.error(`Помилка видалення зображення: ${error}`);
      }
    }
  },
  
  /**
   * Створення тимчасового URL для зображення
   */
  generateTempImageUrl(originalFilename: string): string {
    const ext = path.extname(originalFilename).toLowerCase();
    const tempFilename = `temp_${uuidv4()}${ext}`;
    return `/uploads/images/temp/${tempFilename}`;
  }
};