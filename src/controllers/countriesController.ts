import { Request, Response, NextFunction } from 'express';
import { countriesService } from '../services/countriesService';

export const countriesController = {
  /**
   * Отримати всі країни
   */
  async getCountries(req: Request, res: Response, next: NextFunction) {
    try {
      const countries = await countriesService.getCountries();
      res.status(200).json({
        status: 'success',
        data: countries,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримати країну за ID
   */
  async getCountryById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const country = await countriesService.getCountryById(id);
      if (!country) {
        return res.status(404).json({
          status: 'error',
          message: 'Країна не знайдена',
        });
      }
      res.status(200).json({
        status: 'success',
        data: country,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Створити нову країну
   */
  async createCountry(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, code } = req.body;
      const country = await countriesService.createCountry({ name, code });
      res.status(201).json({
        status: 'success',
        data: country,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Оновити країну
   */
  async updateCountry(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const { name, code } = req.body;
      const country = await countriesService.updateCountry(id, { name, code });
      res.status(200).json({
        status: 'success',
        data: country,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Видалити країну
   */
  async deleteCountry(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await countriesService.deleteCountry(id);
      res.status(200).json({
        status: 'success',
        message: 'Країна успішно видалена',
      });
    } catch (error) {
      next(error);
    }
  },
};