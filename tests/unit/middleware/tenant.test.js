const request = require('supertest');
const express = require('express');

// Mock database connection
jest.mock('../../../db/connection', () => ({
  query: jest.fn()
}));

const { tenantMiddleware, requireTenant, requireAdminPermission } = require('../../../middleware/tenant');
const pool = require('../../../db/connection');

describe('Tenant Middleware Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('tenantMiddleware', () => {
    it('should set tenant info from X-Store-ID header', async () => {
      // Mock database response
      pool.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 123, name: 'Test Store', is_active: true }]
      });

      app.use(tenantMiddleware);
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
      expect(response.body.storeId).toBe(123);
    });

    it('should handle missing X-Store-ID header', async () => {
      app.use(tenantMiddleware);
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

    it('should reject request for non-existent store', async () => {
      // Mock database response for non-existent store
      pool.query.mockResolvedValue({
        rowCount: 0,
        rows: []
      });

      app.use(tenantMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Store-ID', '999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('존재하지 않는 스토어입니다');
    });
  });

  describe('requireTenant', () => {
    it('should allow request with valid tenant', async () => {
      // Mock database response
      pool.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 123, name: 'Test Store', is_active: true }]
      });

      app.use(tenantMiddleware);
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
      app.use(tenantMiddleware);
      app.get('/test', requireTenant, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });
  });

  describe('requireAdminPermission', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should allow request with admin permission', async () => {
      // Mock database response for permission check
      pool.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ role: 'owner' }]
      });

      const req = {
        tenant: { storeId: 123 },
        headers: { 'x-admin-id': '1' },
        body: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdminPermission(req, res, next);

      // Verify mock was called with correct parameters
      expect(pool.query).toHaveBeenCalledWith(
        `SELECT role FROM admin_store_permissions 
       WHERE admin_id = $1 AND store_id = $2`,
        ['1', 123]
      );

      expect(next).toHaveBeenCalled();
      expect(req.tenant.adminRole).toBe('owner');
    });

    it('should reject request without admin permission', async () => {
      // Mock database response for permission check
      pool.query.mockResolvedValue({
        rowCount: 0,
        rows: []
      });

      const req = {
        tenant: { storeId: 123 },
        headers: { 'x-admin-id': '999' },
        body: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdminPermission(req, res, next);

      // Verify mock was called
      expect(pool.query).toHaveBeenCalledWith(
        `SELECT role FROM admin_store_permissions 
       WHERE admin_id = $1 AND store_id = $2`,
        ['999', 123]
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: '해당 스토어에 대한 권한이 없습니다'
      });
    });

    it('should reject request without admin ID', async () => {
      const req = {
        tenant: { storeId: 123 },
        headers: {},
        body: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdminPermission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '관리자 인증이 필요합니다'
      });
    });

    it('should reject request without tenant', async () => {
      const req = {
        headers: {},
        body: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await requireAdminPermission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'store_id가 필요합니다'
      });
    });
  });
}); 