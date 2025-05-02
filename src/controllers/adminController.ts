// import { Request, Response, NextFunction } from 'express';
// import { Prisma } from '@prisma/client';
// import { prisma } from '../config/db';
// import { logger } from '../utils/logger';

// export const adminController = {
//   async getDashboardStats(req: Request, res: Response, next: NextFunction) {
//     try {
//       const [
//         userCount,
//         listingCount,
//         activeListingCount,
//         messageCount,
//         paymentCount,
//         totalRevenue
//       ] = await Promise.all([
//         prisma.user.count(),
//         prisma.listing.count(),
//         prisma.listing.count({ where: { active: true } }),
//         prisma.message.count(),
//         prisma.payment.count({ where: { status: 'COMPLETED' } }),
//         prisma.payment.aggregate({
//           _sum: { amount: true },
//           where: { status: 'COMPLETED' }
//         })
//       ]);

//       // Get user registrations by date (last 30 days)
//       const thirtyDaysAgo = new Date();
//       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

//       const userRegistrations = await prisma.user.groupBy({
//         by: ['createdAt'],
//         _count: { id: true },
//         where: {
//           createdAt: {
//             gte: thirtyDaysAgo
//           }
//         }
//       });

//       // Format dates for chart display
//       const formattedRegistrations = userRegistrations.map(item => ({
//         date: item.createdAt.toISOString().split('T')[0],
//         count: item._count.id
//       }));

