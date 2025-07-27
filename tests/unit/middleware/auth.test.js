const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  requireStorePermission,
  requireRole,
  authenticateKiosk
} = require('../../mocks/middleware/auth');
const request = require('supertest');
const app = require('../../mocks/app');

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = { id: 1, username: 'test', role: 'owner' };
      const token = generateToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      // 토큰 검증
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(payload.id);
      expect(decoded.username).toBe(payload.username);
      expect(decoded.role).toBe(payload.role);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = { id: 1, username: 'test' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      
      const decoded = verifyToken(token);
      expect(decoded.id).toBe(payload.id);
      expect(decoded.username).toBe(payload.username);
    });

    it('should return null for invalid token', () => {
      const result = verifyToken('invalid_token');
      expect(result).toBeNull();
    });
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2b$')).toBe(true);
    });
  });

  describe('comparePassword', () => {
    it('should compare password correctly', async () => {
      const password = 'testpassword123';
      const hash = await hashPassword(password);
      
      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await comparePassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const payload = { id: 1, username: 'test', role: 'owner' };
      const token = generateToken(payload);
      
      const req = mockRequest({
        authorization: `Bearer ${token}`
      });
      const res = mockResponse();
      
      await authenticateToken(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(payload.id);
      expect(req.user.username).toBe(payload.username);
    });

    it('should reject request without token', async () => {
      const req = mockRequest();
      const res = mockResponse();
      
      await authenticateToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '액세스 토큰이 필요합니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      const req = mockRequest({
        authorization: 'Bearer invalid_token'
      });
      const res = mockResponse();
      
      await authenticateToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '유효하지 않은 토큰입니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject malformed authorization header', async () => {
      const req = mockRequest({
        authorization: 'InvalidFormat token'
      });
      const res = mockResponse();
      
      await authenticateToken(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '유효하지 않은 토큰입니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('authenticateKiosk', () => {
    it('should allow request with valid table and store IDs', async () => {
      app.get('/test', authenticateKiosk, (req, res) => {
        res.json({ 
          tableId: req.kiosk.tableId,
          storeId: req.kiosk.storeId
        });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Table-ID', '123')
        .set('X-Store-ID', '456');

      expect(response.status).toBe(200);
      expect(response.body.tableId).toBe('123');
      expect(response.body.storeId).toBe('456');
    });

    it('should reject request without table ID', async () => {
      app.get('/test', authenticateKiosk, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Store-ID', '456');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('테이블 ID와 스토어 ID가 필요합니다');
    });

    it('should reject request without store ID', async () => {
      app.get('/test', authenticateKiosk, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('X-Table-ID', '123');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('테이블 ID와 스토어 ID가 필요합니다');
    });
  });

  describe('requireStorePermission', () => {
    it('should allow access with valid store permission', async () => {
      const req = mockRequest();
      req.user = { id: 1, storeId: 1, role: 'owner' };
      req.headers['x-store-id'] = '1';
      const res = mockResponse();
      
      await requireStorePermission(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject access without user', async () => {
      const req = mockRequest();
      const res = mockResponse();
      
      await requireStorePermission(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '인증이 필요합니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject access with mismatched store IDs', async () => {
      const req = mockRequest();
      req.user = { id: 1, storeId: 1, role: 'owner' };
      req.headers['x-store-id'] = '2';
      const res = mockResponse();
      
      await requireStorePermission(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: '해당 스토어에 대한 접근 권한이 없습니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access with valid role', () => {
      const req = mockRequest();
      req.user = { role: 'owner' };
      const res = mockResponse();
      
      const middleware = requireRole(['owner', 'manager']);
      middleware(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject access with invalid role', () => {
      const req = mockRequest();
      req.user = { role: 'staff' };
      const res = mockResponse();
      
      const middleware = requireRole(['owner', 'manager']);
      middleware(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: '접근 권한이 없습니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject access without user', () => {
      const req = mockRequest();
      const res = mockResponse();
      
      const middleware = requireRole(['owner', 'manager']);
      middleware(req, res, mockNext);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: '인증이 필요합니다' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
}); 