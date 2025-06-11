import { PrismaClient, Listing } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

class ModerationService {
  /**
   * Схвалення оголошення модератором
   */
  async approveListing(
    listingId: number, 
    moderatorId: number, 
    comment?: string
  ): Promise<Listing> {
    try {
      const listing = await prisma.listing.update({
        where: { id: listingId },
        data: { 
          active: true,
          // Якщо у вас є окреме поле для статусу модерації, можна оновити його тут
        }
      });

      // Логування дії модератора
      await prisma.userActivity.create({
        data: {
          userId: moderatorId,
          action: 'APPROVE_LISTING',
          resourceId: listingId,
          resourceType: 'LISTING',
          metadata: {
            comment,
            timestamp: new Date().toISOString()
          }
        }
      });

      logger.info(`Listing ${listingId} approved by moderator ${moderatorId}`);
      return listing;
    } catch (error) {
      logger.error('Failed to approve listing', { error, listingId, moderatorId });
      throw error;
    }
  }

  /**
   * Відхилення оголошення модератором
   */
  async rejectListing(
    listingId: number, 
    moderatorId: number, 
    reason: string
  ): Promise<Listing> {
    try {
      const listing = await prisma.listing.update({
        where: { id: listingId },
        data: { 
          active: false,
          // Якщо у вас є окреме поле для статусу модерації, можна оновити його тут
        }
      });

      // Логування дії модератора
      await prisma.userActivity.create({
        data: {
          userId: moderatorId,
          action: 'REJECT_LISTING',
          resourceId: listingId,
          resourceType: 'LISTING',
          metadata: {
            reason,
            timestamp: new Date().toISOString()
          }
        }
      });

      logger.info(`Listing ${listingId} rejected by moderator ${moderatorId}`);
      return listing;
    } catch (error) {
      logger.error('Failed to reject listing', { error, listingId, moderatorId });
      throw error;
    }
  }

  /**
   * Верифікація компанії модератором
   */
  async verifyCompany(
    companyId: number, 
    moderatorId: number, 
    comment?: string
  ): Promise<void> {
    try {
      await prisma.companyProfile.update({
        where: { id: companyId },
        data: { isVerified: true }
      });

      // Логування дії модератора
      await prisma.userActivity.create({
        data: {
          userId: moderatorId,
          action: 'VERIFY_COMPANY',
          resourceId: companyId,
          resourceType: 'COMPANY_PROFILE',
          metadata: {
            comment,
            timestamp: new Date().toISOString()
          }
        }
      });

      logger.info(`Company ${companyId} verified by moderator ${moderatorId}`);
    } catch (error) {
      logger.error('Failed to verify company', { error, companyId, moderatorId });
      throw error;
    }
  }

  /**
   * Отримання списку оголошень для модерації
   */
  async getListingsForModeration(options: {
    page?: number;
    limit?: number;
    status?: 'pending' | 'approved' | 'rejected';
  } = {}): Promise<{ listings: Listing[], total: number, pages: number }> {
    try {
      const { page = 1, limit = 20, status } = options;

      // Визначення умов фільтрації
      const where: any = {};
      
      if (status === 'approved') {
        where.active = true;
      } else if (status === 'rejected') {
        where.active = false;
      } else if (status === 'pending') {
        // Якщо у вас є окреме поле для статусу модерації, тут потрібно буде його використати
        // Наприклад: where.moderationStatus = 'PENDING';
      }

      // Загальна кількість записів
      const total = await prisma.listing.count({ where });

      // Отримання оголошень з пагінацією
      const listings = await prisma.listing.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              companyProfile: {
                select: {
                  companyName: true,
                  isVerified: true
                }
              }
            }
          },
          location: true,
          categoryRel: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      });

      return {
        listings,
        total,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Failed to get listings for moderation', { error });
      throw error;
    }
  }
}

export const moderationService = new ModerationService();