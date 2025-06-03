import { Request, Response } from 'express';
import { companyService } from '../services/companyService';
import { logger } from '../utils/logger';
import {
  createCompanyProfileSchema,
  updateCompanyProfileSchema,
  companyDocumentSchema,
  companyQuerySchema,
  companyIdParamSchema
} from '../schemas/companySchema';
import { getImageUrl } from '../utils/fileUpload';

export const companyController = {
  /**
   * Створення профілю компанії
   */
  async createCompanyProfile(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to create company profile');

      // Отримання ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Attempt to create company profile without authentication');
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated',
        });
        return;
      }

      // Валідація даних
      const validationResult = createCompanyProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn(
          'Invalid company profile data:',
          JSON.stringify(validationResult.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: validationResult.error.format(),
        });
        return;
      }

      // Перевірка, чи вже має користувач профіль компанії
      const existingProfile = await companyService.getCompanyProfileByUserId(userId);
      if (existingProfile) {
        logger.warn(`User ${userId} already has a company profile`);
        res.status(400).json({
          status: 'error',
          message: 'User already has a company profile',
        });
        return;
      }

      // Створення профілю компанії
      const companyProfile = await companyService.createCompanyProfile({
        ...validationResult.data,
        userId,
      });

      logger.info(`Company profile created for user ${userId}`);
      res.status(201).json({
        status: 'success',
        message: 'Company profile created',
        data: companyProfile,
      });
    } catch (error: any) {
      logger.error(`Failed to create company profile: ${error.message}`);

      if (error.code === 'P2002') {
        res.status(400).json({
          status: 'error',
          message: 'Company with this code or VAT number already exists',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Failed to create company profile',
          details: error.message,
        });
      }
    }
  },

  /**
   * Оновлення профілю компанії
   */
  async updateCompanyProfile(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to update company profile');

      // Валідація параметрів
      const paramsValidation = companyIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn(
          'Invalid company ID:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid company ID',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id: companyId } = paramsValidation.data;

      // Отримання ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Attempt to update company profile without authentication');
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated',
        });
        return;
      }

      // Перевірка прав доступу
      const companyProfile = await companyService.getCompanyProfileById(companyId);
      if (!companyProfile) {
        logger.warn(`Company profile with ID ${companyId} not found`);
        res.status(404).json({
          status: 'error',
          message: 'Company profile not found',
        });
        return;
      }

      const isOwner = companyProfile.userId === userId;
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        logger.warn(
          `User ${userId} attempted to update company profile ${companyId} without permission`
        );
        res.status(403).json({
          status: 'error',
          message: 'Permission denied',
        });
        return;
      }

      // Валідація даних
      const validationResult = updateCompanyProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        logger.warn(
          'Invalid company profile data:',
          JSON.stringify(validationResult.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: validationResult.error.format(),
        });
        return;
      }

      // Оновлення профілю компанії
      const updatedProfile = await companyService.updateCompanyProfile(
        companyId,
        validationResult.data
      );

      logger.info(`Company profile ${companyId} updated`);
      res.status(200).json({
        status: 'success',
        message: 'Company profile updated',
        data: updatedProfile,
      });
    } catch (error: any) {
      logger.error(`Failed to update company profile: ${error.message}`);

      if (error.code === 'P2002') {
        res.status(400).json({
          status: 'error',
          message: 'Company with this code or VAT number already exists',
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Failed to update company profile',
          details: error.message,
        });
      }
    }
  },

  /**
   * Отримання профілю компанії за ID
   */
  async getCompanyProfile(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to get company profile');

      // Валідація параметрів
      const paramsValidation = companyIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn(
          'Invalid company ID:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid company ID',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id: companyId } = paramsValidation.data;

      // Отримання профілю компанії
      const companyProfile = await companyService.getCompanyProfileById(companyId);
      if (!companyProfile) {
        logger.warn(`Company profile with ID ${companyId} not found`);
        res.status(404).json({
          status: 'error',
          message: 'Company profile not found',
        });
        return;
      }

      logger.info(`Retrieved company profile ${companyId}`);
      res.status(200).json({
        status: 'success',
        data: companyProfile,
      });
    } catch (error: any) {
      logger.error(`Failed to get company profile: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get company profile',
        details: error.message,
      });
    }
  },

  /**
   * Отримання профілю компанії за ID користувача
   */
  async getCompanyProfileByUser(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to get company profile by user ID');

      // Отримання ID користувача з параметрів або з токена
      let userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        userId = req.userId ?? (req as any).user?.id;
      }

      if (!userId) {
        logger.warn('Attempt to get company profile without user ID');
        res.status(400).json({
          status: 'error',
          message: 'User ID is required',
        });
        return;
      }

      // Отримання профілю компанії
      const companyProfile = await companyService.getCompanyProfileByUserId(userId);
      if (!companyProfile) {
        logger.warn(`Company profile for user ${userId} not found`);
        res.status(404).json({
          status: 'error',
          message: 'Company profile not found for this user',
        });
        return;
      }

      logger.info(`Retrieved company profile for user ${userId}`);
      res.status(200).json({
        status: 'success',
        data: companyProfile,
      });
    } catch (error: any) {
      logger.error(`Failed to get company profile by user: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get company profile',
        details: error.message,
      });
    }
  },

  /**
   * Отримання списку компаній
   */
  async getCompanies(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to get companies list');

      // Валідація параметрів запиту
      const queryValidation = companyQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        logger.warn(
          'Invalid query parameters:',
          JSON.stringify(queryValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid query parameters',
          errors: queryValidation.error.format(),
        });
        return;
      }

      // Отримання списку компаній
      const result = await companyService.getCompanies(queryValidation.data);

      logger.info(`Retrieved ${result.companies.length} companies`);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      logger.error(`Failed to get companies list: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get companies list',
        details: error.message,
      });
    }
  },

  /**
   * Верифікація компанії (тільки для адміністраторів)
   */
  async verifyCompany(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to verify company');

      // Валідація параметрів
      const paramsValidation = companyIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn(
          'Invalid company ID:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid company ID',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id: companyId } = paramsValidation.data;

      // Перевірка прав адміністратора
      const userId = req.userId ?? (req as any).user?.id;
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!userId || !isAdmin) {
        logger.warn('Attempt to verify company without admin rights');
        res.status(403).json({
          status: 'error',
          message: 'Admin rights required',
        });
        return;
      }

      // Верифікація компанії
      const verifiedCompany = await companyService.verifyCompany(companyId, userId);

      logger.info(`Company ${companyId} verified by user ${userId}`);
      res.status(200).json({
        status: 'success',
        message: 'Company verified',
        data: verifiedCompany,
      });
    } catch (error: any) {
      logger.error(`Failed to verify company: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to verify company',
        details: error.message,
      });
    }
  },

  /**
   * Додавання документа до профілю компанії
   */
  async addCompanyDocument(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to add company document');

      // Валідація параметрів
      const paramsValidation = companyIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn(
          'Invalid company ID:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid company ID',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id: companyId } = paramsValidation.data;

      // Отримання ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Attempt to add document without authentication');
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated',
        });
        return;
      }

      // Перевірка прав доступу
      const companyProfile = await companyService.getCompanyProfileById(companyId);
      if (!companyProfile) {
        logger.warn(`Company profile with ID ${companyId} not found`);
        res.status(404).json({
          status: 'error',
          message: 'Company profile not found',
        });
        return;
      }

      const isOwner = companyProfile.userId === userId;
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        logger.warn(
          `User ${userId} attempted to add document to company ${companyId} without permission`
        );
        res.status(403).json({
          status: 'error',
          message: 'Permission denied',
        });
        return;
      }

      // Обробка завантаженого файлу
      const file = (req.files as Express.Multer.File[])?.[0];
      if (!file) {
        logger.warn('No file uploaded');
        res.status(400).json({
          status: 'error',
          message: 'No file uploaded',
        });
        return;
      }

      // Отримання URL файлу
      const fileUrl = getImageUrl(file.filename);

      // Валідація даних документа
      const documentData = {
        name: req.body.name,
        type: req.body.type,
        fileUrl,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      };

      const validationResult = companyDocumentSchema.safeParse(documentData);
      if (!validationResult.success) {
        logger.warn(
          'Invalid document data:',
          JSON.stringify(validationResult.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: validationResult.error.format(),
        });
        return;
      }

      // Додавання документа
      const document = await companyService.addCompanyDocument(
        companyId,
        {
          ...validationResult.data,
          expiresAt: validationResult.data.expiresAt
            ? new Date(validationResult.data.expiresAt)
            : undefined,
        }
      );

      logger.info(`Document added to company ${companyId}`);
      res.status(201).json({
        status: 'success',
        message: 'Document added',
        data: document,
      });
    } catch (error: any) {
      logger.error(`Failed to add company document: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to add company document',
        details: error.message,
      });
    }
  },

  /**
   * Верифікація документа компанії (тільки для адміністраторів)
   */
  async verifyDocument(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to verify company document');

      // Отримання ID документа
      const documentId = parseInt(req.params.documentId);
      if (isNaN(documentId)) {
        logger.warn('Invalid document ID');
        res.status(400).json({
          status: 'error',
          message: 'Invalid document ID',
        });
        return;
      }

      // Перевірка прав адміністратора
      const userId = req.userId ?? (req as any).user?.id;
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!userId || !isAdmin) {
        logger.warn('Attempt to verify document without admin rights');
        res.status(403).json({
          status: 'error',
          message: 'Admin rights required',
        });
        return;
      }

      // Верифікація документа
      const verifiedDocument = await companyService.verifyDocument(documentId, userId);

      logger.info(`Document ${documentId} verified by user ${userId}`);
      res.status(200).json({
        status: 'success',
        message: 'Document verified',
        data: verifiedDocument,
      });
    } catch (error: any) {
      logger.error(`Failed to verify document: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to verify document',
        details: error.message,
      });
    }
  },

  /**
   * Видалення профілю компанії
   */
  async deleteCompanyProfile(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Attempt to delete company profile');

      // Валідація параметрів
      const paramsValidation = companyIdParamSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        logger.warn(
          'Invalid company ID:',
          JSON.stringify(paramsValidation.error.errors)
        );
        res.status(400).json({
          status: 'error',
          message: 'Invalid company ID',
          errors: paramsValidation.error.format(),
        });
        return;
      }

      const { id: companyId } = paramsValidation.data;

      // Отримання ID користувача з JWT токена
      const userId = req.userId ?? (req as any).user?.id;
      if (!userId) {
        logger.warn('Attempt to delete company profile without authentication');
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated',
        });
        return;
      }

      // Перевірка прав доступу
      const companyProfile = await companyService.getCompanyProfileById(companyId);
      if (!companyProfile) {
        logger.warn(`Company profile with ID ${companyId} not found`);
        res.status(404).json({
          status: 'error',
          message: 'Company profile not found',
        });
        return;
      }

      const isOwner = companyProfile.userId === userId;
      const isAdmin = (req as any).user?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        logger.warn(
          `User ${userId} attempted to delete company profile ${companyId} without permission`
        );
        res.status(403).json({
          status: 'error',
          message: 'Permission denied',
        });
        return;
      }

      // Видалення профілю компанії
      await companyService.deleteCompanyProfile(companyId);

      logger.info(`Company profile ${companyId} deleted`);
      res.status(200).json({
        status: 'success',
        message: 'Company profile deleted',
      });
    } catch (error: any) {
      logger.error(`Failed to delete company profile: ${error.message}`);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete company profile',
        details: error.message,
      });
    }
  },
};