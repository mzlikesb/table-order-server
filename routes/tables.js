// routes/tables.js

const express = require('express');
const router = express.Router();
// 테스트 환경에서는 global.testPool 사용, 프로덕션에서는 일반 pool 사용
const pool = global.testPool || require('../db/connection');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/tables
 * 테이블 전체 목록 조회 (멀티테넌트)
 */
router.get('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    const storeId = req.tenant?.storeId;

    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }

    try {
      let query = `
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.store_id = $1 AND t.is_active = true
      `;
      let params = [storeId];

      if (status) {
        query += ' AND t.status = $2';
        params.push(status);
      }

      query += ' ORDER BY t.table_number LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('테이블 목록 조회 실패:', e);
      res.status(500).json({ error: '테이블 목록 조회 실패' });
    }
  }
);

/**
 * [GET] /api/tables/search
 * 테이블 검색 (멀티테넌트)
 */
router.get('/search', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { q, status, capacity, limit = 20, offset = 0 } = req.query;
    const storeId = req.tenant?.storeId;
    
    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }
    
    try {
      let query = `
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.store_id = $1 AND t.is_active = true
      `;
      let params = [storeId];
      
      if (q) {
        query += ` AND (t.table_number ILIKE $${params.length + 1} OR t.name ILIKE $${params.length + 1})`;
        params.push(`%${q}%`);
      }
      
      if (status) {
        query += ` AND t.status = $${params.length + 1}`;
        params.push(status);
      }

      if (capacity) {
        query += ` AND t.capacity = $${params.length + 1}`;
        params.push(parseInt(capacity));
      }
      
      query += ` ORDER BY t.table_number LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('테이블 검색 실패:', e);
      res.status(500).json({ error: '테이블 검색 실패' });
    }
  }
);

/**
 * [GET] /api/tables/:id
 * 특정 테이블 정보 조회 (멀티테넌트)
 */
router.get('/:id', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;

    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }

    try {
      const result = await pool.query(`
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.id = $1 AND t.store_id = $2 AND t.is_active = true
      `, [id, storeId]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('테이블 조회 실패:', e);
      res.status(500).json({ error: '테이블 조회 실패' });
    }
  }
);

/**
 * [POST] /api/tables
 * 새 테이블 등록 (멀티테넌트)
 */
router.post('/', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { table_number, name, capacity, status } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!table_number || !table_number.toString().trim()) {
      return res.status(400).json({ error: '테이블 번호는 필수입니다' });
    }

    // 테이블 번호 길이 검증
    if (table_number.toString().length > 10) {
      return res.status(400).json({ error: '테이블 번호는 10자 이하여야 합니다' });
    }

    // 수용 인원 검증
    if (capacity && (capacity < 1 || capacity > 20)) {
      return res.status(400).json({ error: '수용 인원은 1-20명 사이여야 합니다' });
    }

    // 상태값 검증
    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      // 동일한 테이블 번호가 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM tables WHERE store_id = $1 AND table_number = $2 AND is_active = true',
        [storeId, table_number.toString().trim()]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      }

      const result = await pool.query(
        `INSERT INTO tables (store_id, table_number, name, capacity, status)
         VALUES ($1, $2::VARCHAR(10), $3, COALESCE($4, 4), COALESCE($5, 'available')) RETURNING *`,
        [storeId, table_number.toString().trim(), name || null, capacity || 4, status || 'available']
      );

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: result.rows[0].id,
            storeId: storeId,
            tableNumber: result.rows[0].table_number,
            name: result.rows[0].name,
            capacity: result.rows[0].capacity,
            status: result.rows[0].status,
            action: 'created'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.status(201).json(result.rows[0]);
    } catch (e) {
      console.error('테이블 등록 실패:', e);
      if (e.code === '23505') {
        res.status(400).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      } else if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 스토어 ID입니다' });
      } else {
        res.status(500).json({ error: '테이블 등록 실패' });
      }
    }
  }
);

/**
 * [PUT] /api/tables/:id
 * 테이블 정보 전체 수정 (멀티테넌트)
 */
router.put('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { table_number, name, capacity, status, is_active } = req.body;
    const storeId = req.tenant?.storeId;
    
    if (!table_number || !table_number.toString().trim()) {
      return res.status(400).json({ error: '테이블 번호는 필수입니다' });
    }

    // 테이블 번호 길이 검증
    if (table_number.toString().length > 10) {
      return res.status(400).json({ error: '테이블 번호는 10자 이하여야 합니다' });
    }

    // 수용 인원 검증
    if (capacity && (capacity < 1 || capacity > 20)) {
      return res.status(400).json({ error: '수용 인원은 1-20명 사이여야 합니다' });
    }

    // 상태값 검증
    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 동일한 테이블 번호가 다른 테이블에 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM tables WHERE store_id = $1 AND table_number = $2 AND id != $3 AND is_active = true',
        [storeId, table_number.toString().trim(), id]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      }

      const result = await pool.query(
        `UPDATE tables SET
           table_number = $1::VARCHAR(10),
           name = $2,
           capacity = COALESCE($3, 4),
           status = COALESCE($4, 'available'),
           is_active = COALESCE($5, true),
           updated_at = NOW()
         WHERE id = $6 AND store_id = $7 RETURNING *`,
        [table_number.toString().trim(), name || null, capacity || 4, status || 'available', is_active, id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: result.rows[0].id,
            storeId: storeId,
            tableNumber: result.rows[0].table_number,
            name: result.rows[0].name,
            capacity: result.rows[0].capacity,
            status: result.rows[0].status,
            action: 'updated'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json(result.rows[0]);
    } catch (e) {
      console.error('테이블 수정 실패:', e);
      if (e.code === '23505') {
        res.status(400).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      } else if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 스토어 ID입니다' });
      } else {
        res.status(500).json({ error: '테이블 수정 실패' });
      }
    }
  }
);

/**
 * [PATCH] /api/tables/:id
 * 테이블 정보 일부 수정 (멀티테넌트)
 */
router.patch('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    const fields = [];
    const values = [];
    let i = 1;

    // 수정 가능한 필드들 (store_id는 제외)
    const allowedFields = ['table_number', 'name', 'capacity', 'status', 'is_active'];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        // 테이블 번호는 문자열로 변환
        if (key === 'table_number') {
          fields.push(`${key} = $${i}::VARCHAR(10)`);
          values.push(req.body[key].toString().trim());
        } else {
          fields.push(`${key} = $${i}`);
          values.push(req.body[key]);
        }
        i++;
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다' });
    }

    // 입력 검증
    if (req.body.table_number !== undefined) {
      if (!req.body.table_number.toString().trim()) {
        return res.status(400).json({ error: '테이블 번호는 비워둘 수 없습니다' });
      }
      if (req.body.table_number.toString().length > 10) {
        return res.status(400).json({ error: '테이블 번호는 10자 이하여야 합니다' });
      }
    }

    if (req.body.capacity !== undefined) {
      if (req.body.capacity < 1 || req.body.capacity > 20) {
        return res.status(400).json({ error: '수용 인원은 1-20명 사이여야 합니다' });
      }
    }

    if (req.body.status !== undefined) {
      const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
      }
    }
    
    values.push(id, storeId);

    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 테이블 번호가 변경되는 경우 중복 확인
      if (req.body.table_number !== undefined) {
        const existingCheck = await pool.query(
          'SELECT id FROM tables WHERE store_id = $1 AND table_number = $2 AND id != $3 AND is_active = true',
          [storeId, req.body.table_number.toString().trim(), id]
        );

        if (existingCheck.rowCount > 0) {
          return res.status(409).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
        }
      }

      fields.push(`updated_at = NOW()`);
      const result = await pool.query(
        `UPDATE tables SET ${fields.join(', ')} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
        values
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: result.rows[0].id,
            storeId: storeId,
            tableNumber: result.rows[0].table_number,
            name: result.rows[0].name,
            capacity: result.rows[0].capacity,
            status: result.rows[0].status,
            action: 'updated'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json(result.rows[0]);
    } catch (e) {
      console.error('테이블 수정 실패:', e);
      if (e.code === '23505') {
        res.status(400).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      } else if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 스토어 ID입니다' });
      } else {
        res.status(500).json({ error: '테이블 수정 실패' });
      }
    }
  }
);

