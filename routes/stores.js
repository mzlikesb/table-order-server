// routes/stores.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  authenticateToken, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/stores
 * 스토어 전체 조회 (Super Admin만)
 */
router.get('/', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { limit = 50, offset = 0, include_inactive = false } = req.query;
    
    try {
      let query = `
        SELECT 
          id, code, name, address, phone, timezone, small_logo_url, is_active, 
          created_at, updated_at
        FROM stores 
      `;
      let params = [];
      
      if (!include_inactive) {
        query += ' WHERE is_active = true';
      }
      
      query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('스토어 조회 실패:', e);
      res.status(500).json({ error: '스토어 조회 실패' });
    }
  }
);

/**
 * [GET] /api/stores/search
 * 스토어 검색 (Super Admin만)
 */
router.get('/search', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { q, is_active, limit = 20, offset = 0 } = req.query;
    
    try {
      let query = `
        SELECT 
          id, code, name, address, phone, timezone, small_logo_url, is_active, 
          created_at, updated_at
        FROM stores
        WHERE 1=1
      `;
      let params = [];
      
      if (q) {
        query += ` AND (code ILIKE $${params.length + 1} OR name ILIKE $${params.length + 1} OR address ILIKE $${params.length + 1})`;
        params.push(`%${q}%`);
      }
      
      if (is_active !== undefined) {
        query += ` AND is_active = $${params.length + 1}`;
        params.push(is_active === 'true');
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('스토어 검색 실패:', e);
      res.status(500).json({ error: '스토어 검색 실패' });
    }
  }
);

/**
 * [GET] /api/stores/stats
 * 스토어 통계 (Super Admin만)
 */
router.get('/stats', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    try {
      // 전체 스토어 통계
      const totalStats = await pool.query(`
        SELECT 
          COUNT(*) as total_stores,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_stores,
          COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_stores,
          COUNT(CASE WHEN small_logo_url IS NOT NULL THEN 1 END) as stores_with_logos
        FROM stores
      `);

      // 최근 생성된 스토어 (최근 30일)
      const recentStores = await pool.query(`
        SELECT 
          id, code, name, created_at
        FROM stores 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      // 스토어별 데이터 통계
      const storeDataStats = await pool.query(`
        SELECT 
          s.id,
          s.code,
          s.name,
          s.is_active,
          COUNT(DISTINCT m.id) as menu_count,
          COUNT(DISTINCT o.id) as order_count,
          COUNT(DISTINCT t.id) as table_count
        FROM stores s
        LEFT JOIN menus m ON s.id = m.store_id
        LEFT JOIN orders o ON s.id = o.store_id
        LEFT JOIN tables t ON s.id = t.store_id
        GROUP BY s.id, s.code, s.name, s.is_active
        ORDER BY s.created_at DESC
      `);

      res.json({
        total: totalStats.rows[0],
        recent_stores: recentStores.rows,
        store_data_stats: storeDataStats.rows
      });
    } catch (e) {
      console.error('스토어 통계 조회 실패:', e);
      res.status(500).json({ error: '스토어 통계 조회 실패' });
    }
  }
);

/**
 * [GET] /api/stores/:id
 * 특정 스토어 상세 조회 (Super Admin만)
 */
router.get('/:id', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await pool.query(`
        SELECT 
          id, code, name, address, phone, timezone, small_logo_url, is_active, 
          created_at, updated_at
        FROM stores 
        WHERE id = $1
      `, [id]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('스토어 조회 실패:', e);
      res.status(500).json({ error: '스토어 조회 실패' });
    }
  }
);

/**
 * [POST] /api/stores
 * 스토어 추가 (Super Admin만)
 */
router.post('/', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { code, name, address, phone, timezone, small_logo_url } = req.body;
    
    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: '스토어 코드와 이름이 필요합니다' });
    }
    
    // 코드 길이 검증
    if (code.length > 20) {
      return res.status(400).json({ error: '스토어 코드는 20자 이하여야 합니다' });
    }
    
    // 이름 길이 검증
    if (name.length > 100) {
      return res.status(400).json({ error: '스토어 이름은 100자 이하여야 합니다' });
    }
    
    // 코드 형식 검증 (영문, 숫자, 언더스코어만 허용)
    if (!/^[a-zA-Z0-9_]+$/.test(code)) {
      return res.status(400).json({ error: '스토어 코드는 영문, 숫자, 언더스코어만 사용 가능합니다' });
    }
    
    try {
      // 동일한 코드가 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM stores WHERE code = $1',
        [code.trim()]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '이미 존재하는 스토어 코드입니다' });
      }

      const result = await pool.query(
        `INSERT INTO stores (code, name, address, phone, timezone, small_logo_url)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'Asia/Seoul'), $6) RETURNING *`,
        [code.trim(), name.trim(), address || null, phone || null, timezone, small_logo_url || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (e) {
      console.error('스토어 추가 실패:', e);
      if (e.code === '23505') { // unique_violation
        return res.status(400).json({ error: '이미 존재하는 스토어 코드입니다' });
      }
      res.status(500).json({ error: '스토어 추가 실패' });
    }
  }
);

/**
 * [PUT] /api/stores/:id
 * 스토어 전체 수정 (Super Admin만)
 */
router.put('/:id', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { id } = req.params;
    const { code, name, address, phone, timezone, is_active, small_logo_url } = req.body;
    
    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: '스토어 코드와 이름이 필요합니다' });
    }
    
    // 코드 길이 검증
    if (code.length > 20) {
      return res.status(400).json({ error: '스토어 코드는 20자 이하여야 합니다' });
    }
    
    // 이름 길이 검증
    if (name.length > 100) {
      return res.status(400).json({ error: '스토어 이름은 100자 이하여야 합니다' });
    }
    
    // 코드 형식 검증 (영문, 숫자, 언더스코어만 허용)
    if (!/^[a-zA-Z0-9_]+$/.test(code)) {
      return res.status(400).json({ error: '스토어 코드는 영문, 숫자, 언더스코어만 사용 가능합니다' });
    }
    
    try {
      // 스토어가 존재하는지 확인
      const storeCheck = await pool.query(
        'SELECT id FROM stores WHERE id = $1',
        [id]
      );

      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }

      // 동일한 코드가 다른 스토어에 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM stores WHERE code = $1 AND id != $2',
        [code.trim(), id]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '이미 존재하는 스토어 코드입니다' });
      }

      const result = await pool.query(
        `UPDATE stores SET
           code = $1,
           name = $2,
           address = $3,
           phone = $4,
           timezone = COALESCE($5, 'Asia/Seoul'),
           is_active = COALESCE($6, true),
           small_logo_url = $7,
           updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [code.trim(), name.trim(), address || null, phone || null, timezone, is_active, small_logo_url || null, id]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('스토어 수정 실패:', e);
      if (e.code === '23505') { // unique_violation
        return res.status(400).json({ error: '이미 존재하는 스토어 코드입니다' });
      }
      res.status(500).json({ error: '스토어 수정 실패' });
    }
  }
);

