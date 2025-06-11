import { Request, Response } from 'express';
import { moderationService } from '../services/moderationService';
import { logger } from '../utils/logger';

export const moderationController = {
  /**
   * Отримання списку оголошень для модерації
   */
  async getListingsForModeration(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as 'pending' | 'approved' | 'rejected';

      const result = await moderationService.getListingsForModeration({
        page,
        limit,
        status
      });

      res.status(200).json({
        status: 'success',
        data: result.listings,
        pagination: {
          total: result.total,
          pages: result.pages,
          page,
          limit
        }
      });
    } catch (error) {
      logger.error('Failed to get listings for moderation', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get listings for moderation'
      });
    }
  },

  /**
   * Схвалення оголошення
   */
  async approveListing(req: Request, res: Response) {
    try {
      const listingId = parseInt(req.params.id);
      const moderatorId = req.userId!;
      const { comment } = req.body;

      if (!listingId || isNaN(listingId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid listing ID'
        });
      }

      const updatedListing = await moderationService.approveListing(
        listingId,
        moderatorId,
        comment
      );

      res.status(200).json({
        status: 'success',
        message: 'Listing approved successfully',
        data: updatedListing
      });
    } catch (error) {
      logger.error('Failed to approve listing', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to approve listing'
      });
    }
  },

  /**
   * Відхилення оголошення
   */
  async rejectListing(req: Request, res: Response) {
    try {
      const listingId = parseInt(req.params.id);
      const moderatorId = req.userId!;
      const { reason } = req.body;

      if (!listingId || isNaN(listingId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid listing ID'
        });
      }

      if (!reason) {
        return res.status(400).json({
          status: 'error',
          message: 'Rejection reason is required'
        });
      }

      const updatedListing = await moderationService.rejectListing(
        listingId,
        moderatorId,
        reason
      );

      res.status(200).json({
        status: 'success',
        message: 'Listing rejected successfully',
        data: updatedListing
      });
    } catch (error) {
      logger.error('Failed to reject listing', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to reject listing'
      });
    }
  },

  /**
   * Верифікація компанії
   */
  async verifyCompany(req: Request, res: Response) {
    try {
      const companyId = parseInt(req.params.id);
      const moderatorId = req.userId!;
      const { comment } = req.body;

      if (!companyId || isNaN(companyId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid company ID'
        });
      }

      await moderationService.verifyCompany(
        companyId,
        moderatorId,
        comment
      );

      res.status(200).json({
        status: 'success',
        message: 'Company verified successfully'
      });
    } catch (error) {
      logger.error('Failed to verify company', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to verify company'
      });
    }
  }
};