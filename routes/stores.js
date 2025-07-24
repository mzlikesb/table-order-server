// routes/stores.js

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
 * [GET] /api/stores
 * 스토어 전체 조회
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, code, name, address, phone, timezone, is_active, 
        created_at, updated_at
      FROM stores 
      WHERE is_active = true 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('스토어 조회 실패:', e);
    res.status(500).json({ error: '스토어 조회 실패' });
  }
});

/**
 * [GET] /api/stores/:id
 * 특정 스토어 상세 조회
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        id, code, name, address, phone, timezone, is_active, 
        created_at, updated_at
      FROM stores 
      WHERE id = $1 AND is_active = true
    `, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('스토어 조회 실패:', e);
    res.status(500).json({ error: '스토어 조회 실패' });
  }
});

/**
 * [POST] /api/stores
 * 스토어 추가
 */
router.post('/', async (req, res) => {
  const { code, name, address, phone, timezone } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (code, name)' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO stores (code, name, address, phone, timezone)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'Asia/Seoul')) RETURNING *`,
      [code, name, address, phone, timezone]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('스토어 추가 실패:', e);
    if (e.code === '23505') { // unique_violation
      return res.status(400).json({ error: '이미 존재하는 스토어 코드입니다' });
    }
    res.status(500).json({ error: '스토어 추가 실패' });
  }
});

/**
 * [PUT] /api/stores/:id
 * 스토어 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { code, name, address, phone, timezone, is_active } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (code, name)' });
  }
  
  try {
    const result = await pool.query(
      `UPDATE stores SET
         code = $1,
         name = $2,
         address = $3,
         phone = $4,
         timezone = COALESCE($5, 'Asia/Seoul'),
         is_active = COALESCE($6, true)
       WHERE id = $7 RETURNING *`,
      [code, name, address, phone, timezone, is_active, id]
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
});

/**
 * [PATCH] /api/stores/:id
 * 스토어 일부 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let i = 1;

  // 수정 가능한 필드들
  const allowedFields = ['code', 'name', 'address', 'phone', 'timezone', 'is_active'];
  
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
});

/**
 * [DELETE] /api/stores/:id
 * 스토어 삭제 (실제 삭제 대신 비활성화)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE stores SET is_active = false WHERE id = $1 RETURNING *', 
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error('스토어 삭제 실패:', e);
    res.status(500).json({ error: '스토어 삭제 실패' });
  }
});

/**
 * [GET] /api/stores/code/:code
 * 스토어 코드로 조회
 */
router.get('/code/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        id, code, name, address, phone, timezone, is_active, 
        created_at, updated_at
      FROM stores 
      WHERE code = $1 AND is_active = true
    `, [code]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('스토어 코드 조회 실패:', e);
    res.status(500).json({ error: '스토어 코드 조회 실패' });
  }
});

module.exports = router; 