/**
 * [PATCH] /api/stores/:id
 * 스토어 일부 수정 (Super Admin만)
 */
router.patch('/:id', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { id } = req.params;
    const fields = [];
    const values = [];
    let i = 1;

    // 수정 가능한 필드들
    const allowedFields = ['code', 'name', 'address', 'phone', 'timezone', 'is_active', 'small_logo_url'];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        
        // 코드와 이름은 trim 처리
        if (key === 'code' || key === 'name') {
          values.push(req.body[key].trim());
        } else {
          values.push(req.body[key]);
        }
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다' });
    }

    // 코드와 이름에 대한 검증
    if (req.body.code !== undefined) {
      if (!req.body.code.trim()) {
        return res.status(400).json({ error: '스토어 코드는 비워둘 수 없습니다' });
      }
      if (req.body.code.length > 20) {
        return res.status(400).json({ error: '스토어 코드는 20자 이하여야 합니다' });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(req.body.code)) {
        return res.status(400).json({ error: '스토어 코드는 영문, 숫자, 언더스코어만 사용 가능합니다' });
      }
    }

    if (req.body.name !== undefined) {
      if (!req.body.name.trim()) {
        return res.status(400).json({ error: '스토어 이름은 비워둘 수 없습니다' });
      }
      if (req.body.name.length > 100) {
        return res.status(400).json({ error: '스토어 이름은 100자 이하여야 합니다' });
      }
    }
    
    values.push(id);

    try {
      // 스토어가 존재하는지 확인
      const storeCheck = await pool.query(
        'SELECT id FROM stores WHERE id = $1',
        [id]
      );

      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }

      // 코드가 변경되는 경우 중복 확인
      if (req.body.code !== undefined) {
        const existingCheck = await pool.query(
          'SELECT id FROM stores WHERE code = $1 AND id != $2',
          [req.body.code.trim(), id]
        );

        if (existingCheck.rowCount > 0) {
          return res.status(409).json({ error: '이미 존재하는 스토어 코드입니다' });
        }
      }

      fields.push('updated_at = NOW()');
      const result = await pool.query(
        `UPDATE stores SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('스토어 수정 실패:', e);
      if (e.code === '23505') { // unique_violation
        return res.status(400).json({ error: '이미 존재하는 스토어 코드입니다' });
      }
      res.status(500).json({ error: '스토어 수정 실패' });
    }
  }
);

/**
 * [DELETE] /api/stores/:id
 * 스토어 삭제 (실제 삭제 대신 비활성화 - Super Admin만)
 */
router.delete('/:id', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { id } = req.params;
    
    try {
      // 스토어가 존재하는지 확인
      const storeCheck = await pool.query(
        'SELECT id, name FROM stores WHERE id = $1',
        [id]
      );

      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }

      // 스토어에 연결된 데이터가 있는지 확인 (메뉴, 주문, 테이블 등)
      const relatedDataCheck = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM menus WHERE store_id = $1) as menu_count,
          (SELECT COUNT(*) FROM orders WHERE store_id = $1) as order_count,
          (SELECT COUNT(*) FROM tables WHERE store_id = $1) as table_count
      `, [id]);

      const data = relatedDataCheck.rows[0];
      const hasRelatedData = data.menu_count > 0 || data.order_count > 0 || 
                            data.table_count > 0;

      if (hasRelatedData) {
        return res.status(400).json({ 
          error: '스토어에 연결된 데이터가 있어 삭제할 수 없습니다',
          related_data: {
            menus: parseInt(data.menu_count),
            orders: parseInt(data.order_count),
            tables: parseInt(data.table_count)
          }
        });
      }

      const result = await pool.query(
        'UPDATE stores SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *', 
        [id]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }
      res.json({ 
        success: true, 
        deleted: result.rows[0],
        message: `스토어 "${storeCheck.rows[0].name}"이(가) 비활성화되었습니다`
      });
    } catch (e) {
      console.error('스토어 삭제 실패:', e);
      res.status(500).json({ error: '스토어 삭제 실패' });
    }
  }
);

