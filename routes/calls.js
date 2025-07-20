// routes/calls.js

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

/**
 * [GET] /api/calls
 * 호출 전체 목록 조회 (최신순)
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
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
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.id = $1
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '호출 조회 실패' });
  }
});

/**
 * [POST] /api/calls
 * 새 호출 등록 (고객이 직원 호출)
 * Body: { table_id, request_content }
 */
router.post('/', async (req, res) => {
  const { table_id, request_content } = req.body;

  if (!table_id) {
    return res.status(400).json({ error: '테이블 ID가 필요합니다' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO calls (table_id, request_content, status, created_at)
       VALUES ($1, $2, 'waiting', NOW()) RETURNING *`,
      [table_id, request_content || '직원 호출']
    );

    // 테이블 정보와 함께 반환
    const callWithTable = await pool.query(`
      SELECT 
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.id = $1
    `, [result.rows[0].id]);

    // **실시간 호출 알림 발송** - 직원들에게
    const io = req.app.get('io');
    const callData = callWithTable.rows[0];
    
    io.to('staff').emit('new-call', {
      callId: callData.id,
      tableId: callData.table_id,
      tableNumber: callData.table_number,
      requestContent: callData.request_content,
      createdAt: callData.created_at
    });
    
    res.status(201).json(callWithTable.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '호출 등록 실패' });
  }
});

/**
 * [PATCH] /api/calls/:id/status
 * 호출 상태 변경 (waiting -> processing -> completed -> cancelled)
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['waiting', 'processing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }

  try {
    const result = await pool.query(
      `UPDATE calls SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '호출 상태 변경 실패' });
  }
});

/**
 * [PUT] /api/calls/:id
 * 호출 정보 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { table_id, request_content, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE calls SET
         table_id = $1,
         request_content = $2,
         status = $3
       WHERE id = $4 RETURNING *`,
      [table_id, request_content, status || 'waiting', id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '호출 수정 실패' });
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

  for (const key of ['table_id', 'request_content', 'status']) {
    if (req.body[key] !== undefined) {
      fields.push(`${key}=$${i++}`);
      values.push(req.body[key]);
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: '수정할 필드가 없습니다' });
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE calls SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 호출이 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '호출 수정 실패' });
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
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.table_id = $1
      ORDER BY c.created_at DESC
    `, [tableId]);

    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: '테이블별 호출 조회 실패' });
  }
});

/**
 * [GET] /api/calls/status/:status
 * 특정 상태의 호출들 조회
 */
router.get('/status/:status', async (req, res) => {
  const { status } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.status = $1
      ORDER BY c.created_at ASC
    `, [status]);

    res.json(result.rows);
  } catch (e) {
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
        c.id, c.table_id, c.request_content, c.status, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.status IN ('waiting', 'processing')
      ORDER BY c.created_at ASC
    `);

    res.json(result.rows);
  } catch (e) {
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
      `UPDATE calls SET status = 'completed' WHERE id IN (${placeholders}) RETURNING *`,
      call_ids
    );

    res.json({ 
      success: true, 
      completed_count: result.rowCount,
      completed_calls: result.rows 
    });
  } catch (e) {
    res.status(500).json({ error: '일괄 완료 처리 실패' });
  }
});

module.exports = router;
