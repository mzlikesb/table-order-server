const request = require('supertest');
const app = require('../../index');

describe('Tables Routes Integration Tests', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    await global.setupTestDatabase();
    testData = await global.createTestData();
    
    // 인증 토큰 생성
    authToken = global.generateTestToken({
      adminId: testData.admin.id,
      username: testData.admin.username,
      email: testData.admin.email,
      is_super_admin: false
    });
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
    
    // 새로운 테스트 데이터에 맞는 토큰 생성
    authToken = global.generateTestToken({
      adminId: testData.admin.id,
      username: testData.admin.username,
      email: testData.admin.email,
      is_super_admin: false
    });
  });

  describe('GET /api/tables', () => {
    it('should return tables for authenticated user with store permission', async () => {
      const response = await request(app)
        .get('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('table_number');
      expect(response.body[0]).toHaveProperty('store_id');
      expect(response.body[0].store_id).toBe(testData.store.id);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/tables')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without store ID', async () => {
      const response = await request(app)
        .get('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should filter tables by status', async () => {
      const response = await request(app)
        .get('/api/tables?status=available')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(table => {
        expect(table.status).toBe('available');
      });
    });
  });

  describe('GET /api/tables/:id', () => {
    it('should return specific table for authenticated user', async () => {
      const response = await request(app)
        .get(`/api/tables/${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.table.id);
      expect(response.body).toHaveProperty('table_number', testData.table.table_number);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject request for non-existent table', async () => {
      const response = await request(app)
        .get('/api/tables/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/api/tables/${testData.table.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/tables', () => {
    it('should create new table with valid data', async () => {
      const newTableData = {
        table_number: 'A2',
        name: '새 테이블',
        capacity: 6,
        status: 'available'
      };

      const response = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(newTableData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('table_number', newTableData.table_number);
      expect(response.body).toHaveProperty('name', newTableData.name);
      expect(response.body).toHaveProperty('capacity', newTableData.capacity);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject table creation without authentication', async () => {
      const response = await request(app)
        .post('/api/tables')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: 'A2',
          name: '새 테이블'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject table creation with duplicate table number', async () => {
      const response = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: testData.table.table_number, // 이미 존재하는 테이블 번호
          name: '중복 테이블'
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('이미 등록된 테이블 번호입니다');
    });

    it('should reject table creation with invalid capacity', async () => {
      const response = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: 'A3',
          name: '잘못된 테이블',
          capacity: 25 // 1-20 범위를 벗어남
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('수용 인원은 1-20명 사이여야 합니다');
    });

    it('should reject table creation with invalid status', async () => {
      const response = await request(app)
        .post('/api/tables')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: 'A3',
          name: '잘못된 테이블',
          status: 'invalid_status'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('PUT /api/tables/:id', () => {
    it('should update table with valid data', async () => {
      const updateData = {
        table_number: 'A1-UPDATED',
        name: '업데이트된 테이블',
        capacity: 8,
        status: 'reserved'
      };

      const response = await request(app)
        .put(`/api/tables/${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.table.id);
      expect(response.body).toHaveProperty('table_number', updateData.table_number);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty('capacity', updateData.capacity);
      expect(response.body).toHaveProperty('status', updateData.status);
    });

    it('should reject update for non-existent table', async () => {
      const response = await request(app)
        .put('/api/tables/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: 'A1-UPDATED',
          name: '업데이트된 테이블'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put(`/api/tables/${testData.table.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_number: 'A1-UPDATED',
          name: '업데이트된 테이블'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/tables/:id', () => {
    it('should partially update table', async () => {
      const patchData = {
        name: '부분 업데이트된 테이블',
        status: 'maintenance'
      };

      const response = await request(app)
        .patch(`/api/tables/${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(patchData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.table.id);
      expect(response.body).toHaveProperty('name', patchData.name);
      expect(response.body).toHaveProperty('status', patchData.status);
      // 기존 값들은 유지되어야 함
      expect(response.body).toHaveProperty('table_number', testData.table.table_number);
      expect(response.body).toHaveProperty('capacity', testData.table.capacity);
    });

    it('should reject partial update without authentication', async () => {
      const response = await request(app)
        .patch(`/api/tables/${testData.table.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '부분 업데이트된 테이블'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/tables/:id', () => {
    it('should soft delete table', async () => {
      const response = await request(app)
        .delete(`/api/tables/${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', testData.table.id);
      expect(response.body.deleted).toHaveProperty('is_active', false);
    });

    it('should reject delete for non-existent table', async () => {
      const response = await request(app)
        .delete('/api/tables/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete(`/api/tables/${testData.table.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/tables/status/:status', () => {
    it('should return tables by status', async () => {
      const response = await request(app)
        .get('/api/tables/status/available')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(table => {
        expect(table.status).toBe('available');
        expect(table.store_id).toBe(testData.store.id);
      });
    });

    it('should reject request with invalid status', async () => {
      const response = await request(app)
        .get('/api/tables/status/invalid_status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('POST /api/tables/quick-status', () => {
    it('should quickly change table status', async () => {
      const response = await request(app)
        .post('/api/tables/quick-status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          status: 'occupied'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('table');
      expect(response.body.table).toHaveProperty('status', 'occupied');
      expect(response.body).toHaveProperty('message');
    });

    it('should reject quick status change for non-existent table', async () => {
      const response = await request(app)
        .post('/api/tables/quick-status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: 99999,
          status: 'occupied'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });
  });

  describe('GET /api/tables/dashboard/stats', () => {
    it('should return table dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/tables/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('capacity_stats');
      expect(response.body).toHaveProperty('recent_tables');
      expect(response.body).toHaveProperty('table_order_stats');
      
      expect(response.body.total).toHaveProperty('total_tables');
      expect(response.body.total).toHaveProperty('available_tables');
      expect(response.body.total).toHaveProperty('occupied_tables');
      expect(response.body.total).toHaveProperty('reserved_tables');
      expect(response.body.total).toHaveProperty('maintenance_tables');
    });
  });
}); 