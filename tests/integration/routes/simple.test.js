const request = require('supertest');
const app = require('../../index');

describe('Simple Integration Tests (No Database)', () => {
  
  describe('Health Check', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent')
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication Routes', () => {
    it('should reject login without credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });

    it('should reject registration without required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Protected Routes', () => {
    it('should reject access to protected routes without authentication', async () => {
      const response = await request(app)
        .get('/api/menus')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });

    it('should reject access to stores without super admin role', async () => {
      const response = await request(app)
        .get('/api/stores')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('File Upload Routes', () => {
    it('should reject file upload without authentication', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Tenant Routes', () => {
    it('should reject tenant routes without store ID', async () => {
      const response = await request(app)
        .get('/api/tenant/info')
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
}); 