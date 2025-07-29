// routes/menu-categories.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/menu-categories
 * 메뉴 카테고리 전체 목록 조회 (멀티테넌트 - 가게별 필터링)
 */
router.get('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { include_inactive = false } = req.query;
    const storeId = req.tenant?.storeId;
    
    try {
      let query = `
        SELECT 
          mc.*,
          COUNT(m.id) as menu_count,
          COUNT(CASE WHEN m.is_available = true THEN 1 END) as active_menu_count
        FROM menu_categories mc
        LEFT JOIN menus m ON mc.id = m.category_id
        WHERE mc.store_id = $1
      `;
      
      if (!include_inactive) {
        query += ' AND mc.is_active = true';
      }
      
      query += ' GROUP BY mc.id ORDER BY mc.sort_order, mc.name';
      
      const result = await pool.query(query, [storeId]);
      res.json(result.rows);
    } catch (e) {
      console.error('메뉴 카테고리 조회 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
    }
  }
);

/**
 * [GET] /api/menu-categories/with-menu-count
 * 메뉴 카테고리 목록 조회 (메뉴 개수 포함)
 */
router.get('/with-menu-count', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { include_inactive = false } = req.query;
    const storeId = req.tenant?.storeId;
    
    try {
      let query = `
        SELECT 
          mc.*,
          COUNT(m.id) as menu_count,
          COUNT(CASE WHEN m.is_available = true THEN 1 END) as active_menu_count
        FROM menu_categories mc
        LEFT JOIN menus m ON mc.id = m.category_id
        WHERE mc.store_id = $1
      `;
      
      if (!include_inactive) {
        query += ' AND mc.is_active = true';
      }
      
      query += ' GROUP BY mc.id ORDER BY mc.sort_order, mc.name';
      
      const result = await pool.query(query, [storeId]);
      
      // COUNT 결과를 숫자로 변환
      const rows = result.rows.map(row => ({
        ...row,
        menu_count: parseInt(row.menu_count, 10),
        active_menu_count: parseInt(row.active_menu_count, 10)
      }));
      
      res.json(rows);
    } catch (e) {
      console.error('메뉴 카테고리 조회 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
    }
  }
);

/**
 * [GET] /api/menu-categories/:id
 * 특정 메뉴 카테고리 상세 조회 (멀티테넌트 - 가게별 권한 확인)
 */
router.get('/:id', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      const result = await pool.query(
        'SELECT * FROM menu_categories WHERE id = $1 AND store_id = $2 AND is_active = true', 
        [id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 카테고리 조회 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
    }
  }
);

/**
 * [POST] /api/menu-categories
 * 메뉴 카테고리 추가 (멀티테넌트)
 */
