import { PrismaClient, CompanyProfile, CompanySize, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Типи для створення та оновлення профілю компанії
type CreateCompanyProfileInput = Omit<Prisma.CompanyProfileCreateInput, 'user'> & {
  userId: number;
};

type UpdateCompanyProfileInput = Partial<Omit<CreateCompanyProfileInput, 'userId'>>;

interface CompanyAddress {
  country: string;
  region?: string;
  city: string;
  street?: string;
  postalCode?: string;
}

interface CompanyContactInfo {
  phone: string;
  email: string;
  contactPerson?: string;
}

class CompanyService {
  /**
   * Створює новий профіль компанії
   */
  async createCompanyProfile(data: CreateCompanyProfileInput): Promise<CompanyProfile> {
    try {
      // Перевірка наявності обов'язкових полів
      if (!data.companyName || !data.companyCode) {
        throw new Error('Company name and code are required');
      }

      // Підготовка даних для запису
      const { userId, address, contactInfo, ...rest } = data;

      // Безпечне перетворення адреси та контактної інформації у JSON
      const addressJson = address ? (address as any) : undefined;
      const contactInfoJson = contactInfo ? (contactInfo as any) : undefined;

      // Створення профілю компанії
      const companyProfile = await prisma.companyProfile.create({
        data: {
          ...rest,
          address: addressJson,
          contactInfo: contactInfoJson,
          user: {
            connect: { id: userId },
          },
        },
      });

      // Оновлення ролі користувача на COMPANY
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'COMPANY' },
      });

      logger.info(`Created company profile for user ${userId}`);
      return companyProfile;
    } catch (error) {
      logger.error('Failed to create company profile', { error, userId: data.userId });
      throw error;
    }
  }

  /**
   * Оновлює профіль компанії
   */
  async updateCompanyProfile(
    companyId: number, 
    data: UpdateCompanyProfileInput
  ): Promise<CompanyProfile> {
    try {
      // Підготовка даних для оновлення
      const { address, contactInfo, ...rest } = data;

      // Безпечне перетворення адреси та контактної інформації у JSON
      const updateData: any = { ...rest };
      
      if (address) {
        updateData.address = address;
      }
      
      if (contactInfo) {
        updateData.contactInfo = contactInfo;
      }

      // Оновлення профілю
      const updatedProfile = await prisma.companyProfile.update({
        where: { id: companyId },
        data: updateData,
      });

      logger.info(`Updated company profile with ID ${companyId}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Failed to update company profile', { error, companyId });
      throw error;
    }
  }

  /**
   * Отримує профіль компанії за ID
   */
  async getCompanyProfileById(companyId: number): Promise<CompanyProfile | null> {
    try {
      const profile = await prisma.companyProfile.findUnique({
        where: { id: companyId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              isVerified: true,
            },
          },
          documents: true,
        },
      });

      return profile;
    } catch (error) {
      logger.error('Failed to get company profile', { error, companyId });
      throw error;
    }
  }

  /**
   * Отримує профіль компанії за ID користувача
   */
  async getCompanyProfileByUserId(userId: number): Promise<CompanyProfile | null> {
    try {
      const profile = await prisma.companyProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              isVerified: true,
            },
          },
          documents: true,
        },
      });

      return profile;
    } catch (error) {
      logger.error('Failed to get company profile by user ID', { error, userId });
      throw error;
    }
  }

  /**
   * Отримує список компаній з пагінацією та фільтрацією
   */
  async getCompanies(
    options: {
      page?: number;
      limit?: number;
      isVerified?: boolean;
      industry?: string;
      search?: string;
    } = {}
  ) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        isVerified, 
        industry, 
        search 
      } = options;

      // Побудова умов фільтрації
      const where: Prisma.CompanyProfileWhereInput = {};
      
      if (isVerified !== undefined) {
        where.isVerified = isVerified;
      }
      
      if (industry) {
        where.industry = industry;
      }
      
      if (search) {
        where.OR = [
          { companyName: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Підрахунок загальної кількості
      const total = await prisma.companyProfile.count({ where });

      // Отримання сторінки даних
      const companies = await prisma.companyProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        companies,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get companies list', { error, options });
      throw error;
    }
  }

  /**
   * Верифікує компанію
   */
  async verifyCompany(companyId: number, verifiedBy: number): Promise<CompanyProfile> {
    try {
      const updatedProfile = await prisma.companyProfile.update({
        where: { id: companyId },
        data: { isVerified: true },
      });

      logger.info(`Verified company with ID ${companyId} by user ${verifiedBy}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Failed to verify company', { error, companyId });
      throw error;
    }
  }

  /**
   * Додає документ до профілю компанії
   */
  async addCompanyDocument(
    companyId: number,
    documentData: {
      name: string;
      type: string;
      fileUrl: string;
      expiresAt?: Date;
    }
  ) {
    try {
      const document = await prisma.companyDocument.create({
        data: {
          ...documentData,
          company: {
            connect: { id: companyId },
          },
        },
      });

      logger.info(`Added document to company ${companyId}`);
      return document;
    } catch (error) {
      logger.error('Failed to add company document', { error, companyId });
      throw error;
    }
  }

  /**
   * Верифікує документ компанії
   */
  async verifyDocument(documentId: number, verifiedById: number) {
    try {
      const document = await prisma.companyDocument.update({
        where: { id: documentId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
          verifiedById,
        },
      });

      logger.info(`Verified document ${documentId} by user ${verifiedById}`);
      return document;
    } catch (error) {
      logger.error('Failed to verify document', { error, documentId });
      throw error;
    }
  }

  /**
   * Видаляє профіль компанії
   */
  async deleteCompanyProfile(companyId: number): Promise<void> {
    try {
      // Отримання ID користувача перед видаленням профілю
      const companyProfile = await prisma.companyProfile.findUnique({
        where: { id: companyId },
        select: { userId: true },
      });

      if (!companyProfile) {
        throw new Error(`Company profile with ID ${companyId} not found`);
      }

      // Виконання операцій в транзакції
      await prisma.$transaction(async (tx) => {
        // Спочатку видалення всіх документів компанії
        await tx.companyDocument.deleteMany({
          where: { companyId },
        });

        // Потім видалення профілю компанії
        await tx.companyProfile.delete({
          where: { id: companyId },
        });

        // Оновлення ролі користувача назад на USER
        await tx.user.update({
          where: { id: companyProfile.userId },
          data: { role: 'USER' },
        });
      });

      logger.info(`Deleted company profile with ID ${companyId}`);
    } catch (error) {
      logger.error('Failed to delete company profile', { error, companyId });
      throw error;
    }
  }
}

export const companyService = new CompanyService();