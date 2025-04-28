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
  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        userCount,
        listingCount,
        activeListingCount,
        messageCount,
        paymentCount,
        totalRevenue
      ] = await Promise.all([
        prisma.user.count(),
        prisma.listing.count(),
        prisma.listing.count({ where: { active: true } }),
        prisma.message.count(),
        prisma.payment.count({ where: { status: 'COMPLETED' } }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'COMPLETED' }
        })
      ]);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userRegistrations = await prisma.user.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          }
        }
      });

      const formattedRegistrations = userRegistrations.map(item => ({
        date: item.createdAt.toISOString().split('T')[0],
        count: item._count.id
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
            totalRevenue: totalRevenue._sum.amount || 0
          },
          charts: {
            userRegistrations: formattedRegistrations
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

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
                  mode: 'insensitive' as Prisma.QueryMode 
                } 
              },
              { 
                email: { 
                  contains: search as string, 
                  mode: 'insensitive' as Prisma.QueryMode 
                } 
              }
            ]
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
                listings: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          users,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          }
        }
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
          message: 'Invalid user role'
        });
      }

      const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { role },
        select: {
          id: true,
          email: true,
          name: true,
          role: true
        }
      });

      res.status(200).json({
        status: 'success',
        message: 'User role updated successfully',
        data: { user }
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
              mode: 'insensitive' as Prisma.QueryMode 
            } 
          },
          { 
            description: { 
              contains: search as string, 
              mode: 'insensitive' as Prisma.QueryMode 
            } 
          }
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
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.listing.count({ where })
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          listings,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          }
        }
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

      if (status && Object.values(PaymentStatus).includes(status as PaymentStatus)) {
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
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.payment.count({ where })
      ]);

      res.status(200).json({
        status: 'success',
        data: {
          payments,
          meta: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
};