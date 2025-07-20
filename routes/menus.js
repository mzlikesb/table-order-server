// routes/menus.js

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
 * [GET] /api/menus
 * 메뉴 전체 조회
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY id');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: '메뉴 조회 실패' });
  }
});

/**
 * [GET] /api/menus/:id
 * 특정 메뉴 상세 조회
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM menus WHERE id=$1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '메뉴 조회 실패' });
  }
});

/**
 * [POST] /api/menus
 * 메뉴 추가
 */
router.post('/', async (req, res) => {
  const { name, price, category, image_url, is_available } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO menus (name, price, category, image_url, is_available)
       VALUES ($1, $2, $3, $4, COALESCE($5, TRUE)) RETURNING *`,
      [name, price, category, image_url, is_available]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '메뉴 추가 실패' });
  }
});

/**
 * [PUT] /api/menus/:id
 * 메뉴 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price, category, image_url, is_available } = req.body;
  try {
    const result = await pool.query(
      `UPDATE menus SET
         name=$1,
         price=$2,
         category=$3,
         image_url=$4,
         is_available=$5
      WHERE id=$6 RETURNING *`,
      [name, price, category, image_url, is_available, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '메뉴 수정 실패' });
  }
});

/**
 * [PATCH] /api/menus/:id
 * 메뉴 일부(주로 is_available 또는 price 등) 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of ['name', 'price', 'category', 'image_url', 'is_available']) {
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
      `UPDATE menus SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: '메뉴 수정 실패' });
  }
});

/**
 * [DELETE] /api/menus/:id
 * 메뉴 삭제
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM menus WHERE id=$1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: '메뉴 삭제 실패' });
  }
});

module.exports = router;
