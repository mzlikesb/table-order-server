const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../index'); // 테스트용 앱 인스턴스

describe('Auth Routes Integration Tests', () => {
  let testData;

  beforeAll(async () => {
    // 테스트 데이터베이스 설정
    await global.setupTestDatabase();
    testData = await global.createTestData();
  });

  afterAll(async () => {
    // 테스트 데이터베이스 정리
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    // 각 테스트 전에 데이터 정리
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // 실제 비밀번호 해시 생성
      const password = 'testpassword123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      // 관리자 비밀번호 업데이트
      await global.testPool.query(
        'UPDATE admins SET password_hash = $1 WHERE id = $2',
        [passwordHash, testData.admin.id]
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_admin',
          password: password
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('test_admin');
      expect(response.body.user.role).toBe('owner');
      expect(response.body.user.storeId).toBe(testData.store.id);
    });

    it('should reject login with invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'testpassword123'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('잘못된 사용자명 또는 비밀번호');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_admin',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('잘못된 사용자명 또는 비밀번호');
    });

    it('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('사용자명과 비밀번호가 필요합니다');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user info with valid token', async () => {
      const token = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: testData.admin.role,
        storeId: testData.store.id
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username');
      expect(response.body).toHaveProperty('role');
      expect(response.body).toHaveProperty('storeId');
      expect(response.body.username).toBe('test_admin');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('액세스 토큰이 필요합니다');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 토큰입니다');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token with valid token', async () => {
      const token = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: testData.admin.role,
        storeId: testData.store.id
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.token).not.toBe(token); // 새로운 토큰이어야 함
    });

    it('should reject refresh without token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('액세스 토큰이 필요합니다');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const token = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: testData.admin.role,
        storeId: testData.store.id
      });

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('로그아웃되었습니다');
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('액세스 토큰이 필요합니다');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      // 실제 비밀번호 해시 생성
      const currentPassword = 'testpassword123';
      const passwordHash = await bcrypt.hash(currentPassword, 10);
      
      // 관리자 비밀번호 업데이트
      await global.testPool.query(
        'UPDATE admins SET password_hash = $1 WHERE id = $2',
        [passwordHash, testData.admin.id]
      );

      const token = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: testData.admin.role,
        storeId: testData.store.id
      });

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: currentPassword,
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('비밀번호가 변경되었습니다');

      // 새 비밀번호로 로그인 테스트
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test_admin',
          password: 'newpassword123'
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should reject password change with invalid current password', async () => {
      const token = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: testData.admin.role,
        storeId: testData.store.id
      });

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('현재 비밀번호가 올바르지 않습니다');
    });

    it('should reject password change without token', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'testpassword123',
          newPassword: 'newpassword123'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('액세스 토큰이 필요합니다');
    });
  });
}); 