// routes/calls.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

/**
 * [GET] /api/calls
 * 호출 전체 목록 조회 (최신순)
 */
router.get('/', async (req, res) => {
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
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('호출 목록 조회 실패:', e);
    res.status(500).json({ error: '호출 목록 조회 실패' });
  }
});

/**
 * [GET] /api/calls/:id
 * 특정 호출 상세 조회
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
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
      WHERE c.id = $1::INTEGER
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('호출 조회 실패:', e);
    res.status(500).json({ error: '호출 조회 실패' });
  }
});

/**
 * [POST] /api/calls
 * 새 호출 등록 (고객이 직원 호출)
 * Body: { store_id, table_id, call_type, message }
 */
router.post('/', async (req, res) => {
  const { store_id, table_id, call_type, message } = req.body;

  if (!store_id || !table_id || !call_type) {
    return res.status(400).json({ error: '스토어 ID, 테이블 ID, 호출 타입이 필요합니다' });
  }

  const validCallTypes = ['service', 'bill', 'help', 'custom'];
  if (!validCallTypes.includes(call_type)) {
    return res.status(400).json({ error: '유효하지 않은 호출 타입입니다' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO calls (store_id, table_id, call_type, message, status, created_at)
       VALUES ($1::INTEGER, $2::INTEGER, $3::VARCHAR(20), $4, 'pending', NOW()) RETURNING *`,
      [store_id, table_id, call_type, message || null]
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

    // **실시간 호출 알림 발송** - 직원들에게 (Socket.IO가 설정된 경우에만)
    try {
      const io = req.app.get('io');
      if (io) {
        const callData = callWithTable.rows[0];
        io.to('staff').emit('new-call', {
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
});

/**
 * [PATCH] /api/calls/:id/status
 * 호출 상태 변경 (pending -> responded -> completed)
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, responded_by } = req.body;

  const validStatuses = ['pending', 'responded', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }

  try {
    let updateQuery, updateParams;
    
    if (status === 'responded') {
      updateQuery = `
        UPDATE calls SET 
          status = $1::VARCHAR(20), 
          responded_by = $2::INTEGER, 
          responded_at = NOW()
        WHERE id = $3::INTEGER 
        RETURNING *
      `;
      updateParams = [status, responded_by, id];
    } else if (status === 'completed') {
      updateQuery = `
        UPDATE calls SET 
          status = $1::VARCHAR(20), 
          completed_at = NOW()
        WHERE id = $2::INTEGER 
        RETURNING *
      `;
      updateParams = [status, id];
    } else {
      updateQuery = `
        UPDATE calls SET 
          status = $1::VARCHAR(20) 
        WHERE id = $2::INTEGER 
        RETURNING *
      `;
      updateParams = [status, id];
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
      WHERE c.id = $1::INTEGER
    `, [id]);

    const updatedCall = callWithDetails.rows[0];

    // **실시간 알림 발송** (Socket.IO가 설정된 경우에만)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('staff').emit('call-status-changed', {
          callId: id,
          storeId: updatedCall.store_id,
          tableId: updatedCall.table_id,
          tableNumber: updatedCall.table_number,
          newStatus: status,
          respondedBy: responded_by,
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
});

/**
 * [PUT] /api/calls/:id
 * 호출 정보 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { store_id, table_id, call_type, message, status, responded_by } = req.body;

  if (!store_id || !table_id || !call_type) {
    return res.status(400).json({ error: '스토어 ID, 테이블 ID, 호출 타입은 필수입니다' });
  }

  const validCallTypes = ['service', 'bill', 'help', 'custom'];
  if (!validCallTypes.includes(call_type)) {
    return res.status(400).json({ error: '유효하지 않은 호출 타입입니다' });
  }

  try {
    const result = await pool.query(
      `UPDATE calls SET
         store_id = $1,
         table_id = $2,
         call_type = $3,
         message = $4,
         status = COALESCE($5, 'pending'),
         responded_by = $6
       WHERE id = $7 RETURNING *`,
      [store_id, table_id, call_type, message, status, responded_by, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('호출 수정 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID, 테이블 ID 또는 관리자 ID입니다' });
    } else {
      res.status(500).json({ error: '호출 수정 실패' });
    }
  }
});

/**
 * [PATCH] /api/calls/:id
 * 호출 정보 일부 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let i = 1;

  // 수정 가능한 필드들
  const allowedFields = ['store_id', 'table_id', 'call_type', 'message', 'status', 'responded_by'];
  
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(req.body[key]);
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: '수정할 필드가 없습니다' });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE calls SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error('호출 수정 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID, 테이블 ID 또는 관리자 ID입니다' });
    } else {
      res.status(500).json({ error: '호출 수정 실패' });
    }
  }
});

/**
 * [DELETE] /api/calls/:id
 * 호출 삭제
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM calls WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error('호출 삭제 실패:', e);
    res.status(500).json({ error: '호출 삭제 실패' });
  }
});

/**
 * [GET] /api/calls/table/:tableId
 * 특정 테이블의 호출 목록 조회
 */
router.get('/table/:tableId', async (req, res) => {
  const { tableId } = req.params;
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
      WHERE c.table_id = $1
      ORDER BY c.created_at DESC
    `, [tableId]);

    res.json(result.rows);
  } catch (e) {
    console.error('테이블별 호출 조회 실패:', e);
    res.status(500).json({ error: '테이블별 호출 조회 실패' });
  }
});

/**
 * [GET] /api/calls/store/:storeId
 * 특정 스토어의 호출 목록 조회
 */
router.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
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
});

/**
 * [GET] /api/calls/status/:status
 * 특정 상태의 호출들 조회
 */
router.get('/status/:status', async (req, res) => {
  const { status } = req.params;
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
      WHERE c.status = $1
      ORDER BY c.created_at ASC
    `, [status]);

    res.json(result.rows);
  } catch (e) {
    console.error('상태별 호출 조회 실패:', e);
    res.status(500).json({ error: '상태별 호출 조회 실패' });
  }
});

/**
 * [GET] /api/calls/pending
 * 대기 중인 호출들만 조회 (직원용 대시보드)
 */
router.get('/pending', async (req, res) => {
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
      WHERE c.status IN ('pending', 'responded')
      ORDER BY c.created_at ASC
    `);

    res.json(result.rows);
  } catch (e) {
    console.error('대기 호출 조회 실패:', e);
    res.status(500).json({ error: '대기 호출 조회 실패' });
  }
});

/**
 * [POST] /api/calls/bulk-complete
 * 여러 호출을 한 번에 완료 처리
 * Body: { call_ids: [1, 2, 3] }
 */
router.post('/bulk-complete', async (req, res) => {
  const { call_ids } = req.body;

  if (!call_ids || !Array.isArray(call_ids) || call_ids.length === 0) {
    return res.status(400).json({ error: '호출 ID 배열이 필요합니다' });
  }

  try {
    const placeholders = call_ids.map((_, index) => `$${index + 1}`).join(',');
    const result = await pool.query(
      `UPDATE calls SET status = 'completed', completed_at = NOW() WHERE id IN (${placeholders}) RETURNING *`,
      call_ids
    );

    res.json({ 
      success: true, 
      completed_count: result.rowCount,
      completed_calls: result.rows 
    });
  } catch (e) {
    console.error('일괄 완료 처리 실패:', e);
    res.status(500).json({ error: '일괄 완료 처리 실패' });
  }
});

module.exports = router;
