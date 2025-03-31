import { Message, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

export type MessageWithRelations = Prisma.MessageGetPayload<{
  include: {
    sender: true;
    receiver: true;
    listing: true;
  };
}>;

interface SendMessageParams {
  senderId: number;
  receiverId: number;
  listingId: number;
  content: string;
}

interface MarkAsReadParams {
  userId: number;
  listingId: number;
}

class ChatService {
  async sendMessage(params: SendMessageParams): Promise<MessageWithRelations> {
    try {
      const message = await prisma.message.create({
        data: {
          content: params.content,
          senderId: params.senderId,
          receiverId: params.receiverId,
          listingId: params.listingId,
        },
        include: {
          sender: true,
          receiver: true,
          listing: true
        }
      });

      // Перевірка онлайн-статусу отримувача
      const isReceiverOnline = await redis.sIsMember(
        'online_users', 
        params.receiverId.toString()
      );

      if (!isReceiverOnline) {
        await redis.setEx(
          `unread:${params.receiverId}:${params.listingId}`,
          604800, // 7 днів
          message.id.toString()
        );
      }

      return message;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw new Error('Failed to send message');
    }
  }

  async getMessageHistory(
    listingId: number, 
    page: number = 1, 
    limit: number = 50
  ): Promise<MessageWithRelations[]> {
    try {
      return await prisma.message.findMany({
        where: { listingId },
        include: {
          sender: true,
          receiver: true,
          listing: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to fetch message history:', error);
      throw new Error('Failed to fetch message history');
    }
  }

  async markMessagesAsRead(params: MarkAsReadParams): Promise<void> {
    try {
      await prisma.message.updateMany({
        where: {
          receiverId: params.userId,
          listingId: params.listingId,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      });

      await redis.del(`unread:${params.userId}:${params.listingId}`);
    } catch (error) {
      logger.error('Failed to mark messages as read:', error);
      throw new Error('Failed to mark messages as read');
    }
  }

  async getUnreadCounts(userId: number): Promise<Record<number, number>> {
    try {
      const counts = await prisma.message.groupBy({
        by: ['listingId'],
        where: {
          receiverId: userId,
          readAt: null
        },
        _count: true
      });

      return counts.reduce((acc, curr) => ({
        ...acc,
        [curr.listingId]: curr._count
      }), {});
    } catch (error) {
      logger.error('Failed to get unread counts:', error);
      throw new Error('Failed to get unread counts');
    }
  }

  async deleteMessage(messageId: number, userId: number): Promise<void> {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId }
      });

      if (!message) throw new Error('Message not found');
      if (message.senderId !== userId) throw new Error('Unauthorized');

      await prisma.message.delete({
        where: { id: messageId }
      });
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw new Error('Failed to delete message');
    }
  }

  async getConversations(userId: number): Promise<MessageWithRelations[]> {
    try {
      return await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId },
            { receiverId: userId }
          ]
        },
        include: {
          sender: true,
          receiver: true,
          listing: true
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['listingId']
      });
    } catch (error) {
      logger.error('Failed to get conversations:', error);
      throw new Error('Failed to get conversations');
    }
  }
}

export const chatService = new ChatService();