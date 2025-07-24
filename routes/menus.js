// routes/menus.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

/**
 * [GET] /api/menus
 * 메뉴 전체 조회 (스토어별)
 */
router.get('/', async (req, res) => {
  const { store_id } = req.query;
  
  try {
    let query = `
      SELECT m.*, mc.name as category_name 
      FROM menus m 
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      WHERE m.is_available = true
    `;
    let params = [];
    
    if (store_id) {
      query += ' AND m.store_id = $1';
      params.push(store_id);
    }
    
    query += ' ORDER BY mc.sort_order, m.sort_order, m.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('메뉴 조회 실패:', e);
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
  const { store_id, category_id, name, description, price, image_url, is_available, sort_order } = req.body;
  
  if (!store_id || !name || !price) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (store_id, name, price)' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO menus (store_id, category_id, name, description, price, image_url, is_available, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), COALESCE($8, 0)) RETURNING *`,
      [store_id, category_id, name, description, price, image_url, is_available, sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 추가 실패:', e);
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
