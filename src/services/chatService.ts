import { prisma } from '../config/db';
import { logger } from '../utils/logger';

interface CreateMessageData {
  content: string;
  senderId: number;
  receiverId: number;
  listingId?: number;
}

export const chatService = {
  async sendMessage(data: CreateMessageData) {
    const { content, senderId, receiverId, listingId } = data;

    // Check if users exist
    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId } }),
      prisma.user.findUnique({ where: { id: receiverId } }),
    ]);

    if (!sender || !receiver) {
      throw new Error('Sender or receiver not found');
    }

    // Check if listing exists if provided
    if (listingId) {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }
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
        receiver: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    return { message };
  },

  async getConversation(userId: number, otherUserId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.message.count({
        where: {
          OR: [
            { senderId: userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: userId },
          ],
        },
      }),
    ]);

    // Mark messages as read
    const unreadMessages = messages.filter(
      (message) => message.senderId === otherUserId && !message.readAt
    );

    if (unreadMessages.length > 0) {
      await prisma.message.updateMany({
        where: {
          id: { in: unreadMessages.map((message) => message.id) },
        },
        data: {
          readAt: new Date(),
        },
      });
    }

    return {
      messages: messages.reverse(), // Return in chronological order
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  async getUserConversations(userId: number) {
    // Get all unique conversations for the user
    const conversations = await prisma.$queryRaw`
      SELECT 
        DISTINCT ON (other_user_id) 
        other_user_id,
        u.name as other_user_name,
        u.avatar as other_user_avatar,
        m.content as last_message,
        m.created_at as last_message_time,
        (SELECT COUNT(*) FROM "Message" 
         WHERE sender_id = other_user_id 
         AND receiver_id = ${userId} 
         AND read_at IS NULL) as unread_count
      FROM (
        SELECT 
          CASE 
            WHEN sender_id = ${userId} THEN receiver_id
            ELSE sender_id
          END as other_user_id,
          id,
          content,
          created_at
        FROM "Message"
        WHERE sender_id = ${userId} OR receiver_id = ${userId}
        ORDER BY created_at DESC
      ) m
      JOIN "User" u ON u.id = other_user_id
      ORDER BY other_user_id, m.created_at DESC
    `;

    return { conversations };
  },

  async markMessagesAsRead(userId: number, conversationUserId: number) {
    await prisma.message.updateMany({
      where: {
        senderId: conversationUserId,
        receiverId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { message: 'Messages marked as read' };
  },

  async getUnreadMessagesCount(userId: number) {
    const count = await prisma.message.count({
      where: {
        receiverId: userId,
        readAt: null,
      },
    });

    return { count };
  },
};