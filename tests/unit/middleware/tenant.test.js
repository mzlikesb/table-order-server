const request = require('supertest');
const express = require('express');
const { tenantMiddleware, requireTenant, requireAdminPermission } = require('../../middleware/tenant');

describe('Tenant Middleware Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(tenantMiddleware);
  });

  describe('tenantMiddleware', () => {
    it('should set tenant info from X-Store-ID header', async () => {
      app.get('/test', (req, res) => {
        res.json({ 
          hasTenant: !!req.tenant,
          storeId: req.tenant?.storeId 
        });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Store-ID', '123');

      expect(response.status).toBe(200);
      expect(response.body.hasTenant).toBe(true);
      expect(response.body.storeId).toBe('123');
    });

    it('should handle missing X-Store-ID header', async () => {
      app.get('/test', (req, res) => {
        res.json({ 
          hasTenant: !!req.tenant,
          storeId: req.tenant?.storeId 
        });
      });

      const response = await request(app)
        .get('/test');

      expect(response.status).toBe(200);
      expect(response.body.hasTenant).toBe(false);
      expect(response.body.storeId).toBeUndefined();
    });
  });

  describe('requireTenant', () => {
    it('should allow request with valid tenant', async () => {
      app.get('/test', requireTenant, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Store-ID', '123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject request without tenant', async () => {
      app.get('/test', requireTenant, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('requireAdminPermission', () => {
    it('should allow request with admin permission', async () => {
      // Mock admin user
      const mockReq = {
        user: { id: 1, is_super_admin: true },
        tenant: { storeId: '123' }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      requireAdminPermission(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without admin permission', async () => {
      const mockReq = {
        user: { id: 1, is_super_admin: false },
        tenant: { storeId: '123' }
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockNext = jest.fn();

      requireAdminPermission(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: '관리자 권한이 필요합니다'
      });
    });
  });
}); 