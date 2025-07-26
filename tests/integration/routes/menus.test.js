const request = require('supertest');
const app = require('../../index');

describe('Menus Routes Integration Tests', () => {
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

  describe('GET /api/menus', () => {
    it('should return menus for authenticated user with store permission', async () => {
      const response = await request(app)
        .get('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('price');
      expect(response.body[0]).toHaveProperty('store_id');
      expect(response.body[0].store_id).toBe(testData.store.id);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/menus')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without store ID', async () => {
      const response = await request(app)
        .get('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should filter menus by category', async () => {
      const response = await request(app)
        .get(`/api/menus?category_id=${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(menu => {
        expect(menu.category_id).toBe(testData.category.id);
      });
    });

    it('should filter menus by availability', async () => {
      const response = await request(app)
        .get('/api/menus?is_available=true')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(menu => {
        expect(menu.is_available).toBe(true);
      });
    });
  });

  describe('GET /api/menus/:id', () => {
    it('should return specific menu for authenticated user', async () => {
      const response = await request(app)
        .get(`/api/menus/${testData.menu.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.menu.id);
      expect(response.body).toHaveProperty('name', testData.menu.name);
      expect(response.body).toHaveProperty('price', testData.menu.price);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject request for non-existent menu', async () => {
      const response = await request(app)
        .get('/api/menus/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 메뉴가 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/api/menus/${testData.menu.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/menus', () => {
    it('should create new menu with valid data', async () => {
      const newMenuData = {
        category_id: testData.category.id,
        name: '새로운 메뉴',
        description: '새로운 메뉴 설명',
        price: 15000,
        is_available: true
      };

      const response = await request(app)
        .post('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(newMenuData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', newMenuData.name);
      expect(response.body).toHaveProperty('description', newMenuData.description);
      expect(response.body).toHaveProperty('price', newMenuData.price);
      expect(response.body).toHaveProperty('category_id', newMenuData.category_id);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should create menu with auto-generated category', async () => {
      const newMenuData = {
        category_name: '새로운 카테고리',
        name: '새로운 메뉴',
        price: 15000
      };

      const response = await request(app)
        .post('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(newMenuData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', newMenuData.name);
      expect(response.body).toHaveProperty('category_id');
      expect(response.body.category_id).toBeDefined();
    });

    it('should reject menu creation without authentication', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '새로운 메뉴',
          price: 15000
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject menu creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          description: '메뉴 설명만 있고 이름이 없음'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('메뉴명과 가격이 필요합니다');
    });

    it('should reject menu creation with invalid price', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '잘못된 메뉴',
          price: -1000
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('가격은 유효한 숫자여야 합니다');
    });

    it('should reject menu creation with name too long', async () => {
      const longName = 'a'.repeat(101); // 100자 초과
      const response = await request(app)
        .post('/api/menus')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: longName,
          price: 15000
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('메뉴명은 100자 이하여야 합니다');
    });
  });

  describe('PUT /api/menus/:id', () => {
    it('should update menu with valid data', async () => {
      const updateData = {
        name: '업데이트된 메뉴',
        description: '업데이트된 설명',
        price: 20000,
        is_available: false
      };

      const response = await request(app)
        .put(`/api/menus/${testData.menu.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.menu.id);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty('description', updateData.description);
      expect(response.body).toHaveProperty('price', updateData.price);
      expect(response.body).toHaveProperty('is_available', updateData.is_available);
    });

    it('should reject update for non-existent menu', async () => {
      const response = await request(app)
        .put('/api/menus/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '업데이트된 메뉴',
          price: 20000
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 메뉴가 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put(`/api/menus/${testData.menu.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '업데이트된 메뉴',
          price: 20000
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/menus/:id', () => {
    it('should partially update menu', async () => {
      const patchData = {
        name: '부분 업데이트된 메뉴',
        is_available: false
      };

      const response = await request(app)
        .patch(`/api/menus/${testData.menu.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(patchData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.menu.id);
      expect(response.body).toHaveProperty('name', patchData.name);
      expect(response.body).toHaveProperty('is_available', patchData.is_available);
      // 기존 값들은 유지되어야 함
      expect(response.body).toHaveProperty('price', testData.menu.price);
      expect(response.body).toHaveProperty('category_id', testData.menu.category_id);
    });

    it('should reject partial update without authentication', async () => {
      const response = await request(app)
        .patch(`/api/menus/${testData.menu.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '부분 업데이트된 메뉴'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/menus/:id', () => {
    it('should soft delete menu', async () => {
      const response = await request(app)
        .delete(`/api/menus/${testData.menu.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', testData.menu.id);
      expect(response.body.deleted).toHaveProperty('is_active', false);
    });

    it('should reject delete for non-existent menu', async () => {
      const response = await request(app)
        .delete('/api/menus/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 메뉴가 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete(`/api/menus/${testData.menu.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menus/category/:categoryId', () => {
    it('should return menus by category', async () => {
      const response = await request(app)
        .get(`/api/menus/category/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(menu => {
        expect(menu.category_id).toBe(testData.category.id);
        expect(menu.store_id).toBe(testData.store.id);
      });
    });

    it('should reject request with invalid category ID', async () => {
      const response = await request(app)
        .get('/api/menus/category/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 카테고리가 없습니다');
    });
  });

  describe('POST /api/menus/bulk-sort', () => {
    it('should update menu sort order in bulk', async () => {
      // 추가 메뉴 생성
      const menu2 = await global.testPool.query(
        'INSERT INTO menus (store_id, category_id, name, price, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [testData.store.id, testData.category.id, '메뉴 2', 12000, 2]
      );

      const sortData = [
        { id: testData.menu.id, sort_order: 2 },
        { id: menu2.rows[0].id, sort_order: 1 }
      ];

      const response = await request(app)
        .post('/api/menus/bulk-sort')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ menus: sortData })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated_count', 2);
    });

    it('should reject bulk sort without authentication', async () => {
      const response = await request(app)
        .post('/api/menus/bulk-sort')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ menus: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/menus/bulk-status', () => {
    it('should update menu availability in bulk', async () => {
      const statusData = {
        menu_ids: [testData.menu.id],
        is_available: false
      };

      const response = await request(app)
        .post('/api/menus/bulk-status')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(statusData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated_count', 1);
    });

    it('should reject bulk status update without authentication', async () => {
      const response = await request(app)
        .post('/api/menus/bulk-status')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ menu_ids: [], is_available: false })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menus/search', () => {
    it('should search menus by name', async () => {
      const response = await request(app)
        .get('/api/menus/search?q=테스트')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach(menu => {
        expect(menu.name.toLowerCase()).toContain('테스트');
        expect(menu.store_id).toBe(testData.store.id);
      });
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/menus/search?q=nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('POST /api/menus/duplicate', () => {
    it('should duplicate existing menu', async () => {
      const duplicateData = {
        menu_id: testData.menu.id,
        new_name: '복제된 메뉴'
      };

      const response = await request(app)
        .post('/api/menus/duplicate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(duplicateData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', duplicateData.new_name);
      expect(response.body).toHaveProperty('price', testData.menu.price);
      expect(response.body).toHaveProperty('category_id', testData.menu.category_id);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject duplicate without authentication', async () => {
      const response = await request(app)
        .post('/api/menus/duplicate')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ menu_id: testData.menu.id, new_name: '복제된 메뉴' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menus/stats', () => {
    it('should return menu statistics', async () => {
      const response = await request(app)
        .get('/api/menus/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('total_menus');
      expect(response.body).toHaveProperty('available_menus');
      expect(response.body).toHaveProperty('unavailable_menus');
      expect(response.body).toHaveProperty('categories_count');
      expect(response.body).toHaveProperty('price_range');
      expect(response.body).toHaveProperty('recent_menus');
    });
  });
}); 