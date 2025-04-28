import swaggerAutogen from 'swagger-autogen';
import { config } from './config/env';

const doc = {
  info: {
    title: 'ToAgro API',
    description: 'API documentation for the ToAgro platform',
    version: '1.0.0',
  },
  host: `${config.host}:${config.port}`,
  basePath: '/api',
  schemes: ['http', 'https'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Enter your bearer token in the format "Bearer {token}"',
    },
  },
  tags: [
    {
      name: 'Auth',
      description: 'Authentication and user management endpoints',
    },
    {
      name: 'Listings',
      description: 'Agricultural listing management endpoints',
    },
    {
      name: 'Chat',
      description: 'Messaging and communication endpoints',
    },
    {
      name: 'Transactions',
      description: 'Payment and transaction endpoints',
    },
    {
      name: 'Admin',
      description: 'Admin management endpoints',
    },
  ],
};

const outputFile = './src/swagger-output.json';
const endpointsFiles = [
  './src/routes/auth.ts',
  './src/routes/listings.ts',
  './src/routes/chat.ts',
  './src/routes/transactions.ts',
  './src/routes/admin.ts',
  './src/routes/health.ts',
];

swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  console.log('Swagger documentation generated');
});