router.post('/', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { name, sort_order, description, store_id } = req.body;
    
    // store_id를 여러 방법으로 찾기
    let storeId = req.tenant?.storeId || 
                  req.headers['x-store-id'] || 
                  store_id || 
                  req.body.store_id;
    
    // 디버깅 로그
    console.log('=== 메뉴 카테고리 추가 디버그 ===');
    console.log('req.tenant:', req.tenant);
    console.log('req.headers:', req.headers);
    console.log('req.body:', req.body);
    console.log('storeId:', storeId);
    console.log('===============================');
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '카테고리 이름이 필요합니다' });
    }
    
    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }
    
    // 이름 길이 검증
    if (name.length > 50) {
      return res.status(400).json({ error: '카테고리 이름은 50자 이하여야 합니다' });
    }
    
    try {
      // 동일한 이름의 카테고리가 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
        [storeId, name.trim()]
      );
      
      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '동일한 이름의 카테고리가 이미 존재합니다' });
      }
      
      // sort_order가 없으면 현재 최대값 + 1로 설정
      let finalSortOrder = sort_order;
      if (!finalSortOrder) {
        const maxOrderResult = await pool.query(
          'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM menu_categories WHERE store_id = $1',
          [storeId]
        );
        finalSortOrder = maxOrderResult.rows[0].next_order;
      }
      
      const result = await pool.query(
        `INSERT INTO menu_categories (store_id, name, sort_order, description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [storeId, name.trim(), finalSortOrder, description || null]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 카테고리 추가 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 추가 실패' });
    }
  }
);

/**
 * [PUT] /api/menu-categories/:id
 * 메뉴 카테고리 수정 (멀티테넌트)
 */
router.put('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { name, sort_order, is_active, description } = req.body;
    const storeId = req.tenant?.storeId;
    
    try {
      // 카테고리가 해당 스토어에 속하는지 확인
      const categoryCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );
      
      if (categoryCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }
      
      // 이름이 변경되는 경우 중복 확인
      if (name && name.trim()) {
        if (name.length > 50) {
          return res.status(400).json({ error: '카테고리 이름은 50자 이하여야 합니다' });
        }
        
        const existingCheck = await pool.query(
          'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND id != $3 AND is_active = true',
          [storeId, name.trim(), id]
        );
        
        if (existingCheck.rowCount > 0) {
          return res.status(409).json({ error: '동일한 이름의 카테고리가 이미 존재합니다' });
        }
      }
      
      const result = await pool.query(
        `UPDATE menu_categories SET
           name = COALESCE($1, name),
           sort_order = COALESCE($2, sort_order),
           is_active = COALESCE($3, is_active),
           description = COALESCE($4, description),
           updated_at = NOW()
         WHERE id = $5 AND store_id = $6 RETURNING *`,
        [name?.trim(), sort_order, is_active, description, id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }
      
      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 카테고리 수정 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 수정 실패' });
    }
  }
);

/**
 * [DELETE] /api/menu-categories/:id
 * 메뉴 카테고리 삭제 (실제 삭제 대신 비활성화 - 멀티테넌트)
 */
router.delete('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 카테고리가 해당 스토어에 속하는지 확인
      const categoryCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );
      
      if (categoryCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }
      
      // 해당 카테고리에 속한 메뉴가 있는지 확인
      const menuCheck = await pool.query(
        'SELECT COUNT(*) as menu_count FROM menus WHERE category_id = $1 AND is_available = true',
        [id]
      );
      
      if (parseInt(menuCheck.rows[0].menu_count) > 0) {
        return res.status(400).json({ 
          error: '이 카테고리에 속한 메뉴가 있습니다. 먼저 메뉴를 다른 카테고리로 이동하거나 삭제해주세요.' 
        });
      }
      
      const result = await pool.query(
        'UPDATE menu_categories SET is_active = false, updated_at = NOW() WHERE id = $1 AND store_id = $2 RETURNING *', 
        [id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }
      
      res.json({ success: true, deleted: result.rows[0] });
    } catch (e) {
      console.error('메뉴 카테고리 삭제 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 삭제 실패' });
    }
  }
);

/**
 * [PATCH] /api/menu-categories/:id
 * 메뉴 카테고리 일부 수정 (멀티테넌트)
 */
router.patch('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    const fields = [];
    const values = [];
    let i = 1;

    // 수정 가능한 필드들
    const allowedFields = ['name', 'sort_order', 'is_active', 'description'];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다' });
    }

    try {
      // 카테고리가 해당 스토어에 속하는지 확인
      const categoryCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );
      
      if (categoryCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }

      // 이름이 변경되는 경우 중복 확인
      if (req.body.name && req.body.name.trim()) {
        if (req.body.name.length > 50) {
          return res.status(400).json({ error: '카테고리 이름은 50자 이하여야 합니다' });
        }
        
        const existingCheck = await pool.query(
          'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND id != $3 AND is_active = true',
          [storeId, req.body.name.trim(), id]
        );
        
        if (existingCheck.rowCount > 0) {
          return res.status(409).json({ error: '동일한 이름의 카테고리가 이미 존재합니다' });
        }
      }

      values.push(id, storeId);
      fields.push('updated_at = NOW()');

      const result = await pool.query(
        `UPDATE menu_categories SET ${fields.join(', ')} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 카테고리가 없습니다' });
      }

      res.json(result.rows[0]);
    } catch (e) {
      console.error('메뉴 카테고리 수정 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 수정 실패' });
    }
  }
);

/**
 * [POST] /api/menu-categories/bulk-sort
 * 메뉴 카테고리 순서 일괄 변경 (멀티테넌트)
 * Body: { categories: [{ id: 1, sort_order: 1 }, { id: 2, sort_order: 2 }] }
 */
