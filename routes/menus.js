// routes/menus.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/menus
 * 메뉴 전체 목록 조회 (멀티테넌트 - 가게별 필터링)
 */
router.get('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { category_id, is_available, limit = 50, offset = 0 } = req.query;
    const storeId = req.tenant?.storeId;
    
    try {
      let query = `
        SELECT 
          m.id, m.store_id, m.category_id, m.name, m.description, 
          m.price, m.image_url, m.is_available, m.sort_order, 
          m.created_at, m.updated_at,
          mc.name as category_name,
          s.name as store_name
        FROM menus m
        LEFT JOIN menu_categories mc ON m.category_id = mc.id
        JOIN stores s ON m.store_id = s.id
        WHERE m.store_id = $1
      `;
      let params = [storeId];
      
      if (category_id) {
        query += ' AND m.category_id = $' + (params.length + 1);
        params.push(parseInt(category_id));
      }
      
      if (is_available !== undefined) {
        query += ' AND m.is_available = $' + (params.length + 1);
        params.push(is_available === 'true');
      }
      
      query += ' ORDER BY mc.sort_order, m.sort_order, m.name LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('메뉴 조회 실패:', e);
      res.status(500).json({ error: '메뉴 조회 실패' });
    }
  }
);

/**
 * [GET] /api/menus/search
 * 메뉴 검색 (멀티테넌트)
 */
