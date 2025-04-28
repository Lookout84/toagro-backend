import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/db';
import jwt from 'jsonwebtoken';
import { config } from '../../../config/env';

describe('Categories API Integration Tests', () => {
  // Setup test data
  const testAdmin = {
    id: 1,
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const testCategory = {
    name: 'Integration Test Category',
    slug: 'integration-test-category',
    description: 'Test description',
  };

  let adminToken: string;
  let categoryId: number;

  // Generate admin token
  beforeAll(() => {
    adminToken = jwt.sign(
      { userId: testAdmin.id, role: testAdmin.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  // Clean up after tests
  afterAll(async () => {
    // Delete test category if exists
    try {
      await prisma.category.delete({
        where: { slug: testCategory.slug },
      });
    } catch (error) {
      // Category might not exist, ignore error
    }
    
    // Close Prisma connection
    await prisma.$disconnect();
  });

  describe('GET /api/categories', () => {
    it('should return list of categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('categories');
      expect(Array.isArray(response.body.data.categories)).toBe(true);
    });
  });

  describe('POST /api/categories', () => {
    it('should create a new category when authenticated as admin', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(testCategory)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('category');
      expect(response.body.data.category).toHaveProperty('name', testCategory.name);
      expect(response.body.data.category).toHaveProperty('slug', testCategory.slug);
      
      // Save category ID for subsequent tests
      categoryId = response.body.data.category.id;
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({
          name: 'Unauthenticated Category',
          slug: 'unauthenticated-category',
        })
        .expect(401);

      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/categories/:id', () => {
    it('should return a category by ID', async () => {
      const response = await request(app)
        .get(`/api/categories/${categoryId}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('category');
      expect(response.body.data.category).toHaveProperty('id', categoryId);
      expect(response.body.data.category).toHaveProperty('name', testCategory.name);
    });

    it('should return 404 for non-existent category', async () => {
      const response = await request(app)
        .get('/api/categories/99999')
        .expect(404);

      expect(response.body.status).toBe('error');
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('should update an existing category when authenticated as admin', async () => {
      const updatedData = {
        name: 'Updated Integration Test Category',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('category');
      expect(response.body.data.category).toHaveProperty('name', updatedData.name);
      expect(response.body.data.category).toHaveProperty('description', updatedData.description);
    });
  });

  describe('GET /api/categories/slug/:slug', () => {
    it('should return a category by slug', async () => {
      const response = await request(app)
        .get(`/api/categories/slug/${testCategory.slug}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('category');
      expect(response.body.data.category).toHaveProperty('slug', testCategory.slug);
    });
  });

  describe('GET /api/categories/tree', () => {
    it('should return category tree', async () => {
      const response = await request(app)
        .get('/api/categories/tree')
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('categoryTree');
      expect(Array.isArray(response.body.data.categoryTree)).toBe(true);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should delete a category when authenticated as admin', async () => {
      const response = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Категорія успішно видалена');
    });
  });
});