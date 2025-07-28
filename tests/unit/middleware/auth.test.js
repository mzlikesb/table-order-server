const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const express = require('express');
const {
  authenticateToken,
  requireStorePermission,
  requireRole,
  authenticateKiosk
} = require('../../../middleware/auth');

// Mock Express request, response, next
const mockRequest = (headers = {}, body = {}, params = {}, query = {}) => ({
  headers,
  body,
  params,
  query,
  tenant: null,
  user: null
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('Auth Middleware Unit Tests', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const payload = { id: 1, username: 'test', role: 'owner' };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'test_secret');
      
      const req = mockRequest({ authorization: `Bearer ${token}` });
      const res = mockResponse();
      
      authenticateToken(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(payload.id);
    });

    it('should reject request without token', async () => {
      const req = mockRequest();
      const res = mockResponse();
      
      authenticateToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '액세스 토큰이 필요합니다'
      });
    });

    it('should reject request with invalid token', async () => {
      const req = mockRequest({ authorization: 'Bearer invalid_token' });
      const res = mockResponse();
      
      authenticateToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '유효하지 않은 토큰입니다'
      });
    });
  });

  describe('requireRole', () => {
    it('should allow request with valid role', () => {
      const req = mockRequest();
      req.user = { id: 1, role: 'owner' };
      const res = mockResponse();
      
      requireRole(['owner', 'manager'])(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request with invalid role', () => {
      const req = mockRequest();
      req.user = { id: 1, role: 'staff' };
      const res = mockResponse();
      
      requireRole(['owner', 'manager'])(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: '접근 권한이 없습니다'
      });
    });
  });

  describe('requireStorePermission', () => {
    it('should allow request with store permission', () => {
      const req = mockRequest();
      req.user = { id: 1 };
      req.tenant = { storeId: '123' };
      const res = mockResponse();
      
      requireStorePermission(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without tenant', () => {
      const req = mockRequest();
      req.user = { id: 1 };
      const res = mockResponse();
      
      requireStorePermission(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'store_id가 필요합니다'
      });
    });
  });

  describe('authenticateKiosk', () => {
    it('should allow request with valid table and store IDs', () => {
      const req = mockRequest({
        'x-table-id': '123',
        'x-store-id': '456'
      });
      const res = mockResponse();
      
      authenticateKiosk(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.kiosk).toBeDefined();
      expect(req.kiosk.tableId).toBe('123');
      expect(req.kiosk.storeId).toBe('456');
    });

    it('should reject request without table ID', () => {
      const req = mockRequest({
        'x-store-id': '456'
      });
      const res = mockResponse();
      
      authenticateKiosk(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: '테이블 ID와 스토어 ID가 필요합니다'
      });
    });

    it('should reject request without store ID', () => {
      const req = mockRequest({
        'x-table-id': '123'
      });
      const res = mockResponse();
      
      authenticateKiosk(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: '테이블 ID와 스토어 ID가 필요합니다'
      });
    });
  });
}); 