router.get('/search', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { q, category_id, min_price, max_price, is_available, limit = 50, offset = 0 } = req.query;
    const storeId = req.tenant?.storeId;
    
    if (!q || !q.trim()) {
      return res.status(400).json({ error: '검색어가 필요합니다' });
    }
    
    try {
      let query = `
        SELECT 
          m.id, m.store_id, m.category_id, m.name, m.description, 
          m.price, m.image_url, m.is_available, m.sort_order, 
          m.created_at, m.updated_at,
          mc.name as category_name,
          s.name as store_name
        FROM menus m
        LEFT JOIN menu_categories mc ON m.category_id = mc.id
        JOIN stores s ON m.store_id = s.id
        WHERE m.store_id = $1 AND (m.name ILIKE $2 OR m.description ILIKE $2)
      `;
      let params = [storeId, `%${q.trim()}%`];
      
      if (category_id) {
        query += ' AND m.category_id = $' + (params.length + 1);
        params.push(parseInt(category_id));
      }
      
      if (is_available !== undefined) {
        query += ' AND m.is_available = $' + (params.length + 1);
        params.push(is_available === 'true');
      }
      
      if (min_price) {
        query += ' AND m.price >= $' + (params.length + 1);
        params.push(parseFloat(min_price));
      }
      
      if (max_price) {
        query += ' AND m.price <= $' + (params.length + 1);
        params.push(parseFloat(max_price));
      }
      
      query += ` ORDER BY m.sort_order, m.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('메뉴 검색 실패:', e);
      res.status(500).json({ error: '메뉴 검색 실패' });
    }
  }
);

/**
 * [GET] /api/menus/stats
 * 메뉴 통계 (멀티테넌트)
 */
router.get('/stats', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const storeId = req.tenant?.storeId;
    
    try {
      // 전체 메뉴 통계
      const totalStats = await pool.query(`
        SELECT 
          COUNT(*) as total_menus,
          COUNT(CASE WHEN is_available = true THEN 1 END) as available_menus,
          COUNT(CASE WHEN is_available = false THEN 1 END) as unavailable_menus,
          COUNT(CASE WHEN image_url IS NOT NULL THEN 1 END) as menus_with_images,
          AVG(price) as avg_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM menus 
        WHERE store_id = $1
      `, [storeId]);

      // 카테고리별 메뉴 통계
      const categoryStats = await pool.query(`
        SELECT 
          mc.id,
          mc.name as category_name,
          COUNT(m.id) as menu_count,
          COUNT(CASE WHEN m.is_available = true THEN 1 END) as available_count,
          AVG(m.price) as avg_price
        FROM menu_categories mc
        LEFT JOIN menus m ON mc.id = m.category_id AND m.store_id = mc.store_id
        WHERE mc.store_id = $1 AND mc.is_active = true
        GROUP BY mc.id, mc.name
        ORDER BY mc.sort_order, mc.name
      `, [storeId]);

      res.json({
        ...totalStats.rows[0],
        categories_count: categoryStats.rows.length,
        categories: categoryStats.rows
      });
    } catch (e) {
      console.error('메뉴 통계 조회 실패:', e);
      res.status(500).json({ error: '메뉴 통계 조회 실패' });
    }
  }
);

/**
 * [GET] /api/menus/:id
 * 특정 메뉴 상세 조회 (멀티테넌트 - 가게별 권한 확인)
 */
router.get('/:id', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      const result = await pool.query(`
        SELECT 
          m.id, m.store_id, m.category_id, m.name, m.description, 
          m.price, m.image_url, m.is_available, m.sort_order, 
          m.created_at, m.updated_at,
          mc.name as category_name,
          s.name as store_name
        FROM menus m
        LEFT JOIN menu_categories mc ON m.category_id = mc.id
        JOIN stores s ON m.store_id = s.id
        WHERE m.id = $1 AND m.store_id = $2
      `, [id, storeId]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 조회 실패:', e);
      res.status(500).json({ error: '메뉴 조회 실패' });
    }
  }
);

/**
 * [POST] /api/menus
 * 메뉴 추가 (멀티테넌트)
 */
router.post('/', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { category_id, category_name, name, description, price, image_url, is_available, sort_order } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!name || !name.trim() || !price) {
      return res.status(400).json({ error: '메뉴명과 가격이 필요합니다' });
    }
    
    // 이름 길이 검증
    if (name.length > 100) {
      return res.status(400).json({ error: '메뉴명은 100자 이하여야 합니다' });
    }
    
    // price가 문자열로 전달된 경우 숫자로 변환
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: '가격은 유효한 숫자여야 합니다' });
    }
    
    // category_id가 문자열로 전달된 경우 정수로 변환
    let parsedCategoryId = null;
    if (category_id !== undefined && category_id !== null) {
      parsedCategoryId = parseInt(category_id, 10);
      if (isNaN(parsedCategoryId)) {
        return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
      }
    }
    
    try {
      // category_id가 없고 category_name이 있는 경우, 카테고리를 자동으로 생성
      if (!parsedCategoryId && category_name) {
        // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
        const existingCategory = await pool.query(
          'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
          [storeId, category_name.trim()]
        );
        
        if (existingCategory.rowCount > 0) {
          parsedCategoryId = existingCategory.rows[0].id;
        } else {
          // 새로운 카테고리 생성
          const newCategory = await pool.query(
            'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
            [storeId, category_name.trim()]
          );
          parsedCategoryId = newCategory.rows[0].id;
        }
      }
      
      // sort_order가 없으면 현재 최대값 + 1로 설정
      let finalSortOrder = sort_order;
      if (!finalSortOrder) {
        const maxOrderResult = await pool.query(
          'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM menus WHERE store_id = $1',
          [storeId]
        );
        finalSortOrder = maxOrderResult.rows[0].next_order;
      }
      
      const result = await pool.query(
        `INSERT INTO menus (store_id, category_id, name, description, price, image_url, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), $8) RETURNING *`,
        [storeId, parsedCategoryId, name.trim(), description || null, parsedPrice, image_url || null, is_available, finalSortOrder]
      );
      res.status(201).json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 추가 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 카테고리 ID입니다' });
      } else {
        res.status(500).json({ error: '메뉴 추가 실패' });
      }
    }
  }
);

/**
 * [PUT] /api/menus/:id
 * 메뉴 전체 수정 (멀티테넌트)
 */
router.put('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { category_id, category_name, name, description, price, image_url, is_available, sort_order } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!name || !name.trim() || !price) {
      return res.status(400).json({ error: '메뉴명과 가격이 필요합니다' });
    }
    
    // 이름 길이 검증
    if (name.length > 100) {
      return res.status(400).json({ error: '메뉴명은 100자 이하여야 합니다' });
    }
    
    // price가 문자열로 전달된 경우 숫자로 변환
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: '가격은 유효한 숫자여야 합니다' });
    }
    
    // category_id가 문자열로 전달된 경우 정수로 변환
    let parsedCategoryId = null;
    if (category_id !== undefined && category_id !== null) {
      parsedCategoryId = parseInt(category_id, 10);
      if (isNaN(parsedCategoryId)) {
        return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
      }
    }
    
    try {
      // 메뉴가 해당 스토어에 속하는지 확인
      const menuCheck = await pool.query(
        'SELECT id FROM menus WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (menuCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }

      // category_id가 없고 category_name이 있는 경우, 카테고리를 자동으로 생성
      if (!parsedCategoryId && category_name) {
        // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
        const existingCategory = await pool.query(
          'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
          [storeId, category_name.trim()]
        );
        
        if (existingCategory.rowCount > 0) {
          parsedCategoryId = existingCategory.rows[0].id;
        } else {
          // 새로운 카테고리 생성
          const newCategory = await pool.query(
            'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
            [storeId, category_name.trim()]
          );
          parsedCategoryId = newCategory.rows[0].id;
        }
      }
      
      const result = await pool.query(
        `UPDATE menus SET
           category_id = $1,
           name = $2,
           description = $3,
           price = $4,
           image_url = $5,
           is_available = COALESCE($6, TRUE),
           sort_order = COALESCE($7, 0),
           updated_at = NOW()
         WHERE id = $8 AND store_id = $9 RETURNING *`,
        [parsedCategoryId, name.trim(), description || null, parsedPrice, image_url || null, is_available, sort_order, id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 수정 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 카테고리 ID입니다' });
      } else {
        res.status(500).json({ error: '메뉴 수정 실패' });
      }
    }
  }
);

/**
 * [PUT] /api/menus/:id/image
 * 메뉴 이미지 URL 업데이트 (멀티테넌트)
 */
router.put('/:id/image', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { image_url } = req.body;
    const storeId = req.tenant?.storeId;

    if (!image_url) {
      return res.status(400).json({ error: '이미지 URL이 필요합니다' });
    }

    try {
      // 메뉴가 해당 스토어에 속하는지 확인
      const menuCheck = await pool.query(
        'SELECT id FROM menus WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (menuCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }

      const result = await pool.query(
        `UPDATE menus SET 
           image_url = $1,
           updated_at = NOW()
         WHERE id = $2 AND store_id = $3 RETURNING *`,
        [image_url, id, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 이미지 업데이트 실패:', e);
      res.status(500).json({ error: '메뉴 이미지 업데이트 실패' });
    }
  }
);

/**
 * [PATCH] /api/menus/:id
 * 메뉴 일부 수정 (멀티테넌트)
 */
router.patch('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { category_name } = req.body;
    const storeId = req.tenant?.storeId;
    const fields = [];
    const values = [];
    let i = 1;

    // 수정 가능한 필드들 (store_id 제외)
    const allowedFields = ['category_id', 'name', 'description', 'price', 'image_url', 'is_available', 'sort_order'];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        
        // category_id가 문자열로 전달된 경우 정수로 변환
        if (key === 'category_id') {
          const parsedCategoryId = parseInt(req.body[key], 10);
          if (isNaN(parsedCategoryId)) {
            return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
          }
          values.push(parsedCategoryId);
        } 
        // price가 문자열로 전달된 경우 숫자로 변환
        else if (key === 'price') {
          const parsedPrice = parseFloat(req.body[key]);
          if (isNaN(parsedPrice) || parsedPrice < 0) {
            return res.status(400).json({ error: '가격은 유효한 숫자여야 합니다' });
          }
          values.push(parsedPrice);
        } else {
          values.push(req.body[key]);
        }
      }
    }
    
    // category_name이 제공된 경우 카테고리 자동 생성 로직
    if (category_name && !req.body.category_id) {
      // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
      const existingCategory = await pool.query(
        'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
        [storeId, category_name.trim()]
      );
      
      let categoryId;
      if (existingCategory.rowCount > 0) {
        categoryId = existingCategory.rows[0].id;
      } else {
        // 새로운 카테고리 생성
        const newCategory = await pool.query(
          'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
          [storeId, category_name.trim()]
        );
        categoryId = newCategory.rows[0].id;
      }
      
      fields.push(`category_id = $${i++}`);
      values.push(categoryId);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다' });
    }

    // 메뉴가 해당 스토어에 속하는지 확인
    const menuCheck = await pool.query(
      'SELECT id FROM menus WHERE id = $1 AND store_id = $2',
      [id, storeId]
    );

    if (menuCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    
    values.push(id, storeId);
    fields.push('updated_at = NOW()');

    try {
      const result = await pool.query(
        `UPDATE menus SET ${fields.join(', ')} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
        values
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 수정 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 카테고리 ID입니다' });
      } else {
        res.status(500).json({ error: '메뉴 수정 실패' });
      }
    }
  }
);

