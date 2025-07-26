const request = require('supertest');
const app = require('../../index');

describe('Calls Routes Integration Tests', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    await global.setupTestDatabase();
    testData = await global.createTestData();
    
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

  describe('GET /api/calls', () => {
    it('should return calls for authenticated user with store permission', async () => {
      const response = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // 초기에는 호출이 없을 수 있음
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('call_type');
        expect(response.body[0]).toHaveProperty('status');
        expect(response.body[0]).toHaveProperty('store_id');
        expect(response.body[0].store_id).toBe(testData.store.id);
      }
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/calls')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without store ID', async () => {
      const response = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should filter calls by status', async () => {
      const response = await request(app)
        .get('/api/calls?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(call => {
        expect(call.status).toBe('pending');
      });
    });

    it('should filter calls by table', async () => {
      const response = await request(app)
        .get(`/api/calls?table_id=${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(call => {
        expect(call.table_id).toBe(testData.table.id);
      });
    });
  });

  describe('GET /api/calls/:id', () => {
    it('should return specific call for authenticated user', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/calls/${callId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('id', callId);
      expect(response.body).toHaveProperty('call_type', callData.call_type);
      expect(response.body).toHaveProperty('message', callData.message);
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('table_id', testData.table.id);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject request for non-existent call', async () => {
      const response = await request(app)
        .get('/api/calls/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 호출이 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/calls/1')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/calls', () => {
    it('should create new call with valid data', async () => {
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const response = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('call_type', callData.call_type);
      expect(response.body).toHaveProperty('message', callData.message);
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('table_id', testData.table.id);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject call creation without authentication', async () => {
      const response = await request(app)
        .post('/api/calls')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          call_type: 'service',
          message: '테스트 호출'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject call creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          message: '메시지만 있고 필수 필드가 없음'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('스토어 ID, 테이블 ID, 호출 타입이 필요합니다');
    });

    it('should reject call creation with non-existent table', async () => {
      const response = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: 99999, // 존재하지 않는 테이블
          call_type: 'service',
          message: '테스트 호출'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });

    it('should reject call creation with invalid call type', async () => {
      const response = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          call_type: 'invalid_type',
          message: '테스트 호출'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 호출 타입입니다');
    });
  });

  describe('PATCH /api/calls/:id/status', () => {
    it('should update call status', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/calls/${callId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'responded' })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'responded');
      expect(response.body).toHaveProperty('responded_by', testData.admin.id);
      expect(response.body).toHaveProperty('responded_at');
    });

    it('should reject status update for non-existent call', async () => {
      const response = await request(app)
        .patch('/api/calls/99999/status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'responded' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 호출이 없습니다');
    });

    it('should reject status update without authentication', async () => {
      const response = await request(app)
        .patch('/api/calls/1/status')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'responded' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject status update with invalid status', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/calls/${callId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('PUT /api/calls/:id', () => {
    it('should update call with valid data', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const updateData = {
        table_id: testData.table.id,
        call_type: 'payment',
        message: '수정된 호출입니다'
      };

      const response = await request(app)
        .put(`/api/calls/${callId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', callId);
      expect(response.body).toHaveProperty('call_type', updateData.call_type);
      expect(response.body).toHaveProperty('message', updateData.message);
      expect(response.body).toHaveProperty('table_id', updateData.table_id);
    });

    it('should reject update for non-existent call', async () => {
      const response = await request(app)
        .put('/api/calls/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          call_type: 'service',
          message: '수정된 호출'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 호출이 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put('/api/calls/1')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          call_type: 'service',
          message: '수정된 호출'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/calls/:id', () => {
    it('should soft delete call', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/calls/${callId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', callId);
      expect(response.body.deleted).toHaveProperty('id', callId);
    });

    it('should reject delete for non-existent call', async () => {
      const response = await request(app)
        .delete('/api/calls/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 호출이 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/api/calls/1')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/calls/status/:status', () => {
    it('should return calls by status', async () => {
      const response = await request(app)
        .get('/api/calls/status/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(call => {
        expect(call.status).toBe('pending');
        expect(call.store_id).toBe(testData.store.id);
      });
    });

    it('should reject request with invalid status', async () => {
      const response = await request(app)
        .get('/api/calls/status/invalid_status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('POST /api/calls/bulk-complete', () => {
    it('should complete multiple calls', async () => {
      // 먼저 호출들 생성
      const callData1 = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출 1'
      };

      const callData2 = {
        table_id: testData.table.id,
        call_type: 'payment',
        message: '테스트 호출 2'
      };

      const createResponse1 = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData1)
        .expect(201);

      const createResponse2 = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData2)
        .expect(201);

      const bulkCompleteData = {
        call_ids: [createResponse1.body.id, createResponse2.body.id]
      };

      const response = await request(app)
        .post('/api/calls/bulk-complete')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(bulkCompleteData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('completed_count', 2);
    });

    it('should reject bulk complete without authentication', async () => {
      const response = await request(app)
        .post('/api/calls/bulk-complete')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ call_ids: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/calls/quick-respond', () => {
    it('should quickly respond to call', async () => {
      // 먼저 호출 생성
      const callData = {
        table_id: testData.table.id,
        call_type: 'service',
        message: '테스트 호출입니다'
      };

      const createResponse = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(callData)
        .expect(201);

      const callId = createResponse.body.id;

      const response = await request(app)
        .post('/api/calls/quick-respond')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ call_id: callId })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('call');
      expect(response.body).toHaveProperty('response_type');
      expect(response.body.call).toHaveProperty('status', 'responded');
      expect(response.body.call).toHaveProperty('responded_by', testData.admin.id);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject quick respond for non-existent call', async () => {
      const response = await request(app)
        .post('/api/calls/quick-respond')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ call_id: 99999 })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 호출이 없습니다');
    });
  });

  describe('GET /api/calls/dashboard/stats', () => {
    it('should return call dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/calls/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('today');
      expect(response.body).toHaveProperty('this_week');
      expect(response.body).toHaveProperty('call_types');
      expect(response.body.today).toHaveProperty('total_calls');
      expect(response.body.today).toHaveProperty('pending_calls');
      expect(response.body.today).toHaveProperty('responded_calls');
      expect(response.body.today).toHaveProperty('completed_calls');
      expect(response.body.this_week).toHaveProperty('total_calls');
      expect(response.body.this_week).toHaveProperty('completed_calls');
      expect(Array.isArray(response.body.call_types)).toBe(true);
    });
  });
}); 