import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/db';
import bcrypt from 'bcryptjs';

describe('Auth API Integration Tests', () => {
  // Setup test data
  const testUser = {
    email: 'integration-test@example.com',
    password: 'TestPassword123',
    name: 'Integration Test',
    phoneNumber: '+380501234567',
  };

  let authToken: string;

  // Clean up before tests
  beforeAll(async () => {
    // Delete test user if exists
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
  });

  // Clean up after tests
  afterAll(async () => {
    // Delete test user
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    
    // Close Prisma connection
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('email', testUser.email);
      
      // Save token for subsequent tests
      authToken = response.body.data.token;
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '123', // Too short
          name: 'T', // Too short
        })
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body).toHaveProperty('errors');
    });

    it('should return 409 for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('email', testUser.email);
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        })
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile for authenticated user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('email', testUser.email);
      expect(response.body.data.user).toHaveProperty('name', testUser.name);
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('PUT /api/auth/me', () => {
    it('should update user profile', async () => {
      const updatedName = 'Updated Integration Test';
      
      const response = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: updatedName,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('name', updatedName);
    });
  });

  // Add more tests for other endpoints...
});