// routes/calls.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/calls
 * 호출 전체 목록 조회 (멀티테넌트 - 가게별 필터링)
 */
router.get('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    try {
      const { store_id, status, limit = 50 } = req.query;
      const storeId = store_id || req.tenant?.storeId;
      
      if (!storeId) {
        return res.status(400).json({ error: 'store_id가 필요합니다' });
      }

      let query = `
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.store_id = $1
      `;
      let params = [storeId];
      
      if (status) {
        query += ' AND c.status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY c.created_at DESC LIMIT $' + (params.length + 1);
      params.push(parseInt(limit));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('호출 목록 조회 실패:', e);
      res.status(500).json({ error: '호출 목록 조회 실패' });
    }
  }
);

/**
 * [GET] /api/calls/:id
 * 특정 호출 상세 조회 (멀티테넌트 - 가게별 권한 확인)
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
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.id = $1::INTEGER AND c.store_id = $2
      `, [id, storeId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      console.error('호출 조회 실패:', e);
      res.status(500).json({ error: '호출 조회 실패' });
    }
  }
);

/**
 * [POST] /api/calls
 * 새 호출 등록 (고객이 직원 호출)
 * Body: { store_id, table_id, call_type, message }
 */
router.post('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { store_id, table_id, call_type, message } = req.body;
    const storeId = store_id || req.tenant?.storeId;

    if (!storeId || !table_id || !call_type) {
      return res.status(400).json({ error: '스토어 ID, 테이블 ID, 호출 타입이 필요합니다' });
    }

    const validCallTypes = ['service', 'bill', 'help', 'custom'];
    if (!validCallTypes.includes(call_type)) {
      return res.status(400).json({ error: '유효하지 않은 호출 타입입니다' });
    }

    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [table_id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      const result = await pool.query(
        `INSERT INTO calls (store_id, table_id, call_type, message, status, created_at)
         VALUES ($1::INTEGER, $2::INTEGER, $3::VARCHAR(20), $4, 'pending', NOW()) RETURNING *`,
        [storeId, table_id, call_type, message || null]
      );

      // 테이블 정보와 함께 반환
      const callWithTable = await pool.query(`
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        WHERE c.id = $1::INTEGER
      `, [result.rows[0].id]);

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const callData = callWithTable.rows[0];
          socketHelpers.notifyNewCall(storeId, {
            callId: callData.id,
            storeId: callData.store_id,
            tableId: callData.table_id,
            tableNumber: callData.table_number,
            callType: callData.call_type,
            message: callData.message,
            createdAt: callData.created_at
          });
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
        // Socket.IO 오류는 호출 등록을 막지 않음
      }
      
      res.status(201).json(callWithTable.rows[0]);
    } catch (e) {
      console.error('호출 등록 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 스토어 ID 또는 테이블 ID입니다' });
      } else {
        res.status(500).json({ error: '호출 등록 실패' });
      }
    }
  }
);

/**
 * [PATCH] /api/calls/:id/status
 * 호출 상태 변경 (pending -> responded -> completed)
 */
