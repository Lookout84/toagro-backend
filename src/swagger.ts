// src/swagger.ts
import swaggerAutogen from 'swagger-autogen';
import { config } from './config/env';

const doc = {
  info: {
    title: 'ToAgro API',
    description: 'API для сільськогосподарського маркетплейсу ToAgro',
    version: '1.0.0',
    contact: {
      name: 'ToAgro Support',
      email: 'support@toagro.com',
      url: 'https://toagro.com/support'
    },
    license: {
      name: 'ISC',
      url: 'https://opensource.org/licenses/ISC'
    },
  },
  host: `${config.host}:${config.port}`,
  basePath: '/api',
  schemes: ['http', 'https'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Введіть ваш Bearer токен у форматі "Bearer {token}"',
    },
  },
  consumes: ['application/json'],
  produces: ['application/json'],
  tags: [
    {
      name: 'Auth',
      description: 'Ендпоінти для автентифікації та управління користувачами',
    },
    {
      name: 'Listings',
      description: 'Ендпоінти для керування оголошеннями сільськогосподарських товарів',
    },
    {
      name: 'Categories',
      description: 'Ендпоінти для керування категоріями товарів',
    },
    {
      name: 'Chat',
      description: 'Ендпоінти для повідомлень та комунікації',
    },
    {
      name: 'Transactions',
      description: 'Ендпоінти для платежів та транзакцій',
    },
    {
      name: 'Notifications',
      description: 'Ендпоінти для системи сповіщень',
    },
    {
      name: 'Campaigns',
      description: 'Ендпоінти для маркетингових кампаній',
    },
    {
      name: 'Admin',
      description: 'Ендпоінти для адміністративних функцій',
    },
    {
      name: 'Health',
      description: 'Ендпоінти для перевірки стану сервісу',
    },
  ],
  definitions: {
    User: {
      id: 1,
      email: 'user@example.com',
      name: 'Тестовий Користувач',
      phoneNumber: '+380501234567',
      role: 'USER',
      avatar: 'https://example.com/avatar.jpg',
      isVerified: true,
      createdAt: '2023-01-01T12:00:00Z',
      updatedAt: '2023-01-01T12:00:00Z'
    },
    Listing: {
      id: 1,
      title: 'Пшениця озима',
      description: 'Високоякісна пшениця озима врожаю 2023 року',
      price: 8500.00,
      location: 'Київська область, Васильків',
      category: 'grains',
      categoryId: 1,
      userId: 1,
      createdAt: '2023-01-01T12:00:00Z',
      updatedAt: '2023-01-01T12:00:00Z',
      active: true,
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      views: 120,
      user: {
        $ref: '#/definitions/User'
      }
    },
    Category: {
      id: 1,
      name: 'Зернові',
      slug: 'grains',
      description: 'Категорія для зернових культур',
      image: 'https://example.com/grains.jpg',
      parentId: null,
      active: true,
      createdAt: '2023-01-01T12:00:00Z',
      updatedAt: '2023-01-01T12:00:00Z'
    },
    Message: {
      id: 1,
      content: 'Доброго дня! Товар ще доступний?',
      senderId: 1,
      receiverId: 2,
      listingId: 1,
      createdAt: '2023-01-01T12:00:00Z',
      readAt: null
    },
    Payment: {
      id: 1,
      userId: 1,
      amount: 1000.00,
      currency: 'UAH',
      status: 'PENDING',
      transactionId: 'TX-12345',
      orderId: 'ORDER-12345',
      paymentMethod: 'card',
      createdAt: '2023-01-01T12:00:00Z',
      completedAt: null
    },
    Campaign: {
      id: 1,
      name: 'Весняна кампанія',
      description: 'Весняна маркетингова кампанія для фермерів',
      type: 'EMAIL',
      status: 'ACTIVE',
      startDate: '2023-04-01T00:00:00Z',
      endDate: '2023-05-01T23:59:59Z',
      targetAudience: {
        role: 'USER',
        isVerified: true
      },
      createdById: 1,
      createdAt: '2023-03-15T10:00:00Z',
      updatedAt: '2023-03-15T10:00:00Z'
    },
    Notification: {
      id: 1,
      userId: 1,
      type: 'EMAIL',
      subject: 'Вітаємо в ToAgro',
      content: 'Дякуємо за реєстрацію!',
      read: false,
      readAt: null,
      priority: 'NORMAL',
      createdAt: '2023-01-01T12:00:00Z',
      updatedAt: '2023-01-01T12:00:00Z'
    },
    RegisterRequest: {
      email: 'user@example.com',
      password: 'Password123',
      name: 'Тестовий Користувач',
      phoneNumber: '+380501234567'
    },
    LoginRequest: {
      email: 'user@example.com',
      password: 'Password123'
    },
    AuthResponse: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: {
        $ref: '#/definitions/User'
      }
    },
    CreateListingRequest: {
      title: 'Пшениця озима',
      description: 'Високоякісна пшениця озима врожаю 2023 року',
      price: 8500.00,
      location: 'Київська область, Васильків',
      category: 'grains',
      categoryId: 1,
      images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg']
    },
    Error: {
      status: 'error',
      message: 'Опис помилки',
      statusCode: 400
    }
  }
};

const outputFile = './src/swagger-output.json';
const endpointsFiles = [
  './src/routes/auth.ts',
  './src/routes/listings.ts',
  './src/routes/categories.ts',
  './src/routes/chat.ts',
  './src/routes/transactions.ts',
  './src/routes/notifications.ts',
  './src/routes/campaigns.ts',
  './src/routes/admin.ts',
  './src/routes/health.ts',
  './src/routes/bulkNotifications.ts',
  './src/routes/queues.ts',
  './src/routes/scheduledTasks.ts'
];

swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  console.log('Документацію Swagger згенеровано');
});