/**
 * [DELETE] /api/menus/:id
 * 메뉴 삭제 (소프트 삭제 - is_available = false)
 */
router.delete('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 메뉴가 해당 스토어에 속하는지 확인
      const menuCheck = await pool.query(
        'SELECT id FROM menus WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (menuCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }

      const result = await pool.query(
        'UPDATE menus SET is_available = false, updated_at = NOW() WHERE id = $1 AND store_id = $2 RETURNING *', 
        [id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 메뉴가 없습니다' });
      }
      res.json({ success: true, deleted: result.rows[0] });
    } catch (e) {
      console.error('메뉴 삭제 실패:', e);
      res.status(500).json({ error: '메뉴 삭제 실패' });
    }
  }
);

/**
 * [GET] /api/menus/store/:storeId
 * 특정 스토어의 메뉴 목록 조회 (멀티테넌트 - 권한 확인)
 */
router.get('/store/:storeId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { storeId } = req.params;
    const tenantStoreId = req.tenant?.storeId;
    
    // 요청한 스토어와 테넌트 스토어가 일치하는지 확인
    if (storeId != tenantStoreId) {
      return res.status(403).json({ error: '다른 가게의 메뉴를 조회할 권한이 없습니다' });
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          m.id, m.store_id, m.category_id, m.name, m.description, 
          m.price, m.image_url, m.is_available, m.sort_order, 
          m.created_at, m.updated_at,
          mc.name as category_name,
          s.name as store_name
        FROM menus m
        LEFT JOIN menu_categories mc ON m.category_id = mc.id
        JOIN stores s ON m.store_id = s.id
        WHERE m.store_id = $1 AND m.is_available = true
        ORDER BY mc.sort_order, m.sort_order, m.name
      `, [storeId]);
      
      res.json(result.rows);
    } catch (e) {
      console.error('스토어별 메뉴 조회 실패:', e);
      res.status(500).json({ error: '스토어별 메뉴 조회 실패' });
    }
  }
);

/**
 * [GET] /api/menus/category/:categoryId
 * 특정 카테고리의 메뉴 목록 조회 (멀티테넌트)
 */
router.get('/category/:categoryId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { categoryId } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 카테고리가 해당 스토어에 속하는지 확인
      const categoryCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE id = $1 AND store_id = $2 AND is_active = true',
        [categoryId, storeId]
      );

      if (categoryCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }

      const result = await pool.query(`
        SELECT 
          m.id, m.store_id, m.category_id, m.name, m.description, 
          m.price, m.image_url, m.is_available, m.sort_order, 
          m.created_at, m.updated_at,
          mc.name as category_name,
          s.name as store_name
        FROM menus m
        LEFT JOIN menu_categories mc ON m.category_id = mc.id
        JOIN stores s ON m.store_id = s.id
        WHERE m.category_id = $1 AND m.store_id = $2 AND m.is_available = true
        ORDER BY m.sort_order, m.name
      `, [categoryId, storeId]);
      
      res.json(result.rows);
    } catch (e) {
      console.error('카테고리별 메뉴 조회 실패:', e);
      res.status(500).json({ error: '카테고리별 메뉴 조회 실패' });
    }
  }
);

/**
 * [POST] /api/menus/bulk-sort
 * 메뉴 정렬 순서 일괄 변경 (멀티테넌트)
 * Body: { menu_orders: [{id: 1, sort_order: 1}, {id: 2, sort_order: 2}] }
 */
router.post('/bulk-sort', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { menu_orders } = req.body;
    const storeId = req.tenant?.storeId;

    if (!menu_orders || !Array.isArray(menu_orders) || menu_orders.length === 0) {
      return res.status(400).json({ error: '메뉴 정렬 정보가 필요합니다' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 메뉴들이 해당 스토어에 속하는지 확인
      const menuIds = menu_orders.map(item => item.id);
      const placeholders = menuIds.map((_, index) => `$${index + 1}`).join(',');
      const checkQuery = `SELECT id FROM menus WHERE id IN (${placeholders}) AND store_id = $${menuIds.length + 1}`;
      const checkResult = await client.query(checkQuery, [...menuIds, storeId]);

      if (checkResult.rowCount !== menuIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '일부 메뉴가 해당 가게에 속하지 않습니다' });
      }

      // 정렬 순서 업데이트
      for (const item of menu_orders) {
        await client.query(
          'UPDATE menus SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3',
          [item.sort_order, item.id, storeId]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, updated_count: menu_orders.length });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('메뉴 정렬 일괄 변경 실패:', error);
      res.status(500).json({ error: '메뉴 정렬 일괄 변경 실패' });
    } finally {
      client.release();
    }
  }
);

/**
 * [POST] /api/menus/bulk-status
 * 메뉴 상태 일괄 변경 (멀티테넌트)
 * Body: { menu_ids: [1, 2, 3], is_available: true }
 */
router.post('/bulk-status', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { menu_ids, is_available } = req.body;
    const storeId = req.tenant?.storeId;

    if (!menu_ids || !Array.isArray(menu_ids) || menu_ids.length === 0) {
      return res.status(400).json({ error: '메뉴 ID 배열이 필요합니다' });
    }

    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'is_available 값이 필요합니다' });
    }

    try {
      // 메뉴들이 해당 스토어에 속하는지 확인
      const placeholders = menu_ids.map((_, index) => `$${index + 1}`).join(',');
      const checkQuery = `SELECT id FROM menus WHERE id IN (${placeholders}) AND store_id = $${menu_ids.length + 1}`;
      const checkResult = await pool.query(checkQuery, [...menu_ids, storeId]);

      if (checkResult.rowCount !== menu_ids.length) {
        return res.status(400).json({ error: '일부 메뉴가 해당 가게에 속하지 않습니다' });
      }

      const result = await pool.query(
        `UPDATE menus SET is_available = $1, updated_at = NOW() 
         WHERE id IN (${placeholders}) AND store_id = $${menu_ids.length + 2}
         RETURNING *`,
        [Boolean(is_available), ...menu_ids, storeId]
      );

      res.json({ 
        success: true, 
        updated_count: result.rowCount,
        updated_menus: result.rows 
      });
    } catch (e) {
      console.error('메뉴 상태 일괄 변경 실패:', e);
      res.status(500).json({ error: '메뉴 상태 일괄 변경 실패' });
    }
  }
);

/**
 * [POST] /api/menus/duplicate
 * 메뉴 복제 (멀티테넌트)
 * Body: { menu_id, new_name }
 */
router.post('/duplicate', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { menu_id, new_name } = req.body;
    const storeId = req.tenant?.storeId;

    if (!menu_id || !new_name || !new_name.trim()) {
      return res.status(400).json({ error: '메뉴 ID와 새 메뉴명이 필요합니다' });
    }

    if (new_name.length > 100) {
      return res.status(400).json({ error: '메뉴명은 100자 이하여야 합니다' });
    }

    try {
      // 원본 메뉴가 해당 스토어에 속하는지 확인
      const originalMenu = await pool.query(
        'SELECT * FROM menus WHERE id = $1 AND store_id = $2',
        [menu_id, storeId]
      );

      if (originalMenu.rowCount === 0) {
        return res.status(404).json({ error: '원본 메뉴가 없습니다' });
      }

      // sort_order가 없으면 현재 최대값 + 1로 설정
      const maxOrderResult = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM menus WHERE store_id = $1',
        [storeId]
      );
      const newSortOrder = maxOrderResult.rows[0].next_order;

      const result = await pool.query(
        `INSERT INTO menus (store_id, category_id, name, description, price, image_url, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          storeId,
          originalMenu.rows[0].category_id,
          new_name.trim(),
          originalMenu.rows[0].description,
          originalMenu.rows[0].price,
          originalMenu.rows[0].image_url,
          originalMenu.rows[0].is_available,
          newSortOrder
        ]
      );

      res.status(201).json({
        success: true,
        original_menu: originalMenu.rows[0],
        new_menu: result.rows[0],
        store_id: storeId
      });
    } catch (e) {
      console.error('메뉴 복제 실패:', e);
      res.status(500).json({ error: '메뉴 복제 실패' });
    }
  }
);

module.exports = router;
