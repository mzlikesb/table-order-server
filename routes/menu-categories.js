// routes/menu-categories.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

/**
 * [GET] /api/menu-categories
 * 메뉴 카테고리 전체 조회 (스토어별)
 */
router.get('/', async (req, res) => {
  const { store_id } = req.query;
  
  try {
    let query = 'SELECT * FROM menu_categories WHERE is_active = true';
    let params = [];
    
    if (store_id) {
      query += ' AND store_id = $1';
      params.push(store_id);
    }
    
    query += ' ORDER BY sort_order, name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error('메뉴 카테고리 조회 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
  }
});

/**
 * [GET] /api/menu-categories/:id
 * 특정 메뉴 카테고리 상세 조회
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM menu_categories WHERE id=$1 AND is_active=true', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 카테고리가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 카테고리 조회 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 조회 실패' });
  }
});

/**
 * [POST] /api/menu-categories
 * 메뉴 카테고리 추가
 */
router.post('/', async (req, res) => {
  const { store_id, name, sort_order } = req.body;
  
  if (!store_id || !name) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (store_id, name)' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO menu_categories (store_id, name, sort_order)
       VALUES ($1, $2, COALESCE($3, 0)) RETURNING *`,
      [store_id, name, sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 카테고리 추가 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 추가 실패' });
  }
});

/**
 * [PUT] /api/menu-categories/:id
 * 메뉴 카테고리 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, sort_order, is_active } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE menu_categories SET
         name=COALESCE($1, name),
         sort_order=COALESCE($2, sort_order),
         is_active=COALESCE($3, is_active)
      WHERE id=$4 RETURNING *`,
      [name, sort_order, is_active, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 카테고리가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 카테고리 수정 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 수정 실패' });
  }
});

/**
 * [DELETE] /api/menu-categories/:id
 * 메뉴 카테고리 삭제 (실제 삭제 대신 비활성화)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE menu_categories SET is_active=false WHERE id=$1 RETURNING *', 
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 카테고리가 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error('메뉴 카테고리 삭제 실패:', e);
    res.status(500).json({ error: '메뉴 카테고리 삭제 실패' });
  }
});

module.exports = router; 