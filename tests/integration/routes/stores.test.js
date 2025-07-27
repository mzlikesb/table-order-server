const request = require('supertest');
const app = require('../../index');

describe('Stores Routes Integration Tests', () => {
  let testData;
  let superAdminToken;

  beforeAll(async () => {
    await global.setupTestDatabase();
    testData = await global.createTestData();
    
    // Super Admin 토큰 생성
    superAdminToken = global.generateTestToken({
      adminId: 999,
      username: 'super_admin',
      email: 'super@example.com',
      is_super_admin: true
    });
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
    
    // 새로운 테스트 데이터에 맞는 슈퍼 관리자 토큰 생성
    superAdminToken = global.generateTestToken({
      adminId: testData.superAdmin.id,
      username: testData.superAdmin.username,
      email: testData.superAdmin.email,
      is_super_admin: true
    });
  });

  describe('GET /api/stores', () => {
    it('should return stores for super admin', async () => {
      const response = await request(app)
        .get('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('code');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('is_active');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/stores')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without super admin role', async () => {
      const regularToken = global.generateTestToken({
        adminId: testData.admin.id,
        username: testData.admin.username,
        email: testData.admin.email,
        is_super_admin: false
      });

      const response = await request(app)
        .get('/api/stores')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 권한이 없습니다');
    });

    it('should filter stores by status', async () => {
      const response = await request(app)
        .get('/api/stores?is_active=true')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(store => {
        expect(store.is_active).toBe(true);
      });
    });
  });

  describe('GET /api/stores/:id', () => {
    it('should return specific store for super admin', async () => {
      const response = await request(app)
        .get(`/api/stores/${testData.store.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.store.id);
      expect(response.body).toHaveProperty('code', testData.store.code);
      expect(response.body).toHaveProperty('name', testData.store.name);
      expect(response.body).toHaveProperty('address', testData.store.address);
      expect(response.body).toHaveProperty('phone', testData.store.phone);
      expect(response.body).toHaveProperty('timezone', testData.store.timezone);
    });

    it('should reject request for non-existent store', async () => {
      const response = await request(app)
        .get('/api/stores/99999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 스토어가 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/api/stores/${testData.store.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/stores', () => {
    it('should create new store with valid data', async () => {
      const newStoreData = {
        code: 'new_store',
        name: '새로운 스토어',
        address: '서울시 강남구',
        phone: '02-1234-5678',
        timezone: 'Asia/Seoul'
      };

      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(newStoreData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('code', newStoreData.code);
      expect(response.body).toHaveProperty('name', newStoreData.name);
      expect(response.body).toHaveProperty('address', newStoreData.address);
      expect(response.body).toHaveProperty('phone', newStoreData.phone);
      expect(response.body).toHaveProperty('timezone', newStoreData.timezone);
      expect(response.body).toHaveProperty('is_active', true);
    });

    it('should reject store creation without authentication', async () => {
      const response = await request(app)
        .post('/api/stores')
        .send({
          code: 'new_store',
          name: '새로운 스토어'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject store creation without super admin role', async () => {
      const regularToken = global.generateTestToken({
        id: testData.admin.id,
        username: testData.admin.username,
        role: 'owner',
        storeId: testData.store.id
      });

      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          code: 'new_store',
          name: '새로운 스토어'
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('존재하지 않는 관리자입니다');
    });

    it('should reject store creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          address: '주소만 있고 필수 필드가 없음'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 코드와 이름이 필요합니다');
    });

    it('should reject store creation with duplicate code', async () => {
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: testData.store.code, // 이미 존재하는 코드
          name: '중복 스토어'
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('이미 존재하는 스토어 코드입니다');
    });

    it('should reject store creation with invalid code format', async () => {
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'invalid-code!', // 특수문자 포함
          name: '잘못된 스토어'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 코드는 영문, 숫자, 언더스코어만 사용 가능합니다');
    });

    it('should reject store creation with code too long', async () => {
      const longCode = 'a'.repeat(21); // 20자 초과
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: longCode,
          name: '긴 코드 스토어'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 코드는 20자 이하여야 합니다');
    });

    it('should reject store creation with name too long', async () => {
      const longName = 'a'.repeat(101); // 100자 초과
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'long_name_store',
          name: longName
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 이름은 100자 이하여야 합니다');
    });
  });

  describe('PUT /api/stores/:id', () => {
    it('should update store with valid data', async () => {
      const updateData = {
        code: 'updated_store',
        name: '업데이트된 스토어',
        address: '서울시 서초구',
        phone: '02-9876-5432',
        timezone: 'Asia/Tokyo'
      };

      const response = await request(app)
        .put(`/api/stores/${testData.store.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.store.id);
      expect(response.body).toHaveProperty('code', updateData.code);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty('address', updateData.address);
      expect(response.body).toHaveProperty('phone', updateData.phone);
      expect(response.body).toHaveProperty('timezone', updateData.timezone);
    });

    it('should reject update for non-existent store', async () => {
      const response = await request(app)
        .put('/api/stores/99999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'updated_store',
          name: '업데이트된 스토어'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 스토어가 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put(`/api/stores/${testData.store.id}`)
        .send({
          code: 'updated_store',
          name: '업데이트된 스토어'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/stores/:id', () => {
    it('should partially update store', async () => {
      const patchData = {
        name: '부분 업데이트된 스토어',
        phone: '02-1111-2222'
      };

      const response = await request(app)
        .patch(`/api/stores/${testData.store.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(patchData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.store.id);
      expect(response.body).toHaveProperty('name', patchData.name);
      expect(response.body).toHaveProperty('phone', patchData.phone);
      // 기존 값들은 유지되어야 함
      expect(response.body).toHaveProperty('code', testData.store.code);
      expect(response.body).toHaveProperty('address', testData.store.address);
    });

    it('should reject partial update without authentication', async () => {
      const response = await request(app)
        .patch(`/api/stores/${testData.store.id}`)
        .send({
          name: '부분 업데이트된 스토어'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/stores/:id', () => {
    it('should soft delete store', async () => {
      const response = await request(app)
        .delete(`/api/stores/${testData.store.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', testData.store.id);
      expect(response.body.deleted).toHaveProperty('is_active', false);
    });

    it('should reject delete for non-existent store', async () => {
      const response = await request(app)
        .delete('/api/stores/99999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 스토어가 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete(`/api/stores/${testData.store.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject delete for store with active data', async () => {
      // 활성 데이터가 있는 스토어는 삭제할 수 없음
      const response = await request(app)
        .delete(`/api/stores/${testData.store.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어에 연결된 데이터가 있어 삭제할 수 없습니다');
    });
  });

  describe('GET /api/stores/stats', () => {
    it('should return store statistics', async () => {
      const response = await request(app)
        .get('/api/stores/stats')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total_stores');
      expect(response.body).toHaveProperty('active_stores');
      expect(response.body).toHaveProperty('inactive_stores');
      expect(response.body).toHaveProperty('recent_stores');
      expect(response.body).toHaveProperty('store_distribution');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/stores/stats')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/stores/bulk-status', () => {
    it('should update store status in bulk', async () => {
      const bulkStatusData = {
        store_ids: [testData.store.id],
        is_active: false
      };

      const response = await request(app)
        .post('/api/stores/bulk-status')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(bulkStatusData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated_count', 1);
    });

    it('should reject bulk status update without authentication', async () => {
      const response = await request(app)
        .post('/api/stores/bulk-status')
        .send({ store_ids: [], is_active: false })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/stores/duplicate', () => {
    it('should duplicate existing store', async () => {
      const duplicateData = {
        store_id: testData.store.id,
        new_code: 'duplicate_store',
        new_name: '복제된 스토어'
      };

      const response = await request(app)
        .post('/api/stores/duplicate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(duplicateData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('new_store');
      expect(response.body).toHaveProperty('original_store');
      expect(response.body.new_store).toHaveProperty('code', duplicateData.new_code);
      expect(response.body.new_store).toHaveProperty('name', duplicateData.new_name);
      expect(response.body.new_store).toHaveProperty('address', testData.store.address);
      expect(response.body.new_store).toHaveProperty('phone', testData.store.phone);
      expect(response.body.new_store).toHaveProperty('timezone', testData.store.timezone);
      expect(response.body.new_store.id).not.toBe(testData.store.id); // 새로운 ID여야 함
    });

    it('should reject duplicate without authentication', async () => {
      const response = await request(app)
        .post('/api/stores/duplicate')
        .send({ store_id: testData.store.id, new_code: 'duplicate_store', new_name: '복제된 스토어' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject duplicate for non-existent store', async () => {
      const response = await request(app)
        .post('/api/stores/duplicate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ store_id: 99999, new_code: 'duplicate_store', new_name: '복제된 스토어' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('존재하지 않는 스토어입니다');
    });
  });

  describe('GET /api/stores/search', () => {
    it('should search stores by name', async () => {
      const response = await request(app)
        .get('/api/stores/search')
        .query({ q: '테스트' })
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(store => {
        expect(store.name.toLowerCase()).toContain('테스트');
      });
    });

    it('should search stores by code', async () => {
      const response = await request(app)
        .get(`/api/stores/search?q=${testData.store.code}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(store => {
        expect(store.code.toLowerCase()).toContain(testData.store.code.toLowerCase());
      });
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/stores/search?q=nonexistent')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should reject search without authentication', async () => {
      const response = await request(app)
        .get('/api/stores/search?q=test')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/stores/:id/logo', () => {
    it('should update store logo', async () => {
      const logoData = {
        logo_url: '/uploads/logos/new_logo.png',
        small_logo_url: '/uploads/logos/new_logo_small.png'
      };

      const response = await request(app)
        .put(`/api/stores/${testData.store.id}/logo`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(logoData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('store');
      expect(response.body.store).toHaveProperty('logo_url', logoData.logo_url);
      expect(response.body.store).toHaveProperty('small_logo_url', logoData.small_logo_url);
    });

    it('should reject logo update for non-existent store', async () => {
      const response = await request(app)
        .put('/api/stores/99999/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          logo_url: '/uploads/logos/new_logo.png'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 스토어가 없습니다');
    });

    it('should reject logo update without authentication', async () => {
      const response = await request(app)
        .put(`/api/stores/${testData.store.id}/logo`)
        .send({
          logo_url: '/uploads/logos/new_logo.png'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
}); 