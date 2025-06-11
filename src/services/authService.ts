import { PrismaClient, User, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Інтерфейс для JWT токена
interface TokenPayload {
  userId: number;
  role: UserRole;
}

// Інтерфейс для реєстрації користувача
interface RegisterUserData {
  email: string;
  password: string;
  name: string;
  phoneNumber?: string | null;
}

// Інтерфейс для оновлення профілю
interface UpdateProfileData {
  name?: string;
  phoneNumber?: string | null;
  avatar?: string;
}

class AuthService {
  /**
   * Реєстрація нового користувача
   */
  async registerUser(userData: RegisterUserData): Promise<User> {
    try {
      // Перевірка унікальності email
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUserByEmail) {
        logger.warn(`Спроба реєстрації з існуючим email: ${userData.email}`);
        throw new Error('Користувач з таким email вже існує');
      }

      // Перевірка унікальності номера телефону (якщо вказаний)
      if (userData.phoneNumber) {
        const existingUserByPhone = await prisma.user.findUnique({
          where: { phoneNumber: userData.phoneNumber },
        });

        if (existingUserByPhone) {
          logger.warn(`Спроба реєстрації з існуючим номером телефону: ${userData.phoneNumber}`);
          throw new Error('Користувач з таким номером телефону вже існує');
        }
      }

      // Хешування пароля
      const passwordHash = await this.hashPassword(userData.password);

      // Генерація токена верифікації
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Створення користувача
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          passwordHash,
          name: userData.name,
          phoneNumber: userData.phoneNumber || null,
          verificationToken,
          role: 'USER', // За замовчуванням - звичайний користувач
        },
      });

      logger.info(`Користувач зареєстрований: ${user.id}`);
      return user;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Prisma унікальне обмеження
        const field = error.meta?.target?.[0];
        logger.error(`Помилка реєстрації: порушення унікальності поля ${field}`, error);
        throw new Error(`Користувач з таким ${field === 'email' ? 'email' : 'номером телефону'} вже існує`);
      }
      
      logger.error('Помилка реєстрації користувача', error);
      throw error;
    }
  }

  /**
   * Аутентифікація користувача (вхід в систему)
   */
  async loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
    try {
      // Пошук користувача за email
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        logger.warn(`Спроба входу з неіснуючим email: ${email}`);
        throw new Error('Невірний email або пароль');
      }

      // Перевірка пароля
      const isPasswordValid = await this.verifyPassword(password, user.passwordHash);

      if (!isPasswordValid) {
        logger.warn(`Невірний пароль для користувача: ${user.id}`);
        throw new Error('Невірний email або пароль');
      }

      // Оновлення дати останнього входу
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Генерація JWT токена
      const token = this.generateToken(user);

      logger.info(`Успішний вхід користувача: ${user.id}`);
      return { user, token };
    } catch (error) {
      logger.error('Помилка входу в систему', error);
      throw error;
    }
  }

  /**
   * Верифікація користувача (підтвердження email)
   */
  async verifyUser(token: string): Promise<User> {
    try {
      // Пошук користувача за токеном верифікації
      const user = await prisma.user.findFirst({
        where: { verificationToken: token },
      });

      if (!user) {
        logger.warn(`Спроба верифікації з невірним токеном: ${token}`);
        throw new Error('Невірний токен верифікації');
      }

      // Оновлення статусу верифікації
      const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          verificationToken: null,
        },
      });

      logger.info(`Користувач верифікований: ${user.id}`);
      return verifiedUser;
    } catch (error) {
      logger.error('Помилка верифікації користувача', error);
      throw error;
    }
  }

  /**
   * Запит на скидання пароля
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; token?: string }> {
    try {
      // Пошук користувача за email
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Для безпеки не повідомляємо, що користувача не знайдено
        logger.info(`Запит на скидання пароля для неіснуючого email: ${email}`);
        return { success: true };
      }

      // Генерація токена для скидання пароля
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 година

      // Збереження токена
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });

      logger.info(`Запит на скидання пароля для користувача: ${user.id}`);
      return { success: true, token: resetToken };
    } catch (error) {
      logger.error('Помилка при запиті на скидання пароля', error);
      throw error;
    }
  }

  /**
   * Скидання пароля
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      // Пошук користувача за токеном скидання пароля
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: {
            gt: new Date(),
          },
        },
      });

      if (!user) {
        logger.warn(`Спроба скидання пароля з невірним або застарілим токеном: ${token}`);
        throw new Error('Невірний або застарілий токен скидання пароля');
      }

      // Хешування нового пароля
      const passwordHash = await this.hashPassword(newPassword);

      // Оновлення пароля
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      logger.info(`Пароль скинуто для користувача: ${user.id}`);
      return true;
    } catch (error) {
      logger.error('Помилка скидання пароля', error);
      throw error;
    }
  }

  /**
   * Зміна пароля авторизованим користувачем
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      // Пошук користувача
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        logger.warn(`Спроба зміни пароля для неіснуючого користувача: ${userId}`);
        throw new Error('Користувача не знайдено');
      }

      // Перевірка поточного пароля
      const isPasswordValid = await this.verifyPassword(currentPassword, user.passwordHash);

      if (!isPasswordValid) {
        logger.warn(`Невірний поточний пароль при зміні пароля для користувача: ${userId}`);
        throw new Error('Поточний пароль невірний');
      }

      // Хешування нового пароля
      const passwordHash = await this.hashPassword(newPassword);

      // Оновлення пароля
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      logger.info(`Пароль змінено для користувача: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Помилка зміни пароля', error);
      throw error;
    }
  }

  /**
   * Оновлення профілю користувача
   */
  async updateUserProfile(userId: number, data: UpdateProfileData): Promise<User> {
    try {
      // Перевірка унікальності номера телефону (якщо він змінюється)
      if (data.phoneNumber) {
        const existingUserByPhone = await prisma.user.findFirst({
          where: {
            phoneNumber: data.phoneNumber,
            id: { not: userId },
          },
        });

        if (existingUserByPhone) {
          logger.warn(`Спроба оновлення профілю з існуючим номером телефону: ${data.phoneNumber}`);
          throw new Error('Користувач з таким номером телефону вже існує');
        }
      }

      // Оновлення профілю
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data,
      });

      logger.info(`Профіль оновлено для користувача: ${userId}`);
      return updatedUser;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Prisma унікальне обмеження
        const field = error.meta?.target?.[0];
        logger.error(`Помилка оновлення профілю: порушення унікальності поля ${field}`, error);
        throw new Error(`Користувач з таким ${field === 'email' ? 'email' : 'номером телефону'} вже існує`);
      }
      
      logger.error('Помилка оновлення профілю', error);
      throw error;
    }
  }

  /**
   * Отримання даних профілю користувача
   */
  async getUserProfile(userId: number): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          companyProfile: true,
        },
      });

      if (!user) {
        logger.warn(`Спроба отримання профілю неіснуючого користувача: ${userId}`);
        return null;
      }

      logger.info(`Отримано профіль користувача: ${userId}`);
      return user;
    } catch (error) {
      logger.error('Помилка отримання профілю користувача', error);
      throw error;
    }
  }

  /**
   * Перевірка ролі користувача
   */
  hasRole(user: User, requiredRoles: string | string[]): boolean {
    // Адміністратор має доступ до всього
    if (user.role === 'ADMIN') {
      return true;
    }

    // Модератор має доступ до свого функціоналу та функціоналу звичайних користувачів
    if (user.role === 'MODERATOR') {
      const moderatorAccess = ['MODERATOR', 'COMPANY', 'USER'];
      
      if (Array.isArray(requiredRoles)) {
        return requiredRoles.some(role => moderatorAccess.includes(role));
      }
      
      return moderatorAccess.includes(requiredRoles);
    }

    // Звичайна перевірка для інших ролей
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    return roles.includes(user.role);
  }

  /**
   * Перевірка JWT токена
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET as string
      ) as TokenPayload;
      
      return decoded;
    } catch (error) {
      logger.error('Помилка перевірки токена', error);
      return null;
    }
  }

  /**
   * Зміна ролі користувача (тільки для адміністраторів)
   */
  async changeUserRole(userId: number, newRole: UserRole): Promise<User> {
    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: newRole },
      });

      logger.info(`Роль змінено для користувача ${userId} на ${newRole}`);
      return updatedUser;
    } catch (error) {
      logger.error('Помилка зміни ролі користувача', error);
      throw error;
    }
  }

  /**
   * Назначення користувача модератором
   */
  async setUserAsModerator(userId: number, adminId: number): Promise<User> {
    try {
      // Спочатку перевіряємо, що адміністратор має права для цієї операції
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { role: true },
      });

      if (!admin || admin.role !== 'ADMIN') {
        logger.warn(`Спроба призначення модератора без прав адміністратора: ${adminId}`);
        throw new Error('Недостатньо прав для цієї операції');
      }

      // Назначаємо користувача модератором
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: 'MODERATOR' },
      });

      // Логуємо цю дію в активність
      await prisma.userActivity.create({
        data: {
          userId: adminId,
          action: 'SET_MODERATOR',
          resourceId: userId,
          resourceType: 'USER',
          metadata: {
            timestamp: new Date().toISOString(),
            targetUserId: userId,
          },
        },
      });

      logger.info(`Користувач ${userId} призначений модератором адміністратором ${adminId}`);
      return updatedUser;
    } catch (error) {
      logger.error('Помилка призначення користувача модератором', error);
      throw error;
    }
  }

  /**
   * Видалення ролі модератора
   */
  async removeModeratorRole(userId: number, adminId: number): Promise<User> {
    try {
      // Спочатку перевіряємо, що адміністратор має права для цієї операції
      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { role: true },
      });

      if (!admin || admin.role !== 'ADMIN') {
        logger.warn(`Спроба видалення ролі модератора без прав адміністратора: ${adminId}`);
        throw new Error('Недостатньо прав для цієї операції');
      }

      // Перевіряємо, що користувач є модератором
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!user || user.role !== 'MODERATOR') {
        logger.warn(`Спроба видалення ролі модератора у користувача, який не є модератором: ${userId}`);
        throw new Error('Користувач не є модератором');
      }

      // Повертаємо користувача до звичайної ролі
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: 'USER' },
      });

      // Логуємо цю дію
      await prisma.userActivity.create({
        data: {
          userId: adminId,
          action: 'REMOVE_MODERATOR',
          resourceId: userId,
          resourceType: 'USER',
          metadata: {
            timestamp: new Date().toISOString(),
            targetUserId: userId,
          },
        },
      });

      logger.info(`Роль модератора видалена у користувача ${userId} адміністратором ${adminId}`);
      return updatedUser;
    } catch (error) {
      logger.error('Помилка видалення ролі модератора', error);
      throw error;
    }
  }

  /**
   * Отримання списку всіх модераторів
   */
  async getAllModerators(): Promise<Array<{
    id: number;
    name: string;
    email: string;
    avatar: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
  }>> {
    try {
      const moderators = await prisma.user.findMany({
        where: { role: 'MODERATOR' },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      logger.info(`Отримано список модераторів: ${moderators.length}`);
      return moderators;
    } catch (error) {
      logger.error('Помилка отримання списку модераторів', error);
      throw error;
    }
  }

  /**
   * Отримання користувача за ID
   */
  async getUserById(userId: number): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { id: userId },
      });
    } catch (error) {
      logger.error('Помилка отримання користувача за ID', error);
      throw error;
    }
  }

  /**
   * Хешування пароля
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Перевірка пароля
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Генерація JWT токена
   */
  private generateToken(user: User): string {
    return jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET as jwt.Secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
    );
  }
}

export const authService = new AuthService();