/**
 * [DELETE] /api/tables/:id
 * 테이블 삭제 (소프트 삭제 - 멀티테넌트)
 */
router.delete('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id, table_number, name FROM tables WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 테이블에 연결된 주문이 있는지 확인
      const orderCheck = await pool.query(
        'SELECT COUNT(*) as order_count FROM orders WHERE table_id = $1 AND status IN (\'pending\', \'preparing\', \'ready\')',
        [id]
      );

      if (parseInt(orderCheck.rows[0].order_count) > 0) {
        return res.status(400).json({ 
          error: '진행 중인 주문이 있는 테이블은 삭제할 수 없습니다',
          order_count: parseInt(orderCheck.rows[0].order_count)
        });
      }

      const result = await pool.query(
        'UPDATE tables SET is_active = false, updated_at = NOW() WHERE id = $1 AND store_id = $2 RETURNING *', 
        [id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: result.rows[0].id,
            storeId: storeId,
            tableNumber: result.rows[0].table_number,
            name: result.rows[0].name,
            action: 'deleted'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json({ 
        success: true, 
        deleted: result.rows[0],
        message: `테이블 "${tableCheck.rows[0].table_number}"이(가) 삭제되었습니다`
      });
    } catch (e) {
      console.error('테이블 삭제 실패:', e);
      res.status(500).json({ error: '테이블 삭제 실패' });
    }
  }
);