router.patch('/:id/status', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const { status, responded_by } = req.body;
    const storeId = req.tenant?.storeId;
    const adminId = req.user?.id;

    const validStatuses = ['pending', 'responded', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      // 호출이 해당 스토어에 속하는지 확인
      const callCheck = await pool.query(
        'SELECT id, store_id FROM calls WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (callCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      let updateQuery, updateParams;
      
      if (status === 'responded') {
        updateQuery = `
          UPDATE calls SET 
            status = $1::VARCHAR(20), 
            responded_by = $2::INTEGER, 
            responded_at = NOW()
          WHERE id = $3::INTEGER AND store_id = $4
          RETURNING *
        `;
        updateParams = [status, responded_by || adminId, id, storeId];
      } else if (status === 'completed') {
        updateQuery = `
          UPDATE calls SET 
            status = $1::VARCHAR(20), 
            completed_at = NOW()
          WHERE id = $2::INTEGER AND store_id = $3
          RETURNING *
        `;
        updateParams = [status, id, storeId];
      } else {
        updateQuery = `
          UPDATE calls SET 
            status = $1::VARCHAR(20) 
          WHERE id = $2::INTEGER AND store_id = $3
          RETURNING *
        `;
        updateParams = [status, id, storeId];
      }

      const result = await pool.query(updateQuery, updateParams);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      // 업데이트된 호출 정보와 함께 테이블, 스토어 정보 조회
      const callWithDetails = await pool.query(`
        SELECT 
          c.*, t.table_number, s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        LEFT JOIN tables t ON c.table_id = t.id
        LEFT JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.id = $1::INTEGER AND c.store_id = $2
      `, [id, storeId]);

      const updatedCall = callWithDetails.rows[0];

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          socketHelpers.notifyCallStatusChange(storeId, {
            callId: id,
            storeId: updatedCall.store_id,
            tableId: updatedCall.table_id,
            tableNumber: updatedCall.table_number,
            newStatus: status,
            respondedBy: responded_by || adminId,
            updatedAt: new Date()
          });
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
        // Socket.IO 오류는 호출 상태 변경을 막지 않음
      }

      res.json(updatedCall);
    } catch (e) {
      console.error('호출 상태 변경 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 관리자 ID입니다' });
      } else {
        res.status(500).json({ error: '호출 상태 변경 실패' });
      }
    }
  }
);

/**
 * [PUT] /api/calls/:id
 * 호출 정보 전체 수정 (멀티테넌트)
 */
router.put('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { table_id, call_type, message, status, responded_by } = req.body;
    const storeId = req.tenant?.storeId;

    if (!table_id || !call_type) {
      return res.status(400).json({ error: '테이블 ID, 호출 타입은 필수입니다' });
    }

    const validCallTypes = ['service', 'bill', 'help', 'custom'];
    if (!validCallTypes.includes(call_type)) {
      return res.status(400).json({ error: '유효하지 않은 호출 타입입니다' });
    }

    try {
      // 호출이 해당 스토어에 속하는지 확인
      const callCheck = await pool.query(
        'SELECT id FROM calls WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (callCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [table_id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      const result = await pool.query(
        `UPDATE calls SET
           table_id = $1,
           call_type = $2,
           message = $3,
           status = COALESCE($4, 'pending'),
           responded_by = $5
         WHERE id = $6 AND store_id = $7 RETURNING *`,
        [table_id, call_type, message, status, responded_by, id, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      res.json(result.rows[0]);
    } catch (e) {
      console.error('호출 수정 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 테이블 ID 또는 관리자 ID입니다' });
      } else {
        res.status(500).json({ error: '호출 수정 실패' });
      }
    }
  }
);

/**
 * [PATCH] /api/calls/:id
 * 호출 정보 일부 수정 (멀티테넌트)
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

    // 수정 가능한 필드들 (store_id 제외)
    const allowedFields = ['table_id', 'call_type', 'message', 'status', 'responded_by'];
    
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: '수정할 필드가 없습니다' });
    }

    // 호출이 해당 스토어에 속하는지 확인
    const callCheck = await pool.query(
      'SELECT id FROM calls WHERE id = $1 AND store_id = $2',
      [id, storeId]
    );

    if (callCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    values.push(id, storeId);

    try {
      const result = await pool.query(
        `UPDATE calls SET ${fields.join(', ')} WHERE id = $${i} AND store_id = $${i + 1} RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      res.json(result.rows[0]);
    } catch (e) {
      console.error('호출 수정 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 테이블 ID 또는 관리자 ID입니다' });
      } else {
        res.status(500).json({ error: '호출 수정 실패' });
      }
    }
  }
);

/**
 * [DELETE] /api/calls/:id
 * 호출 삭제 (멀티테넌트)
 */
router.delete('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      const result = await pool.query(
        'DELETE FROM calls WHERE id = $1 AND store_id = $2 RETURNING *', 
        [id, storeId]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }
      
      res.json({ success: true, deleted: result.rows[0] });
    } catch (e) {
      console.error('호출 삭제 실패:', e);
      res.status(500).json({ error: '호출 삭제 실패' });
    }
  }
);

