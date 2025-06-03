import express from 'express';
import { companyController } from '../controllers/companyController';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/roleCheck';
import { upload } from '../utils/fileUpload';

const router = express.Router();

// Публічні маршрути
router.get('/companies', companyController.getCompanies);
router.get('/companies/:id', companyController.getCompanyProfile);
router.get('/users/:userId/company', companyController.getCompanyProfileByUser);

// Маршрути, що потребують автентифікації
router.post('/companies', authenticate, companyController.createCompanyProfile);
router.put('/companies/:id', authenticate, companyController.updateCompanyProfile);
router.delete('/companies/:id', authenticate, companyController.deleteCompanyProfile);

// Маршрути для документів
router.post(
  '/companies/:id/documents',
  authenticate,
  upload.single('document'),
  companyController.addCompanyDocument
);

// Маршрути, що потребують прав адміністратора
router.post(
  '/companies/:id/verify',
  authenticate,
  isAdmin,
  companyController.verifyCompany
);
router.post(
  '/documents/:documentId/verify',
  authenticate,
  isAdmin,
  companyController.verifyDocument
);

// Маршрут для отримання власного профілю компанії
router.get('/my-company', authenticate, companyController.getCompanyProfileByUser);

export default router;