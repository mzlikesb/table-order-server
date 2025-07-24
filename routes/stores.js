// routes/stores.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

/**
 * [GET] /api/stores
 * 스토어 전체 조회
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stores WHERE is_active = true ORDER BY created_at DESC');
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
    const result = await pool.query('SELECT * FROM stores WHERE id=$1 AND is_active=true', [id]);
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
 * 스토어 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { code, name, address, phone, timezone, is_active } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE stores SET
         code=COALESCE($1, code),
         name=COALESCE($2, name),
         address=COALESCE($3, address),
         phone=COALESCE($4, phone),
         timezone=COALESCE($5, timezone),
         is_active=COALESCE($6, is_active)
      WHERE id=$7 RETURNING *`,
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
 * [DELETE] /api/stores/:id
 * 스토어 삭제 (실제 삭제 대신 비활성화)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE stores SET is_active=false WHERE id=$1 RETURNING *', 
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

module.exports = router; 