router.post('/bulk-sort', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { categories } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: '카테고리 배열이 필요합니다' });
    }
    
    try {
      // 모든 카테고리가 해당 스토어에 속하는지 확인
      const categoryIds = categories.map(cat => cat.id);
      const placeholders = categoryIds.map((_, index) => `$${index + 1}`).join(',');
      
      const checkResult = await pool.query(
        `SELECT id FROM menu_categories WHERE id IN (${placeholders}) AND store_id = $${categoryIds.length + 1}`,
        [...categoryIds, storeId]
      );
      
      if (checkResult.rowCount !== categoryIds.length) {
        return res.status(400).json({ error: '일부 카테고리가 해당 가게에 속하지 않습니다' });
      }
      
      // 트랜잭션으로 일괄 업데이트
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (const category of categories) {
          await client.query(
            'UPDATE menu_categories SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3',
            [category.sort_order, category.id, storeId]
          );
        }
        
        await client.query('COMMIT');
        
        // 업데이트된 카테고리 목록 반환
        const result = await pool.query(
          `SELECT * FROM menu_categories WHERE id IN (${placeholders}) AND store_id = $${categoryIds.length + 1} ORDER BY sort_order`,
          [...categoryIds, storeId]
        );
        
        res.json({
          success: true,
          updated_count: result.rowCount,
          categories: result.rows
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('카테고리 순서 일괄 변경 실패:', e);
      res.status(500).json({ error: '카테고리 순서 일괄 변경 실패' });
    }
  }
);

/**
 * [POST] /api/menu-categories/duplicate
 * 메뉴 카테고리 복제 (멀티테넌트)
 * Body: { category_id, new_name }
 */
router.post('/duplicate', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { category_id, new_name } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!category_id || !new_name || !new_name.trim()) {
      return res.status(400).json({ error: '카테고리 ID와 새 이름이 필요합니다' });
    }
    
    if (new_name.length > 50) {
      return res.status(400).json({ error: '카테고리 이름은 50자 이하여야 합니다' });
    }
    
    try {
      // 원본 카테고리가 해당 스토어에 속하는지 확인
      const originalCategory = await pool.query(
        'SELECT * FROM menu_categories WHERE id = $1 AND store_id = $2',
        [category_id, storeId]
      );
      
      if (originalCategory.rowCount === 0) {
        return res.status(404).json({ error: '원본 카테고리가 없습니다' });
      }
      
      // 새 이름이 중복되지 않는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
        [storeId, new_name.trim()]
      );
      
      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '동일한 이름의 카테고리가 이미 존재합니다' });
      }
      
      // 새 sort_order 계산
      const maxOrderResult = await pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM menu_categories WHERE store_id = $1',
        [storeId]
      );
      const newSortOrder = maxOrderResult.rows[0].next_order;
      
      // 새 카테고리 생성
      const newCategory = await pool.query(
        `INSERT INTO menu_categories (store_id, name, sort_order, description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [storeId, new_name.trim(), newSortOrder, originalCategory.rows[0].description]
      );
      
      res.status(201).json({
        success: true,
        original_category: originalCategory.rows[0],
        new_category: newCategory.rows[0]
      });
    } catch (e) {
      console.error('메뉴 카테고리 복제 실패:', e);
      res.status(500).json({ error: '메뉴 카테고리 복제 실패' });
    }
  }
);

/**
 * [GET] /api/menu-categories/customer
 * 고객용 공개 메뉴 카테고리 조회 (인증 없이)
 * Query: { store_id }
 */
router.get('/customer', async (req, res) => {
  const { store_id } = req.query;
  
  if (!store_id) {
    return res.status(400).json({ error: '스토어 ID가 필요합니다' });
  }
  
  try {
    // 스토어 존재 확인
    const storeCheck = await pool.query(
      'SELECT id, name FROM stores WHERE id = $1',
      [store_id]
    );

    if (storeCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    const result = await pool.query(`
      SELECT 
        mc.id, mc.name, mc.description, mc.sort_order,
        COUNT(m.id) as menu_count,
        COUNT(CASE WHEN m.is_available = true THEN 1 END) as active_menu_count
      FROM menu_categories mc
      LEFT JOIN menus m ON mc.id = m.category_id
      WHERE mc.store_id = $1 AND mc.is_active = true
      GROUP BY mc.id
      ORDER BY mc.sort_order, mc.name
    `, [store_id]);
    
    // COUNT 결과를 숫자로 변환
    const rows = result.rows.map(row => ({
      ...row,
      menu_count: parseInt(row.menu_count, 10),
      active_menu_count: parseInt(row.active_menu_count, 10)
    }));
    
    res.json(rows);
  } catch (e) {
    console.error('고객용 메뉴 카테고리 조회 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
  }
});

module.exports = router; 