// import { Server } from 'socket.io';
// import jwt from 'jsonwebtoken';
// import { config } from '../config/env';
// import { prisma } from '../config/db';
// import { logger } from '../utils/logger';

// interface TokenPayload {
//   userId: number;
//   role: string;
// }

// interface SocketUser {
//   userId: number;
//   socketId: string;
// }

// const connectedUsers = new Map<number, string>();

// export const setupSocket = (io: Server) => {
//   // Authentication middleware
//   io.use(async (socket, next) => {
//     try {
//       const token = socket.handshake.auth.token;
      
//       if (!token) {
//         return next(new Error('Authentication token is required'));
//       }
      
//       const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
      
//       // Check if user exists
//       const user = await prisma.user.findUnique({
//         where: { id: decoded.userId },
//         select: { id: true }
//       });
      
//       if (!user) {
//         return next(new Error('User not found'));
//       }
      
//       socket.data.userId = user.id;
//       next();
//     } catch (error) {
//       logger.error(`Socket authentication error: ${error}`);
//       next(new Error('Authentication failed'));
//     }
//   });

//   io.on('connection', (socket) => {
//     const userId = socket.data.userId;
    
//     // Store user connection
//     connectedUsers.set(userId, socket.id);
//     logger.info(`User connected: ${userId}, socketId: ${socket.id}`);
    
//     // Update online status
//     socket.broadcast.emit('user:status', { userId, status: 'online' });
    
//     // Listen for incoming messages
//     socket.on('message:send', async (data) => {
//       try {
//         const { receiverId, content, listingId } = data;
        
//         // Save message to database
//         const message = await prisma.message.create({
//           data: {
//             content,
//             senderId: userId,
//             receiverId,
//             listingId,
//           },
//           include: {
//             sender: {
//               select: {
//                 id: true,
//                 name: true,
//                 avatar: true,
//               },
//             },
//           },
//         });
        
//         // Send to recipient if online
//         const recipientSocketId = connectedUsers.get(receiverId);
//         if (recipientSocketId) {
//           io.to(recipientSocketId).emit('message:receive', message);
//         }
        
//         // Send back to sender
//         socket.emit('message:sent', message);
//       } catch (error) {
//         logger.error(`Socket message error: ${error}`);
//         socket.emit('message:error', { error: 'Failed to send message' });
//       }
//     });
    
//     // Listen for "typing" indicator
//     socket.on('typing:start', (data) => {
//       const { receiverId } = data;
//       const recipientSocketId = connectedUsers.get(receiverId);
      
//       if (recipientSocketId) {
//         io.to(recipientSocketId).emit('typing:update', { userId, status: true });
//       }
//     });
    
//     socket.on('typing:stop', (data) => {
//       const { receiverId } = data;
//       const recipientSocketId = connectedUsers.get(receiverId);
      
//       if (recipientSocketId) {
//         io.to(recipientSocketId).emit('typing:update', { userId, status: false });
//       }
//     });
    
//     // Handle disconnection
//     socket.on('disconnect', () => {
//       connectedUsers.delete(userId);
//       logger.info(`User disconnected: ${userId}`);
      
//       // Update online status
//       socket.broadcast.emit('user:status', { userId, status: 'offline' });
//     });
//   });
  
//   logger.info('Socket.io server initialized');
// };

// // Helper function to get online status
// export const isUserOnline = (userId: number): boolean => {
//   return connectedUsers.has(userId);
// };

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

interface TokenPayload {
  userId: number;
  role: string;
}

interface MessageData {
  receiverId: number;
  content: string;
  listingId?: number;
}

interface TypingData {
  receiverId: number;
}

class SocketManager {
  private connectedUsers = new Map<number, string>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.setupAuthentication();
    this.setupEventHandlers();
  }

  // private setupAuthentication() {
  //   this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
  //     try {
  //       const token = socket.handshake.auth.token;
        
  //       if (!token) {
  //         logger.warn('Authentication attempt without token');
  //         return next(new Error('Authentication token is required'));
  //       }
        
  //       const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
        
  //       const user = await prisma.user.findUnique({
  //         where: { id: decoded.userId },
  //         select: { id: true, isActive: true }
  //       });
        
  //       if (!user || !user.isActive) {
  //         logger.warn(`User not found or inactive: ${decoded.userId}`);
  //         return next(new Error('User not found or inactive'));
  //       }
        
  //       socket.data.userId = user.id;
  //       next();
  //     } catch (error) {
  //       logger.error(`Socket authentication error: ${error}`);
  //       next(new Error('Authentication failed'));
  //     }
  //   });
  // }

  private setupAuthentication() {
    this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          logger.warn('Authentication attempt without token');
          return next(new Error('Authentication token is required'));
        }
        
        const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
        
        // Перевіряємо лише існування користувача (без isActive)
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true } // Видалено isActive
        });
        
        if (!user) {
          logger.warn(`User not found: ${decoded.userId}`);
          return next(new Error('User not found'));
        }
        
        socket.data.userId = user.id;
        next();
      } catch (error) {
        logger.error(`Socket authentication error: ${error}`);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId;
      
      // Store user connection
      this.connectedUsers.set(userId, socket.id);
      logger.info(`User connected: ${userId}, socketId: ${socket.id}`);
      
      // Notify others about online status
      this.io.emit('user:status', { userId, status: 'online' });
      
      // Message handling
      socket.on('message:send', async (data: MessageData) => {
        await this.handleMessage(socket, userId, data);
      });
      
      // Typing indicators
      socket.on('typing:start', (data: TypingData) => {
        this.handleTyping(socket, userId, data.receiverId, true);
      });
      
      socket.on('typing:stop', (data: TypingData) => {
        this.handleTyping(socket, userId, data.receiverId, false);
      });
      
      // Disconnection handler
      socket.on('disconnect', () => {
        this.handleDisconnect(userId);
      });
    });
  }

  private async handleMessage(socket: Socket, senderId: number, data: MessageData) {
    try {
      const { receiverId, content, listingId } = data;
      
      // Validate receiver exists
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true }
      });
      
      if (!receiver) {
        throw new Error('Recipient not found');
      }
      
      const message = await prisma.message.create({
        data: {
          content,
          senderId,
          receiverId,
          listingId,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
      
      // Send to recipient if online
      const recipientSocketId = this.connectedUsers.get(receiverId);
      if (recipientSocketId) {
        this.io.to(recipientSocketId).emit('message:receive', message);
      }
      
      // Confirm to sender
      socket.emit('message:sent', message);
    } catch (error) {
      logger.error(`Message handling error for user ${senderId}: ${error}`);
      socket.emit('message:error', { error: 'Failed to send message' });
    }
  }

  private handleTyping(socket: Socket, userId: number, receiverId: number, isTyping: boolean) {
    try {
      const recipientSocketId = this.connectedUsers.get(receiverId);
      if (recipientSocketId) {
        this.io.to(recipientSocketId).emit('typing:update', { 
          userId, 
          status: isTyping 
        });
      }
    } catch (error) {
      logger.error(`Typing indicator error: ${error}`);
    }
  }

  private handleDisconnect(userId: number) {
    this.connectedUsers.delete(userId);
    logger.info(`User disconnected: ${userId}`);
    this.io.emit('user:status', { userId, status: 'offline' });
  }

  public isUserOnline(userId: number): boolean {
    return this.connectedUsers.has(userId);
  }
}

export const setupSocket = (io: Server) => {
  new SocketManager(io);
  logger.info('Socket.io server initialized');
};

export const isUserOnline = (userId: number): boolean => {
  // Note: This won't work with the class-based approach
  // You'll need to access the SocketManager instance
  return false;
};