/**
 * [GET] /api/stores/code/:code
 * 스토어 코드로 조회 (Super Admin만)
 */
router.get('/code/:code', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { code } = req.params;
    
    try {
      const result = await pool.query(`
        SELECT 
          id, code, name, address, phone, timezone, small_logo_url, is_active, 
          created_at, updated_at
        FROM stores 
        WHERE code = $1
      `, [code]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('스토어 코드 조회 실패:', e);
      res.status(500).json({ error: '스토어 코드 조회 실패' });
    }
  }
);

/**
 * [POST] /api/stores/bulk-status
 * 스토어 상태 일괄 변경 (Super Admin만)
 * Body: { store_ids: [1, 2, 3], is_active: true }
 */
router.post('/bulk-status', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { store_ids, is_active } = req.body;

    if (!store_ids || !Array.isArray(store_ids) || store_ids.length === 0) {
      return res.status(400).json({ error: '스토어 ID 배열이 필요합니다' });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active 값이 필요합니다' });
    }

    try {
      const updatePlaceholders = store_ids.map((_, index) => `$${index + 2}`).join(',');
      const result = await pool.query(
        `UPDATE stores SET is_active = $1, updated_at = NOW() 
         WHERE id IN (${updatePlaceholders})
         RETURNING *`,
        [Boolean(is_active), ...store_ids]
      );

      res.json({ 
        success: true, 
        updated_count: result.rowCount,
        updated_stores: result.rows 
      });
    } catch (e) {
      console.error('스토어 상태 일괄 변경 실패:', e);
      res.status(500).json({ error: '스토어 상태 일괄 변경 실패' });
    }
  }
);

/**
 * [POST] /api/stores/duplicate
 * 스토어 복제 (Super Admin만)
 * Body: { store_id, new_code, new_name }
 */