/**
 * [GET] /api/calls/table/:tableId
 * 특정 테이블의 호출 목록 조회 (멀티테넌트)
 */
router.get('/table/:tableId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { tableId } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [tableId, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      const result = await pool.query(`
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.table_id = $1 AND c.store_id = $2
        ORDER BY c.created_at DESC
      `, [tableId, storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('테이블별 호출 조회 실패:', e);
      res.status(500).json({ error: '테이블별 호출 조회 실패' });
    }
  }
);

/**
 * [GET] /api/calls/store/:storeId
 * 특정 스토어의 호출 목록 조회 (멀티테넌트 - 권한 확인)
 */
router.get('/store/:storeId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { storeId } = req.params;
    const tenantStoreId = req.tenant?.storeId;
    
    // 요청한 스토어와 테넌트 스토어가 일치하는지 확인
    if (storeId != tenantStoreId) {
      return res.status(403).json({ error: '다른 가게의 호출을 조회할 권한이 없습니다' });
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.store_id = $1
        ORDER BY c.created_at DESC
      `, [storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('스토어별 호출 조회 실패:', e);
      res.status(500).json({ error: '스토어별 호출 조회 실패' });
    }
  }
);

/**
 * [GET] /api/calls/status/:status
 * 특정 상태의 호출들 조회 (멀티테넌트)
 */
