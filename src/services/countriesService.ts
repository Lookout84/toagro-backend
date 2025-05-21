import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const countriesService = {
  /**
   * Отримати всі країни
   */
  async getCountries() {
    return prisma.country.findMany({
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Отримати країну за ID
   */
  async getCountryById(id: number) {
    return prisma.country.findUnique({
      where: { id },
    });
  },

  /**
   * Створити нову країну
   */
  async createCountry(data: { name: string; code: string }) {
    return prisma.country.create({
      data,
    });
  },

  /**
   * Оновити країну
   */
  async updateCountry(id: number, data: { name?: string; code?: string }) {
    return prisma.country.update({
      where: { id },
      data,
    });
  },

  /**
   * Видалити країну
   */
  async deleteCountry(id: number) {
    return prisma.country.delete({
      where: { id },
    });
  },
};