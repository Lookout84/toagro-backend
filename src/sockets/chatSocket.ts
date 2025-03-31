import { Server, Socket } from 'socket.io';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { redis } from '../utils/redis';
import { Message } from '@prisma/client';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

interface ChatMessage {
  listingId: number;
  content: string;
  senderId: number;
  receiverId: number;
}

interface JoinRoomPayload {
  listingId: number;
  userId: number;
}

interface TypingEvent {
  listingId: number;
  isTyping: boolean;
}

export class ChatSocket {
  private io: Server;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  
  constructor(io: Server) {
    this.io = io;
    this.pubClient = createClient({ url: env.REDIS_URL });
    this.subClient = this.pubClient.duplicate();
    this.initialize();
  }

  private async initialize() {
    await this.pubClient.connect();
    await this.subClient.connect();

    this.io.use(this.authenticate);
    this.io.on('connection', this.handleConnection);
    
    this.subClient.subscribe('chat_messages', (message) => {
      const { room, data } = JSON.parse(message);
      this.io.to(room).emit('new_message', data);
    });
  }

  private authenticate = async (socket: Socket, next: Function) => {
    try {
      const token = socket.handshake.auth.token;
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { id: number };
      const user = await prisma.user.findUnique({ 
        where: { id: decoded.id },
        select: { id: true, email: true }
      });

      if (!user) throw new Error('User not found');
      socket.data.user = user;
      next();
    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  };

  private handleConnection = (socket: Socket) => {
    logger.info(`User connected: ${socket.data.user.id}`);

    // Основний функціонал
    socket.on('join_room', this.handleJoinRoom(socket));
    socket.on('send_message', this.handleSendMessage(socket));
    socket.on('typing', this.handleTyping(socket));
    socket.on('disconnect', this.handleDisconnect(socket));
    socket.on('mark_as_read', this.handleMarkAsRead(socket));

    // Додаткові івенти
    this.handlePresence(socket);
    this.handleErrorEvents(socket);
  };

  private handleJoinRoom = (socket: Socket) => async ({ listingId }: JoinRoomPayload) => {
    try {
      const room = `listing_${listingId}`;
      await socket.join(room);
      
      // Завантаження історії повідомлень
      const messages = await prisma.message.findMany({
        where: { listingId },
        orderBy: { createdAt: 'asc' },
        take: 50
      });

      socket.emit('message_history', messages);
      logger.info(`User ${socket.data.user.id} joined room ${room}`);
    } catch (error) {
      logger.error('Join room error:', error);
    }
  };

  private handleSendMessage = (socket: Socket) => async (message: ChatMessage) => {
    try {
      const newMessage = await prisma.message.create({
        data: {
          content: message.content,
          listingId: message.listingId,
          senderId: socket.data.user.id,
          receiverId: message.receiverId
        }
      });

      // Публікація повідомлення через Redis
      const room = `listing_${message.listingId}`;
      await this.pubClient.publish('chat_messages', JSON.stringify({
        room,
        data: newMessage
      }));

      // Збереження непрочитаних повідомлень
      await redis.setEx(
        `unread:${message.receiverId}:${message.listingId}`,
        60 * 60 * 24 * 7, // 7 днів
        newMessage.id.toString()
      );

    } catch (error) {
      logger.error('Message send error:', error);
      socket.emit('message_error', 'Failed to send message');
    }
  };

  private handleTyping = (socket: Socket) => ({ listingId, isTyping }: TypingEvent) => {
    const room = `listing_${listingId}`;
    socket.to(room).emit('typing_indicator', {
      userId: socket.data.user.id,
      isTyping
    });
  };

  private handleMarkAsRead = (socket: Socket) => async (messageId: number) => {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { readAt: new Date() }
      });
      socket.emit('read_confirmation', messageId);
    } catch (error) {
      logger.error('Mark as read error:', error);
    }
  };

  private handlePresence = (socket: Socket) => {
    // Оновлення статусу онлайн
    redis.sAdd('online_users', socket.data.user.id.toString());
    
    socket.on('disconnect', async () => {
      await redis.sRem('online_users', socket.data.user.id.toString());
      this.io.emit('user_offline', socket.data.user.id);
    });

    // Перевірка статусу інших користувачів
    socket.on('check_online', async (userId: number, callback) => {
      const isOnline = await redis.sIsMember('online_users', userId.toString());
      callback(isOnline);
    });
  };

  private handleDisconnect = (socket: Socket) => async () => {
    logger.info(`User disconnected: ${socket.data.user.id}`);
    await redis.sRem('online_users', socket.data.user.id.toString());
  };

  private handleErrorEvents = (socket: Socket) => {
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
      socket.disconnect(true);
    });
  };
}

// Ініціалізація в головному файлі додатку:
// const io = new Server(server);
// new ChatSocket(io);