router.post('/duplicate', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { store_id, new_code, new_name } = req.body;

    if (!store_id || !new_code || !new_code.trim() || !new_name || !new_name.trim()) {
      return res.status(400).json({ error: '스토어 ID, 새 코드, 새 이름이 필요합니다' });
    }

    // 코드 길이 검증
    if (new_code.length > 20) {
      return res.status(400).json({ error: '스토어 코드는 20자 이하여야 합니다' });
    }

    // 이름 길이 검증
    if (new_name.length > 100) {
      return res.status(400).json({ error: '스토어 이름은 100자 이하여야 합니다' });
    }

    // 코드 형식 검증
    if (!/^[a-zA-Z0-9_]+$/.test(new_code)) {
      return res.status(400).json({ error: '스토어 코드는 영문, 숫자, 언더스코어만 사용 가능합니다' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 원본 스토어가 존재하는지 확인
      const originalStore = await client.query(
        'SELECT * FROM stores WHERE id = $1',
        [store_id]
      );

      if (originalStore.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '원본 스토어가 없습니다' });
      }

      // 새 코드가 이미 존재하는지 확인
      const existingCheck = await client.query(
        'SELECT id FROM stores WHERE code = $1',
        [new_code.trim()]
      );

      if (existingCheck.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: '이미 존재하는 스토어 코드입니다' });
      }

      // 새 스토어 생성
      const newStore = await client.query(
        `INSERT INTO stores (code, name, address, phone, timezone, small_logo_url, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          new_code.trim(),
          new_name.trim(),
          originalStore.rows[0].address,
          originalStore.rows[0].phone,
          originalStore.rows[0].timezone,
          originalStore.rows[0].small_logo_url,
          false // 복제된 스토어는 비활성화 상태로 시작
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        id: newStore.rows[0].id,
        original_store: originalStore.rows[0],
        new_store: newStore.rows[0],
        message: '스토어가 복제되었습니다. 새 스토어는 비활성화 상태입니다.'
      });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('스토어 복제 실패:', e);
      res.status(500).json({ error: '스토어 복제 실패' });
    } finally {
      client.release();
    }
  }
);

/**
 * [PUT] /api/stores/:id/logo
 * 스토어 로고 URL 업데이트 (Super Admin만)
 */
router.put('/:id/logo', 
  authenticateToken, 
  requireRole(['super_admin']),
  async (req, res) => {
    const { id } = req.params;
    const { small_logo_url } = req.body;

    if (!small_logo_url) {
      return res.status(400).json({ error: '로고 URL이 필요합니다' });
    }

    try {
      // 스토어가 존재하는지 확인
      const storeCheck = await pool.query(
        'SELECT id FROM stores WHERE id = $1',
        [id]
      );

      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }

      const updateFields = [];
      const values = [];
      let i = 1;

      if (small_logo_url !== undefined) {
        updateFields.push(`small_logo_url = $${i++}`);
        values.push(small_logo_url);
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE stores SET ${updateFields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );

      res.json({
        success: true,
        store: result.rows[0]
      });
    } catch (e) {
      console.error('스토어 로고 업데이트 실패:', e);
      res.status(500).json({ error: '스토어 로고 업데이트 실패' });
    }
  }
);

/**
 * [GET] /api/stores/:id/public
 * 공개 스토어 정보 조회 (인증 없이)
 */
router.get('/:id/public', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        id, code, name, address, phone, timezone, small_logo_url, is_active,
        created_at, updated_at
      FROM stores 
      WHERE id = $1 AND is_active = true
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('공개 스토어 조회 실패:', e);
    res.status(500).json({ error: '스토어 조회 실패' });
  }
});

/**
 * [GET] /api/stores/public/:id
 * 공개 스토어 정보 조회 (인증 없이) - 대체 경로
 */
router.get('/public/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        id, code, name, address, phone, timezone, small_logo_url, is_active,
        created_at, updated_at
      FROM stores 
      WHERE id = $1 AND is_active = true
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('공개 스토어 조회 실패:', e);
    res.status(500).json({ error: '스토어 조회 실패' });
  }
});

/**
 * [GET] /api/stores/:id/tables
 * 특정 스토어의 테이블 목록 조회
 */
router.get('/:id/tables', 
  authenticateToken, 
  async (req, res) => {
    const { id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    try {
      // 스토어가 존재하는지 확인
      const storeCheck = await pool.query(
        'SELECT id, name FROM stores WHERE id = $1',
        [id]
      );

      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 스토어가 없습니다' });
      }

      // 권한 확인
      if (req.user.is_super_admin) {
        // 슈퍼 관리자는 모든 스토어 접근 가능
      } else {
        // 일반 관리자는 권한 확인
        const permissionResult = await pool.query(
          `SELECT role FROM admin_store_permissions 
           WHERE admin_id = $1 AND store_id = $2`,
          [req.user.id, id]
        );

        if (permissionResult.rowCount === 0) {
          return res.status(403).json({ error: '해당 스토어에 대한 권한이 없습니다' });
        }
      }

      let query = `
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.store_id = $1 AND t.is_active = true
      `;
      let params = [id];

      if (status) {
        query += ' AND t.status = $2';
        params.push(status);
      }

      query += ' ORDER BY t.table_number LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('스토어별 테이블 조회 실패:', e);
      res.status(500).json({ error: '스토어별 테이블 조회 실패' });
    }
  }
);

module.exports = router; 