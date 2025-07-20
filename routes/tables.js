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
    const result = await pool.query('SELECT * FROM tables ORDER BY id');
    res.json(result.rows);
  } catch (e) {
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
    const result = await pool.query('SELECT * FROM tables WHERE id=$1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '테이블 조회 실패' });
  }
});

/**
 * [POST] /api/tables
 * 새 테이블 등록
 */
router.post('/', async (req, res) => {
  const { table_number, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO tables (table_number, status)
       VALUES ($1, COALESCE($2, 'empty')) RETURNING *`,
      [table_number, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      res.status(400).json({ error: '이미 등록된 테이블 번호입니다' });
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
  const { table_number, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tables SET
         table_number=$1,
         status=$2
       WHERE id=$3 RETURNING *`,
      [table_number, status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '테이블 수정 실패' });
  }
});

/**
 * [PATCH] /api/tables/:id
 * 테이블 정보 일부(주로 status)만 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of ['table_number', 'status']) {
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
      `UPDATE tables SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '테이블 수정 실패' });
  }
});

/**
 * [DELETE] /api/tables/:id
 * 테이블 삭제
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM tables WHERE id=$1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '테이블 삭제 실패' });
  }
});

module.exports = router;
