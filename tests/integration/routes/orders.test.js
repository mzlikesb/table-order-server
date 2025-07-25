const request = require('supertest');
const app = require('../../index');

describe('Orders Routes Integration Tests', () => {
  let testData;
  let authToken;

  beforeAll(async () => {
    await global.setupTestDatabase();
    testData = await global.createTestData();
    
    authToken = global.generateTestToken({
      id: testData.admin.id,
      username: testData.admin.username,
      role: 'owner',
      storeId: testData.store.id
    });
  });

  afterAll(async () => {
    await global.cleanupTestDatabase();
  });

  beforeEach(async () => {
    await global.cleanupTestDatabase();
    testData = await global.createTestData();
  });

  describe('GET /api/orders', () => {
    it('should return orders for authenticated user with store permission', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // 초기에는 주문이 없을 수 있음
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('order_number');
        expect(response.body[0]).toHaveProperty('status');
        expect(response.body[0]).toHaveProperty('store_id');
        expect(response.body[0].store_id).toBe(testData.store.id);
      }
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without store ID', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should filter orders by status', async () => {
      const response = await request(app)
        .get('/api/orders?status=pending')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(order => {
        expect(order.status).toBe('pending');
      });
    });

    it('should filter orders by table', async () => {
      const response = await request(app)
        .get(`/api/orders?table_id=${testData.table.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(order => {
        expect(order.table_id).toBe(testData.table.id);
      });
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should return specific order for authenticated user', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 2,
            unit_price: testData.menu.price,
            notes: '테스트 주문'
          }
        ],
        total_amount: testData.menu.price * 2,
        notes: '테스트 주문입니다'
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('id', orderId);
      expect(response.body).toHaveProperty('order_number');
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('table_id', testData.table.id);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should reject request for non-existent order', async () => {
      const response = await request(app)
        .get('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 주문이 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/orders/1')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/orders', () => {
    it('should create new order with valid data', async () => {
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 2,
            unit_price: testData.menu.price,
            notes: '테스트 주문'
          }
        ],
        total_amount: testData.menu.price * 2,
        notes: '테스트 주문입니다'
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('orderId');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body).toHaveProperty('order');
      expect(response.body.order).toHaveProperty('table_id', testData.table.id);
      expect(response.body.order).toHaveProperty('status', 'pending');
      expect(response.body.order).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject order creation without authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          items: [{ menu_id: testData.menu.id, quantity: 1, unit_price: 10000 }],
          total_amount: 10000
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject order creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          notes: '주문 메모만 있고 필수 필드가 없음'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('테이블 ID와 주문 아이템이 필요합니다');
    });

    it('should reject order creation with invalid items', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          items: [
            {
              menu_id: testData.menu.id,
              quantity: 0, // 잘못된 수량
              unit_price: testData.menu.price
            }
          ],
          total_amount: 10000
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('주문 아이템 정보가 올바르지 않습니다');
    });

    it('should reject order creation with non-existent table', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: 99999, // 존재하지 않는 테이블
          items: [{ menu_id: testData.menu.id, quantity: 1, unit_price: 10000 }],
          total_amount: 10000
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 테이블이 없습니다');
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('should update order status', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 1,
            unit_price: testData.menu.price
          }
        ],
        total_amount: testData.menu.price
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'preparing' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('order');
      expect(response.body.order).toHaveProperty('status', 'preparing');
    });

    it('should reject status update for non-existent order', async () => {
      const response = await request(app)
        .patch('/api/orders/99999/status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'preparing' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 주문이 없습니다');
    });

    it('should reject status update without authentication', async () => {
      const response = await request(app)
        .patch('/api/orders/1/status')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'preparing' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject status update with invalid status', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 1,
            unit_price: testData.menu.price
          }
        ],
        total_amount: testData.menu.price
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('should update order with valid data', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 1,
            unit_price: testData.menu.price
          }
        ],
        total_amount: testData.menu.price
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const updateData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 3,
            unit_price: testData.menu.price,
            notes: '수정된 주문'
          }
        ],
        total_amount: testData.menu.price * 3,
        notes: '수정된 주문입니다'
      };

      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('order');
      expect(response.body.order).toHaveProperty('total_amount', updateData.total_amount);
      expect(response.body.order).toHaveProperty('notes', updateData.notes);
    });

    it('should reject update for non-existent order', async () => {
      const response = await request(app)
        .put('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          items: [{ menu_id: testData.menu.id, quantity: 1, unit_price: 10000 }],
          total_amount: 10000
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 주문이 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put('/api/orders/1')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          table_id: testData.table.id,
          items: [{ menu_id: testData.menu.id, quantity: 1, unit_price: 10000 }],
          total_amount: 10000
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/orders/:id', () => {
    it('should soft delete order', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 1,
            unit_price: testData.menu.price
          }
        ],
        total_amount: testData.menu.price
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const response = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', orderId);
      expect(response.body.deleted).toHaveProperty('is_active', false);
    });

    it('should reject delete for non-existent order', async () => {
      const response = await request(app)
        .delete('/api/orders/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 주문이 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/api/orders/1')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/orders/status/:status', () => {
    it('should return orders by status', async () => {
      const response = await request(app)
        .get('/api/orders/status/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(order => {
        expect(order.status).toBe('pending');
        expect(order.store_id).toBe(testData.store.id);
      });
    });

    it('should reject request with invalid status', async () => {
      const response = await request(app)
        .get('/api/orders/status/invalid_status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('유효하지 않은 상태값입니다');
    });
  });

  describe('POST /api/orders/bulk-status-update', () => {
    it('should update multiple order statuses', async () => {
      // 먼저 주문들 생성
      const orderData1 = {
        table_id: testData.table.id,
        items: [{ menu_id: testData.menu.id, quantity: 1, unit_price: testData.menu.price }],
        total_amount: testData.menu.price
      };

      const orderData2 = {
        table_id: testData.table.id,
        items: [{ menu_id: testData.menu.id, quantity: 2, unit_price: testData.menu.price }],
        total_amount: testData.menu.price * 2
      };

      const createResponse1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData1)
        .expect(201);

      const createResponse2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData2)
        .expect(201);

      const bulkUpdateData = {
        order_ids: [createResponse1.body.orderId, createResponse2.body.orderId],
        status: 'ready'
      };

      const response = await request(app)
        .post('/api/orders/bulk-status-update')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(bulkUpdateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated_count', 2);
    });

    it('should reject bulk update without authentication', async () => {
      const response = await request(app)
        .post('/api/orders/bulk-status-update')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ order_ids: [], status: 'ready' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/orders/recent', () => {
    it('should return recent orders', async () => {
      const response = await request(app)
        .get('/api/orders/recent')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(order => {
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('order_number');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('store_id', testData.store.id);
      });
    });
  });

  describe('POST /api/orders/duplicate', () => {
    it('should duplicate existing order', async () => {
      // 먼저 주문 생성
      const orderData = {
        table_id: testData.table.id,
        items: [
          {
            menu_id: testData.menu.id,
            quantity: 1,
            unit_price: testData.menu.price
          }
        ],
        total_amount: testData.menu.price
      };

      const createResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(orderData)
        .expect(201);

      const orderId = createResponse.body.orderId;

      const duplicateData = {
        order_id: orderId,
        table_id: testData.table.id
      };

      const response = await request(app)
        .post('/api/orders/duplicate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(duplicateData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('orderId');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body).toHaveProperty('order');
      expect(response.body.order).toHaveProperty('table_id', duplicateData.table_id);
      expect(response.body.order).toHaveProperty('status', 'pending');
    });

    it('should reject duplicate without authentication', async () => {
      const response = await request(app)
        .post('/api/orders/duplicate')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ order_id: 1, table_id: testData.table.id })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/orders/dashboard/stats', () => {
    it('should return order dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/orders/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('total_orders');
      expect(response.body).toHaveProperty('pending_orders');
      expect(response.body).toHaveProperty('preparing_orders');
      expect(response.body).toHaveProperty('ready_orders');
      expect(response.body).toHaveProperty('completed_orders');
      expect(response.body).toHaveProperty('cancelled_orders');
      expect(response.body).toHaveProperty('total_revenue');
      expect(response.body).toHaveProperty('today_orders');
      expect(response.body).toHaveProperty('recent_orders');
    });
  });
}); 