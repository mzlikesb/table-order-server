// routes/tables.js

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
 * [GET] /api/tables
 * 테이블 전체 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.store_id, t.table_number, t.name, t.capacity, 
        t.status, t.is_active, t.created_at, t.updated_at,
        s.name as store_name
      FROM tables t
      JOIN stores s ON t.store_id = s.id
      WHERE t.is_active = true
      ORDER BY t.store_id, t.table_number
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('테이블 목록 조회 실패:', e);
    res.status(500).json({ error: '테이블 목록 조회 실패' });
  }
});

/**
 * [GET] /api/tables/:id
 * 특정 테이블 정보 조회
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.store_id, t.table_number, t.name, t.capacity, 
        t.status, t.is_active, t.created_at, t.updated_at,
        s.name as store_name
      FROM tables t
      JOIN stores s ON t.store_id = s.id
      WHERE t.id = $1 AND t.is_active = true
    `, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('테이블 조회 실패:', e);
    res.status(500).json({ error: '테이블 조회 실패' });
  }
});

/**
 * [POST] /api/tables
 * 새 테이블 등록
 */
router.post('/', async (req, res) => {
  const { store_id, table_number, name, capacity, status } = req.body;
  
  if (!store_id || !table_number) {
    return res.status(400).json({ error: '스토어 ID와 테이블 번호는 필수입니다' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tables (store_id, table_number, name, capacity, status)
       VALUES ($1, $2, $3, COALESCE($4, 4), COALESCE($5, 'available')) RETURNING *`,
      [store_id, table_number, name, capacity, status]
    );
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
});

/**
 * [PUT] /api/tables/:id
 * 테이블 정보 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { store_id, table_number, name, capacity, status, is_active } = req.body;
  
  if (!store_id || !table_number) {
    return res.status(400).json({ error: '스토어 ID와 테이블 번호는 필수입니다' });
  }

  try {
    const result = await pool.query(
      `UPDATE tables SET
         store_id = $1,
         table_number = $2,
         name = $3,
         capacity = COALESCE($4, 4),
         status = COALESCE($5, 'available'),
         is_active = COALESCE($6, true)
       WHERE id = $7 RETURNING *`,
      [store_id, table_number, name, capacity, status, is_active, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
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
});

/**
 * [PATCH] /api/tables/:id
 * 테이블 정보 일부 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let i = 1;

  // 수정 가능한 필드들
  const allowedFields = ['store_id', 'table_number', 'name', 'capacity', 'status', 'is_active'];
  
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
      `UPDATE tables SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
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
});

/**
 * [DELETE] /api/tables/:id
 * 테이블 삭제 (소프트 삭제 - is_active = false)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE tables SET is_active = false WHERE id = $1 RETURNING *', 
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error('테이블 삭제 실패:', e);
    res.status(500).json({ error: '테이블 삭제 실패' });
  }
});

/**
 * [GET] /api/tables/store/:storeId
 * 특정 스토어의 테이블 목록 조회
 */
router.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.store_id, t.table_number, t.name, t.capacity, 
        t.status, t.is_active, t.created_at, t.updated_at,
        s.name as store_name
      FROM tables t
      JOIN stores s ON t.store_id = s.id
      WHERE t.store_id = $1 AND t.is_active = true
      ORDER BY t.table_number
    `, [storeId]);
    
    res.json(result.rows);
  } catch (e) {
    console.error('스토어별 테이블 조회 실패:', e);
    res.status(500).json({ error: '스토어별 테이블 조회 실패' });
  }
});

/**
 * [GET] /api/tables/status/:status
 * 특정 상태의 테이블들 조회
 */
router.get('/status/:status', async (req, res) => {
  const { status } = req.params;
  const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.store_id, t.table_number, t.name, t.capacity, 
        t.status, t.is_active, t.created_at, t.updated_at,
        s.name as store_name
      FROM tables t
      JOIN stores s ON t.store_id = s.id
      WHERE t.status = $1 AND t.is_active = true
      ORDER BY t.store_id, t.table_number
    `, [status]);
    
    res.json(result.rows);
  } catch (e) {
    console.error('상태별 테이블 조회 실패:', e);
    res.status(500).json({ error: '상태별 테이블 조회 실패' });
  }
});

module.exports = router;
