# ToAgro Backend

Backend REST API for the ToAgro agricultural marketplace platform.

## Features

- User authentication and management
- Agricultural listings management
- Real-time messaging between users
- Payment processing with LiqPay integration
- Admin dashboard and management

## Tech Stack

- Node.js & Express
- TypeScript
- PostgreSQL
- Prisma ORM
- Redis for caching
- Socket.io for real-time communication
- JWT for authentication
- Docker for containerization

## Prerequisites

- Node.js (v18 or higher)
- - Docker & Docker Compose
- PostgreSQL
- Redis

## Installation & Setup

### Development Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/toagro.git
   cd toagro

Install dependencies:
bashnpm install

Set up environment variables:

Copy .env.example to .env
Update the variables as needed


Initialize the database:
bashnpx prisma migrate dev

Generate Prisma client:
bashnpx prisma generate

Start the development server:
bashnpm run dev

Using Docker

Clone the repository:
bashgit clone https://github.com/yourusername/toagro.git
cd toagro

Set up environment variables:

Copy .env.example to .env
Update the variables as needed


Start with Docker Compose:
bashdocker-compose up --build

Run migrations inside the container:
bashdocker-compose exec app npx prisma migrate dev


API Documentation
The API documentation is available at /api-docs when running the server in development mode.
Testing
bash# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
Project Structure
toagro/
├── .dockerignore
├── .env
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   └── db.ts
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── listingController.ts
│   │   ├── chatController.ts
│   │   ├── paymentController.ts
│   │   └── adminController.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── errorHandler.ts
│   │   ├── validation.ts
│   │   └── rateLimiter.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── listings.ts
│   │   ├── chat.ts
│   │   ├── transactions.ts
│   │   └── health.ts
│   ├── services/
│   │   ├── userService.ts
│   │   ├── listingService.ts
│   │   ├── paymentService.ts
│   │   ├── chatService.ts
│   │   └── recommendationService.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── emailSender.ts
│   │   ├── liqpay.ts
│   │   └── redis.ts
│   ├── schemas/
│   │   ├── userSchema.ts
│   │   └── listingSchema.ts
│   ├── sockets/
│   │   └── chatSocket.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── app.ts
│   └── swagger.ts
└── README.md
Contributing

Fork the repository
Create your feature branch: git checkout -b feature/my-new-feature
Commit your changes: git commit -am 'Add some feature'
Push to the branch: git push origin feature/my-new-feature
Submit a pull request

License
This project is licensed under the MIT License - see the LICENSE file for details.