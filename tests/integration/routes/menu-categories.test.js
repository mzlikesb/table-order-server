const request = require('supertest');
const app = require('../../index');

describe('Menu Categories Routes Integration Tests', () => {
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

  describe('GET /api/menu-categories', () => {
    it('should return menu categories for authenticated user with store permission', async () => {
      const response = await request(app)
        .get('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('sort_order');
      expect(response.body[0]).toHaveProperty('store_id');
      expect(response.body[0].store_id).toBe(testData.store.id);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/menu-categories')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without store ID', async () => {
      const response = await request(app)
        .get('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('store_id가 필요합니다');
    });

    it('should return categories sorted by sort_order', async () => {
      // 추가 카테고리 생성
      await global.testPool.query(
        'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, $3)',
        [testData.store.id, '두 번째 카테고리', 2]
      );

      const response = await request(app)
        .get('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(1);
      
      // sort_order 순으로 정렬되어야 함
      for (let i = 1; i < response.body.length; i++) {
        expect(response.body[i].sort_order).toBeGreaterThanOrEqual(response.body[i-1].sort_order);
      }
    });
  });

  describe('GET /api/menu-categories/:id', () => {
    it('should return specific category for authenticated user', async () => {
      const response = await request(app)
        .get(`/api/menu-categories/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.category.id);
      expect(response.body).toHaveProperty('name', testData.category.name);
      expect(response.body).toHaveProperty('sort_order', testData.category.sort_order);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject request for non-existent category', async () => {
      const response = await request(app)
        .get('/api/menu-categories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 카테고리가 없습니다');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/api/menu-categories/${testData.category.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/menu-categories', () => {
    it('should create new category with valid data', async () => {
      const newCategoryData = {
        name: '새로운 카테고리',
        sort_order: 2,
        description: '새로운 카테고리 설명'
      };

      const response = await request(app)
        .post('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(newCategoryData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', newCategoryData.name);
      expect(response.body).toHaveProperty('sort_order', newCategoryData.sort_order);
      expect(response.body).toHaveProperty('description', newCategoryData.description);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should create category with auto-generated sort_order', async () => {
      const newCategoryData = {
        name: '자동 정렬 카테고리'
      };

      const response = await request(app)
        .post('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(newCategoryData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', newCategoryData.name);
      expect(response.body).toHaveProperty('sort_order');
      expect(response.body.sort_order).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('store_id', testData.store.id);
    });

    it('should reject category creation without authentication', async () => {
      const response = await request(app)
        .post('/api/menu-categories')
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '새로운 카테고리'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject category creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          description: '설명만 있고 이름이 없음'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('카테고리 이름이 필요합니다');
    });

    it('should reject category creation with duplicate name', async () => {
      const response = await request(app)
        .post('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: testData.category.name // 이미 존재하는 이름
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('동일한 이름의 카테고리가 이미 존재합니다');
    });

    it('should reject category creation with name too long', async () => {
      const longName = 'a'.repeat(51); // 50자 초과
      const response = await request(app)
        .post('/api/menu-categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: longName
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('카테고리 이름은 50자 이하여야 합니다');
    });
  });

  describe('PUT /api/menu-categories/:id', () => {
    it('should update category with valid data', async () => {
      const updateData = {
        name: '업데이트된 카테고리',
        sort_order: 5,
        description: '업데이트된 설명'
      };

      const response = await request(app)
        .put(`/api/menu-categories/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.category.id);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty('sort_order', updateData.sort_order);
      expect(response.body).toHaveProperty('description', updateData.description);
    });

    it('should reject update for non-existent category', async () => {
      const response = await request(app)
        .put('/api/menu-categories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '업데이트된 카테고리'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 카테고리가 없습니다');
    });

    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put(`/api/menu-categories/${testData.category.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '업데이트된 카테고리'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/menu-categories/:id', () => {
    it('should partially update category', async () => {
      const patchData = {
        name: '부분 업데이트된 카테고리',
        sort_order: 3
      };

      const response = await request(app)
        .patch(`/api/menu-categories/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(patchData)
        .expect(200);

      expect(response.body).toHaveProperty('id', testData.category.id);
      expect(response.body).toHaveProperty('name', patchData.name);
      expect(response.body).toHaveProperty('sort_order', patchData.sort_order);
      // 기존 값들은 유지되어야 함
      expect(response.body).toHaveProperty('description', testData.category.description);
    });

    it('should reject partial update without authentication', async () => {
      const response = await request(app)
        .patch(`/api/menu-categories/${testData.category.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({
          name: '부분 업데이트된 카테고리'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/menu-categories/:id', () => {
    it('should soft delete category', async () => {
      const response = await request(app)
        .delete(`/api/menu-categories/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted');
      expect(response.body.deleted).toHaveProperty('id', testData.category.id);
      expect(response.body.deleted).toHaveProperty('is_active', false);
    });

    it('should reject delete for non-existent category', async () => {
      const response = await request(app)
        .delete('/api/menu-categories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 카테고리가 없습니다');
    });

    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete(`/api/menu-categories/${testData.category.id}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject delete for category with active menus', async () => {
      // 메뉴가 있는 카테고리는 삭제할 수 없음
      const response = await request(app)
        .delete(`/api/menu-categories/${testData.category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('활성화된 메뉴가 있는 카테고리는 삭제할 수 없습니다');
    });
  });

  describe('POST /api/menu-categories/bulk-sort', () => {
    it('should update category sort order in bulk', async () => {
      // 추가 카테고리 생성
      const category2 = await global.testPool.query(
        'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *',
        [testData.store.id, '두 번째 카테고리', 2]
      );

      const sortData = [
        { id: testData.category.id, sort_order: 2 },
        { id: category2.rows[0].id, sort_order: 1 }
      ];

      const response = await request(app)
        .post('/api/menu-categories/bulk-sort')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ categories: sortData })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updated_count', 2);
    });

    it('should reject bulk sort without authentication', async () => {
      const response = await request(app)
        .post('/api/menu-categories/bulk-sort')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ categories: [] })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menu-categories/with-menu-count', () => {
    it('should return categories with menu count', async () => {
      const response = await request(app)
        .get('/api/menu-categories/with-menu-count')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach(category => {
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('menu_count');
        expect(typeof category.menu_count).toBe('number');
        expect(category).toHaveProperty('store_id', testData.store.id);
      });
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/menu-categories/with-menu-count')
        .set('X-Store-ID', testData.store.id.toString())
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/menu-categories/duplicate', () => {
    it('should duplicate existing category', async () => {
      const duplicateData = {
        category_id: testData.category.id,
        new_name: '복제된 카테고리'
      };

      const response = await request(app)
        .post('/api/menu-categories/duplicate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send(duplicateData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', duplicateData.new_name);
      expect(response.body).toHaveProperty('sort_order');
      expect(response.body).toHaveProperty('store_id', testData.store.id);
      expect(response.body.id).not.toBe(testData.category.id); // 새로운 ID여야 함
    });

    it('should reject duplicate without authentication', async () => {
      const response = await request(app)
        .post('/api/menu-categories/duplicate')
        .set('X-Store-ID', testData.store.id.toString())
        .send({ category_id: testData.category.id, new_name: '복제된 카테고리' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject duplicate for non-existent category', async () => {
      const response = await request(app)
        .post('/api/menu-categories/duplicate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Store-ID', testData.store.id.toString())
        .send({ category_id: 99999, new_name: '복제된 카테고리' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('해당 카테고리가 없습니다');
    });
  });
}); 