/**
 * [GET] /api/tables/store/:storeId
 * 특정 스토어의 테이블 목록 조회 (멀티테넌트)
 */
router.get('/store/:storeId', 
  authenticateToken, 
  async (req, res) => {
    const { storeId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    // req.tenant 설정
    req.tenant = { storeId: parseInt(storeId) };
    
    // 스토어 권한 확인
    if (req.user.is_super_admin) {
      // 슈퍼 관리자는 모든 스토어 접근 가능
    } else {
      // 일반 관리자는 권한 확인
      const permissionResult = await pool.query(
        `SELECT role FROM admin_store_permissions 
         WHERE admin_id = $1 AND store_id = $2`,
        [req.user.id, req.tenant.storeId]
      );

      if (permissionResult.rowCount === 0) {
        return res.status(403).json({ error: '해당 스토어에 대한 권한이 없습니다' });
      }
    }

    try {
      let query = `
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.store_id = $1 AND t.is_active = true
      `;
      let params = [storeId];

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

/**
 * [GET] /api/tables/status/:status
 * 특정 상태의 테이블들 조회 (멀티테넌트)
 */
router.get('/status/:status', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { status } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const storeId = req.tenant?.storeId;
    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          t.id, t.store_id, t.table_number, t.name, t.capacity, 
          t.status, t.is_active, t.created_at, t.updated_at,
          s.name as store_name
        FROM tables t
        JOIN stores s ON t.store_id = s.id
        WHERE t.status = $1 AND t.store_id = $2 AND t.is_active = true
        ORDER BY t.table_number
        LIMIT $3 OFFSET $4
      `, [status, storeId, parseInt(limit), parseInt(offset)]);
      
      res.json(result.rows);
    } catch (e) {
      console.error('상태별 테이블 조회 실패:', e);
      res.status(500).json({ error: '상태별 테이블 조회 실패' });
    }
  }
);

/**
 * [GET] /api/tables/dashboard/stats
 * 테이블 대시보드 통계 (멀티테넌트)
 */
router.get('/dashboard/stats', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const storeId = req.tenant?.storeId;

    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }

    try {
      // 전체 테이블 통계
      const totalStats = await pool.query(`
        SELECT 
          COUNT(*) as total_tables,
          COUNT(CASE WHEN status = 'available' THEN 1 END) as available_tables,
          COUNT(CASE WHEN status = 'occupied' THEN 1 END) as occupied_tables,
          COUNT(CASE WHEN status = 'reserved' THEN 1 END) as reserved_tables,
          COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_tables
        FROM tables 
        WHERE store_id = $1 AND is_active = true
      `, [storeId]);

      // 수용 인원별 통계
      const capacityStats = await pool.query(`
        SELECT 
          capacity,
          COUNT(*) as table_count
        FROM tables 
        WHERE store_id = $1 AND is_active = true
        GROUP BY capacity
        ORDER BY capacity
      `, [storeId]);

      // 최근 생성된 테이블 (최근 30일)
      const recentTables = await pool.query(`
        SELECT 
          id, table_number, name, capacity, status, created_at
        FROM tables 
        WHERE store_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 10
      `, [storeId]);

      // 테이블별 주문 통계
      const tableOrderStats = await pool.query(`
        SELECT 
          t.id,
          t.table_number,
          t.name,
          t.status,
          COUNT(o.id) as order_count,
          COALESCE(SUM(o.total_amount), 0) as total_revenue
        FROM tables t
        LEFT JOIN orders o ON t.id = o.table_id AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'
        WHERE t.store_id = $1 AND t.is_active = true
        GROUP BY t.id, t.table_number, t.name, t.status
        ORDER BY t.table_number
      `, [storeId]);

      res.json({
        total: totalStats.rows[0],
        capacity_stats: capacityStats.rows,
        recent_tables: recentTables.rows,
        table_order_stats: tableOrderStats.rows
      });
    } catch (e) {
      console.error('테이블 통계 조회 실패:', e);
      res.status(500).json({ error: '테이블 통계 조회 실패' });
    }
  }
);

/**
 * [POST] /api/tables/bulk-status
 * 테이블 상태 일괄 변경 (멀티테넌트)
 * Body: { table_ids: [1, 2, 3], status: 'available' }
 */
router.post('/bulk-status', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { table_ids, status } = req.body;
    const storeId = req.tenant?.storeId;

    if (!table_ids || !Array.isArray(table_ids) || table_ids.length === 0) {
      return res.status(400).json({ error: '테이블 ID 배열이 필요합니다' });
    }

    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      const placeholders = table_ids.map((_, index) => `$${index + 1}`).join(',');
      const result = await pool.query(
        `UPDATE tables SET status = $1, updated_at = NOW() 
         WHERE id IN (${placeholders}) AND store_id = $${table_ids.length + 2}
         RETURNING *`,
        [status, ...table_ids, storeId]
      );

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers && result.rows.length > 0) {
          result.rows.forEach(table => {
            const tableData = {
              tableId: table.id,
              storeId: storeId,
              tableNumber: table.table_number,
              name: table.name,
              capacity: table.capacity,
              status: table.status,
              action: 'bulk_updated'
            };

            socketHelpers.notifyTableStatusChange(storeId, tableData);
          });
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json({ 
        success: true, 
        updated_count: result.rowCount,
        updated_tables: result.rows 
      });
    } catch (e) {
      console.error('테이블 상태 일괄 변경 실패:', e);
      res.status(500).json({ error: '테이블 상태 일괄 변경 실패' });
    }
  }
);

/**
 * [POST] /api/tables/duplicate
 * 테이블 복제 (멀티테넌트)
 * Body: { table_id, new_table_number, new_name }
 */
router.post('/duplicate', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { table_id, new_table_number, new_name } = req.body;
    const storeId = req.tenant?.storeId;

    if (!table_id || !new_table_number || !new_table_number.toString().trim()) {
      return res.status(400).json({ error: '테이블 ID와 새 테이블 번호가 필요합니다' });
    }

    // 테이블 번호 길이 검증
    if (new_table_number.toString().length > 10) {
      return res.status(400).json({ error: '테이블 번호는 10자 이하여야 합니다' });
    }

    try {
      // 원본 테이블이 해당 스토어에 속하는지 확인
      const originalTable = await pool.query(
        'SELECT * FROM tables WHERE id = $1 AND store_id = $2 AND is_active = true',
        [table_id, storeId]
      );

      if (originalTable.rowCount === 0) {
        return res.status(404).json({ error: '원본 테이블이 없습니다' });
      }

      // 새 테이블 번호가 이미 존재하는지 확인
      const existingCheck = await pool.query(
        'SELECT id FROM tables WHERE store_id = $1 AND table_number = $2 AND is_active = true',
        [storeId, new_table_number.toString().trim()]
      );

      if (existingCheck.rowCount > 0) {
        return res.status(409).json({ error: '해당 스토어에 이미 등록된 테이블 번호입니다' });
      }

      // 새 테이블 생성
      const newTable = await pool.query(
        `INSERT INTO tables (store_id, table_number, name, capacity, status, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          storeId,
          new_table_number.toString().trim(),
          new_name || originalTable.rows[0].name,
          originalTable.rows[0].capacity,
          'available', // 복제된 테이블은 사용 가능 상태로 시작
          true
        ]
      );

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: newTable.rows[0].id,
            storeId: storeId,
            tableNumber: newTable.rows[0].table_number,
            name: newTable.rows[0].name,
            capacity: newTable.rows[0].capacity,
            status: newTable.rows[0].status,
            action: 'duplicated'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.status(201).json({
        success: true,
        original_table: originalTable.rows[0],
        new_table: newTable.rows[0],
        message: '테이블이 복제되었습니다.'
      });
    } catch (e) {
      console.error('테이블 복제 실패:', e);
      res.status(500).json({ error: '테이블 복제 실패' });
    }
  }
);

/**
 * [GET] /api/tables/public/store/:storeId
 * 공개 테이블 목록 조회 (인증 없이)
 */
router.get('/public/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  const { status } = req.query;
  
  try {
    // 스토어 존재 확인
    const storeCheck = await pool.query(
      'SELECT id, name FROM stores WHERE id = $1 AND is_active = true',
      [storeId]
    );

    if (storeCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
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
    let params = [storeId];

    if (status) {
      query += ' AND t.status = $2';
      params.push(status);
    }

    query += ' ORDER BY t.table_number';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('공개 테이블 조회 실패:', e);
    res.status(500).json({ error: '테이블 조회 실패' });
  }
});

/**
 * [GET] /api/tables/store/:storeId/public
 * 공개 테이블 목록 조회 (인증 없이) - 대체 경로
 */
router.get('/store/:storeId/public', async (req, res) => {
  const { storeId } = req.params;
  const { status } = req.query;
  
  try {
    // 스토어 존재 확인
    const storeCheck = await pool.query(
      'SELECT id, name FROM stores WHERE id = $1 AND is_active = true',
      [storeId]
    );

    if (storeCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
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
    let params = [storeId];

    if (status) {
      query += ' AND t.status = $2';
      params.push(status);
    }

    query += ' ORDER BY t.table_number';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('공개 테이블 조회 실패:', e);
    res.status(500).json({ error: '테이블 조회 실패' });
  }
});

/**
 * [GET] /api/tables/public/:tableId
 * 공개 개별 테이블 정보 조회 (인증 없이)
 */
router.get('/public/:tableId', async (req, res) => {
  const { tableId } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.store_id, t.table_number, t.name, t.capacity, 
        t.status, t.is_active, t.created_at, t.updated_at,
        s.id as store_id, s.name as store_name, s.code as store_code,
        s.address as store_address, s.phone as store_phone
      FROM tables t
      JOIN stores s ON t.store_id = s.id
      WHERE t.id = $1 AND t.is_active = true AND s.is_active = true
    `, [tableId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('공개 테이블 정보 조회 실패:', e);
    res.status(500).json({ error: '테이블 정보 조회 실패' });
  }
});

/**
 * [POST] /api/tables/quick-status
 * 테이블 상태 빠른 변경 (멀티테넌트)
 * Body: { table_id, status }
 */
router.post('/quick-status', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { table_id, status } = req.body;
    const storeId = req.tenant?.storeId;

    if (!table_id || !status) {
      return res.status(400).json({ error: '테이블 ID와 상태가 필요합니다' });
    }

    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      const result = await pool.query(
        'UPDATE tables SET status = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3 RETURNING *',
        [status, table_id, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const tableData = {
            tableId: result.rows[0].id,
            storeId: storeId,
            tableNumber: result.rows[0].table_number,
            name: result.rows[0].name,
            capacity: result.rows[0].capacity,
            status: result.rows[0].status,
            action: 'quick_status_change'
          };

          socketHelpers.notifyTableStatusChange(storeId, tableData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json({
        success: true,
        table: result.rows[0],
        message: `테이블 "${result.rows[0].table_number}" 상태가 "${status}"로 변경되었습니다`
      });
    } catch (e) {
      console.error('테이블 상태 변경 실패:', e);
      res.status(500).json({ error: '테이블 상태 변경 실패' });
    }
  }
);

module.exports = router;