//       res.status(200).json({
//         status: 'success',
//         data: {
//           stats: {
//             userCount,
//             listingCount,
//             activeListingCount,
//             messageCount,
//             paymentCount,
//             totalRevenue: totalRevenue._sum.amount || 0
//           },
//           charts: {
//             userRegistrations: formattedRegistrations
//           }
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async getAllUsers(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { page = '1', limit = '10', search } = req.query;
//       const pageNum = parseInt(page as string);
//       const limitNum = parseInt(limit as string);
//       const skip = (pageNum - 1) * limitNum;

//       const where: Prisma.UserWhereInput = search
//         ? {
//             OR: [
//               {
//                 name: {
//                   contains: search as string,
//                   mode: 'insensitive' as Prisma.QueryMode
//                 }
//               },
//               {
//                 email: {
//                   contains: search as string,
//                   mode: 'insensitive' as Prisma.QueryMode
//                 }
//               }
//             ]
//           }
//         : {};

//       const [users, total] = await Promise.all([
//         prisma.user.findMany({
//           where,
//           skip,
//           take: limitNum,
//           select: {
//             id: true,
//             email: true,
//             name: true,
//             phoneNumber: true,
//             role: true,
//             isVerified: true,
//             createdAt: true,
//             _count: {
//               select: {
//                 listings: true
//               }
//             }
//           },
//           orderBy: { createdAt: 'desc' }
//         }),
//         prisma.user.count({ where })
//       ]);

//       res.status(200).json({
//         status: 'success',
//         data: {
//           users,
//           meta: {
//             total,
//             page: pageNum,
//             limit: limitNum,
//             pages: Math.ceil(total / limitNum)
//           }
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async updateUserRole(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { id } = req.params;
//       const { role } = req.body;

//       const user = await prisma.user.update({
//         where: { id: parseInt(id) },
//         data: { role },
//         select: {
//           id: true,
//           email: true,
//           name: true,
//           role: true
//         }
//       });

//       res.status(200).json({
//         status: 'success',
//         message: 'User role updated successfully',
//         data: { user }
//       });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async getAllListings(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { page = '1', limit = '10', status, search } = req.query;
//       const pageNum = parseInt(page as string);
//       const limitNum = parseInt(limit as string);
//       const skip = (pageNum - 1) * limitNum;

//       let where: any = {};

//       if (status === 'active') {
//         where.active = true;
//       } else if (status === 'inactive') {
//         where.active = false;
//       }

//       if (search) {
//         where.OR = [
//           { title: { contains: search as string, mode: 'insensitive' } },
//           { description: { contains: search as string, mode: 'insensitive' } }
//         ];
//       }

//       const [listings, total] = await Promise.all([
//         prisma.listing.findMany({
//           where,
//           skip,
//           take: limitNum,
//           include: {
//             user: {
//               select: {
//                 id: true,
//                 name: true,
//                 email: true
//               }
//             }
//           },
//           orderBy: { createdAt: 'desc' }
//         }),
//         prisma.listing.count({ where })
//       ]);

//       res.status(200).json({
//         status: 'success',
//         data: {
//           listings,
//           meta: {
//             total,
//             page: pageNum,
//             limit: limitNum,
//             pages: Math.ceil(total / limitNum)
//           }
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   },

//   async getAllPayments(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { page = '1', limit = '10', status } = req.query;
//       const pageNum = parseInt(page as string);
//       const limitNum = parseInt(limit as string);
//       const skip = (pageNum - 1) * limitNum;

//       let where: any = {};

//       if (status) {
//         where.status = status;
//       }

//       const [payments, total] = await Promise.all([
//         prisma.payment.findMany({
//           where,
//           skip,
//           take: limitNum,
//           include: {
//             user: {
//               select: {
//                 id: true,
//                 name: true,
//                 email: true
//               }
//             }
//           },
//           orderBy: { createdAt: 'desc' }
//         }),
//         prisma.payment.count({ where })
//       ]);

//       res.status(200).json({
//         status: 'success',
//         data: {
//           payments,
//           meta: {
//             total,
//             page: pageNum,
//             limit: limitNum,
//             pages: Math.ceil(total / limitNum)
//           }
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
// };

import { Request, Response, NextFunction } from 'express';
import { Prisma, UserRole, PaymentStatus } from '@prisma/client';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

export const adminController = {
  /**
   * @swagger
   * /api/admin/dashboard:
   *   get:
   *     tags:
   *       - Admin
   *     summary: Отримання статистики для панелі адміністратора
   *     description: Повертає загальну статистику для адміністративної панелі
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Успішне отримання статистики
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     stats:
   *                       type: object
   *                       properties:
   *                         userCount:
   *                           type: integer
   *                           example: 1250
   *                         listingCount:
   *                           type: integer
   *                           example: 3450
   *                         activeListingCount:
   *                           type: integer
   *                           example: 2800
   *                         messageCount:
   *                           type: integer
   *                           example: 15240
   *                         paymentCount:
   *                           type: integer
   *                           example: 820
   *                         totalRevenue:
   *                           type: number
   *                           example: 542600
   *                     charts:
   *                       type: object
   *                       properties:
   *                         userRegistrations:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               date:
   *                                 type: string
   *                                 example: '2023-04-01'
   *                               count:
   *                                 type: integer
   *                                 example: 25
   *       401:
   *         description: Користувач не автентифікований
   *         content:
   *           application/json:
   *               $ref: '#/definitions/Error'
   *       403:
   *         description: Доступ заборонено, потрібні права адміністратора
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Error'
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        userCount,
        listingCount,
        activeListingCount,
        messageCount,
        paymentCount,
        totalRevenue,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.listing.count(),
        prisma.listing.count({ where: { active: true } }),
        prisma.message.count(),
        prisma.payment.count({ where: { status: 'COMPLETED' } }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'COMPLETED' },
        }),
      ]);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userRegistrations = await prisma.user.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      });

      const formattedRegistrations = userRegistrations.map((item) => ({
        date: item.createdAt.toISOString().split('T')[0],
        count: item._count.id,
      }));

      res.status(200).json({
        status: 'success',
        data: {
          stats: {
            userCount,
            listingCount,
            activeListingCount,
            messageCount,
            paymentCount,
            totalRevenue: totalRevenue._sum.amount || 0,
          },
          charts: {
            userRegistrations: formattedRegistrations,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
  /**
   * @swagger
   * /api/admin/users:
   *   get:
   *     tags:
   *       - Admin
   *     summary: Отримання списку користувачів
   *     description: Повертає список всіх користувачів з пагінацією
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Номер сторінки для пагінації
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Кількість елементів на сторінці
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Пошук за іменем або електронною поштою
   *     responses:
   *       200:
   *         description: Успішне отримання списку користувачів
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     users:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                             example: 1
   *                           email:
   *                             type: string
   *                             example: user@example.com
   *                           name:
   *                             type: string
   *                             example: Тестовий Користувач
   *                           phoneNumber:
   *                             type: string
   *                             example: +380501234567
   *                           role:
   *                             type: string
   *                             example: USER
   *                           isVerified:
   *                             type: boolean
   *                             example: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                             example: '2023-01-01T12:00:00Z'
   *                           _count:
   *                             type: object
   *                             properties:
   *                               listings:
   *                                 type: integer
   *                                 example: 5
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: integer
   *                           example: 150
   *                         page:
   *                           type: integer
   *                           example: 1
   *                         limit:
   *                           type: integer
   *                           example: 10
   *                         pages:
   *                           type: integer
   *                           example: 15
   *       401:
   *         description: Користувач не автентифікований
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Error'
   *       403:
   *         description: Доступ заборонено, потрібні права адміністратора
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/definitions/Error'
   */
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '10', search } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.UserWhereInput = search
        ? {
            OR: [
              {
                name: {
                  contains: search as string,
                  mode: 'insensitive' as Prisma.QueryMode,
                },
              },
              {
                email: {
                  contains: search as string,
                  mode: 'insensitive' as Prisma.QueryMode,
                },
              },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limitNum,
          select: {
            id: true,
            email: true,
            name: true,
            phoneNumber: true,
            role: true,
            isVerified: true,
            createdAt: true,
            _count: {
              select: {
                listings: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          users,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid user role',
        });
      }

      const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      res.status(200).json({
        status: 'success',
        message: 'User role updated successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllListings(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '10', status, search } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.ListingWhereInput = {};

      if (status === 'active') {
        where.active = true;
      } else if (status === 'inactive') {
        where.active = false;
      }

      if (search) {
        where.OR = [
          {
            title: {
              contains: search as string,
              mode: 'insensitive' as Prisma.QueryMode,
            },
          },
          {
            description: {
              contains: search as string,
              mode: 'insensitive' as Prisma.QueryMode,
            },
          },
        ];
      }

      const [listings, total] = await Promise.all([
        prisma.listing.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.listing.count({ where }),
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          listings,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { active, search } = req.query;

      let where: any = {};

      if (active !== undefined) {
        where.active = active === 'true';
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const categories = await prisma.category.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              children: true,
              listings: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.status(200).json({
        status: 'success',
        data: {
          categories,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '10', status } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: Prisma.PaymentWhereInput = {};

      if (
        status &&
        Object.values(PaymentStatus).includes(status as PaymentStatus)
      ) {
        where.status = status as PaymentStatus;
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          payments,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