router.get('/status/:status', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { status } = req.params;
    const storeId = req.tenant?.storeId;
    const validStatuses = ['pending', 'responded', 'completed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }
    
    try {
      const result = await pool.query(`
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.status = $1 AND c.store_id = $2
        ORDER BY c.created_at ASC
      `, [status, storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('상태별 호출 조회 실패:', e);
      res.status(500).json({ error: '상태별 호출 조회 실패' });
    }
  }
);

/**
 * [GET] /api/calls/pending
 * 대기 중인 호출들만 조회 (직원용 대시보드 - 멀티테넌트)
 */
router.get('/pending', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    try {
      const storeId = req.tenant?.storeId;
      
      if (!storeId) {
        return res.status(400).json({ error: 'store_id가 필요합니다' });
      }

      const result = await pool.query(`
        SELECT 
          c.id, c.store_id, c.table_id, c.call_type, c.message, c.status,
          c.responded_by, c.responded_at, c.completed_at, c.created_at, c.updated_at,
          t.table_number,
          s.name as store_name,
          a.username as responded_by_name
        FROM calls c
        JOIN tables t ON c.table_id = t.id
        JOIN stores s ON c.store_id = s.id
        LEFT JOIN admins a ON c.responded_by = a.id
        WHERE c.store_id = $1 AND c.status IN ('pending', 'responded')
        ORDER BY c.created_at ASC
      `, [storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('대기 호출 조회 실패:', e);
      res.status(500).json({ error: '대기 호출 조회 실패' });
    }
  }
);

/**
 * [POST] /api/calls/bulk-complete
 * 여러 호출을 한 번에 완료 처리 (멀티테넌트)
 * Body: { call_ids: [1, 2, 3] }
 */
router.post('/bulk-complete', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { call_ids } = req.body;
    const storeId = req.tenant?.storeId;

    if (!call_ids || !Array.isArray(call_ids) || call_ids.length === 0) {
      return res.status(400).json({ error: '호출 ID 배열이 필요합니다' });
    }

    try {
      // 호출들이 해당 스토어에 속하는지 확인
      const placeholders = call_ids.map((_, index) => `$${index + 1}`).join(',');
      const checkQuery = `SELECT id FROM calls WHERE id IN (${placeholders}) AND store_id = $${call_ids.length + 1}`;
      const checkResult = await pool.query(checkQuery, [...call_ids, storeId]);

      if (checkResult.rowCount !== call_ids.length) {
        return res.status(400).json({ error: '일부 호출이 해당 가게에 속하지 않습니다' });
      }

      const updateQuery = `UPDATE calls SET status = 'completed', completed_at = NOW() WHERE id IN (${placeholders}) AND store_id = $${call_ids.length + 1} RETURNING *`;
      const result = await pool.query(updateQuery, [...call_ids, storeId]);

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          result.rows.forEach(call => {
            socketHelpers.notifyCallStatusChange(storeId, {
              callId: call.id,
              storeId: call.store_id,
              tableId: call.table_id,
              newStatus: 'completed',
              updatedAt: new Date()
            });
          });
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json({ 
        success: true, 
        completed_count: result.rowCount,
        completed_calls: result.rows 
      });
    } catch (e) {
      console.error('일괄 완료 처리 실패:', e);
      res.status(500).json({ error: '일괄 완료 처리 실패' });
    }
  }
);

/**
 * [GET] /api/calls/dashboard/stats
 * 호출 대시보드 통계 (멀티테넌트)
 */
router.get('/dashboard/stats', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const storeId = req.tenant?.storeId;
    
    try {
      // 오늘의 호출 통계
      const todayStats = await pool.query(`
        SELECT 
          COUNT(*) as total_calls,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_calls,
          COUNT(CASE WHEN status = 'responded' THEN 1 END) as responded_calls,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
          AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/60) as avg_response_time_minutes
        FROM calls 
        WHERE store_id = $1 
        AND DATE(created_at) = CURRENT_DATE
      `, [storeId]);

      // 이번 주 호출 통계
      const weekStats = await pool.query(`
        SELECT 
          COUNT(*) as total_calls,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_completion_time_minutes
        FROM calls 
        WHERE store_id = $1 
        AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
      `, [storeId]);

      // 호출 타입별 통계
      const callTypeStats = await pool.query(`
        SELECT 
          call_type,
          COUNT(*) as count
        FROM calls 
        WHERE store_id = $1 
        AND DATE(created_at) = CURRENT_DATE
        GROUP BY call_type
        ORDER BY count DESC
      `, [storeId]);

      res.json({
        today: todayStats.rows[0],
        this_week: weekStats.rows[0],
        call_types: callTypeStats.rows
      });
    } catch (e) {
      console.error('호출 통계 조회 실패:', e);
      res.status(500).json({ error: '호출 통계 조회 실패' });
    }
  }
);

/**
 * [POST] /api/calls/quick-respond
 * 빠른 응답 처리 (멀티테넌트)
 * Body: { call_id, response_type }
 */
router.post('/quick-respond', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { call_id, response_type } = req.body;
    const storeId = req.tenant?.storeId;
    const adminId = req.user?.id;

    if (!call_id || !response_type) {
      return res.status(400).json({ error: '호출 ID와 응답 타입이 필요합니다' });
    }

    const validResponseTypes = ['acknowledged', 'in_progress', 'completed'];
    if (!validResponseTypes.includes(response_type)) {
      return res.status(400).json({ error: '유효하지 않은 응답 타입입니다' });
    }

    try {
      // 호출이 해당 스토어에 속하는지 확인
      const callCheck = await pool.query(
        'SELECT id, status FROM calls WHERE id = $1 AND store_id = $2',
        [call_id, storeId]
      );

      if (callCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 호출이 없습니다' });
      }

      let newStatus;
      switch (response_type) {
        case 'acknowledged':
          newStatus = 'responded';
          break;
        case 'in_progress':
          newStatus = 'responded';
          break;
        case 'completed':
          newStatus = 'completed';
          break;
      }

      const result = await pool.query(`
        UPDATE calls SET 
          status = $1,
          responded_by = $2,
          responded_at = CASE WHEN $1 = 'responded' THEN NOW() ELSE responded_at END,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $3 AND store_id = $4 
        RETURNING *
      `, [newStatus, adminId, call_id, storeId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '호출 업데이트 실패' });
      }

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          socketHelpers.notifyCallStatusChange(storeId, {
            callId: call_id,
            storeId: storeId,
            newStatus: newStatus,
            respondedBy: adminId,
            responseType: response_type,
            updatedAt: new Date()
          });
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.json({
        success: true,
        call: result.rows[0],
        response_type: response_type
      });
    } catch (e) {
      console.error('빠른 응답 처리 실패:', e);
      res.status(500).json({ error: '빠른 응답 처리 실패' });
    }
  }
);

module.exports = router;
