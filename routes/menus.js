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
 * 메뉴 전체 조회 (스토어별)
 */
router.get('/', async (req, res) => {
  const { store_id } = req.query;
  
  try {
    let query = `
      SELECT 
        m.id, m.store_id, m.category_id, m.name, m.description, 
        m.price, m.image_url, m.is_available, m.sort_order, 
        m.created_at, m.updated_at,
        mc.name as category_name,
        s.name as store_name
      FROM menus m 
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      JOIN stores s ON m.store_id = s.id
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
    const result = await pool.query(`
      SELECT 
        m.id, m.store_id, m.category_id, m.name, m.description, 
        m.price, m.image_url, m.is_available, m.sort_order, 
        m.created_at, m.updated_at,
        mc.name as category_name,
        s.name as store_name
      FROM menus m
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      JOIN stores s ON m.store_id = s.id
      WHERE m.id = $1
    `, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 조회 실패:', e);
    res.status(500).json({ error: '메뉴 조회 실패' });
  }
});

/**
 * [POST] /api/menus
 * 메뉴 추가
 */
router.post('/', async (req, res) => {
  const { store_id, category_id, category_name, name, description, price, image_url, is_available, sort_order } = req.body;
  
  if (!store_id || !name || !price) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (store_id, name, price)' });
  }
  
  // price가 문자열로 전달된 경우 숫자로 변환
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'price는 유효한 숫자여야 합니다' });
  }
  
  // category_id가 문자열로 전달된 경우 정수로 변환
  let parsedCategoryId = null;
  if (category_id !== undefined && category_id !== null) {
    parsedCategoryId = parseInt(category_id, 10);
    if (isNaN(parsedCategoryId)) {
      return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
    }
  }
  
  try {
    // category_id가 없고 category_name이 있는 경우, 카테고리를 자동으로 생성
    if (!parsedCategoryId && category_name) {
      // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
      const existingCategory = await pool.query(
        'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
        [store_id, category_name]
      );
      
      if (existingCategory.rowCount > 0) {
        parsedCategoryId = existingCategory.rows[0].id;
      } else {
        // 새로운 카테고리 생성
        const newCategory = await pool.query(
          'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
          [store_id, category_name]
        );
        parsedCategoryId = newCategory.rows[0].id;
      }
    }
    
    const result = await pool.query(
      `INSERT INTO menus (store_id, category_id, name, description, price, image_url, is_available, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), COALESCE($8, 0)) RETURNING *`,
      [store_id, parsedCategoryId, name, description, parsedPrice, image_url, is_available, sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 추가 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID 또는 카테고리 ID입니다' });
    } else {
      res.status(500).json({ error: '메뉴 추가 실패' });
    }
  }
});

/**
 * [PUT] /api/menus/:id
 * 메뉴 전체 수정
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { store_id, category_id, category_name, name, description, price, image_url, is_available, sort_order } = req.body;
  
  if (!store_id || !name || !price) {
    return res.status(400).json({ error: '필수 필드가 누락되었습니다 (store_id, name, price)' });
  }
  
  // price가 문자열로 전달된 경우 숫자로 변환
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'price는 유효한 숫자여야 합니다' });
  }
  
  // category_id가 문자열로 전달된 경우 정수로 변환
  let parsedCategoryId = null;
  if (category_id !== undefined && category_id !== null) {
    parsedCategoryId = parseInt(category_id, 10);
    if (isNaN(parsedCategoryId)) {
      return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
    }
  }
  
  try {
    // category_id가 없고 category_name이 있는 경우, 카테고리를 자동으로 생성
    if (!parsedCategoryId && category_name) {
      // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
      const existingCategory = await pool.query(
        'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
        [store_id, category_name]
      );
      
      if (existingCategory.rowCount > 0) {
        parsedCategoryId = existingCategory.rows[0].id;
      } else {
        // 새로운 카테고리 생성
        const newCategory = await pool.query(
          'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
          [store_id, category_name]
        );
        parsedCategoryId = newCategory.rows[0].id;
      }
    }
    
    const result = await pool.query(
      `UPDATE menus SET
         store_id = $1,
         category_id = $2,
         name = $3,
         description = $4,
         price = $5,
         image_url = $6,
         is_available = COALESCE($7, TRUE),
         sort_order = COALESCE($8, 0)
       WHERE id = $9 RETURNING *`,
      [store_id, parsedCategoryId, name, description, parsedPrice, image_url, is_available, sort_order, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 수정 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID 또는 카테고리 ID입니다' });
    } else {
      res.status(500).json({ error: '메뉴 수정 실패' });
    }
  }
});

/**
 * [PATCH] /api/menus/:id
 * 메뉴 일부 수정
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { category_name } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

  // 수정 가능한 필드들
  const allowedFields = ['store_id', 'category_id', 'name', 'description', 'price', 'image_url', 'is_available', 'sort_order'];
  
  for (const key of allowedFields) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      
      // category_id가 문자열로 전달된 경우 정수로 변환
      if (key === 'category_id') {
        const parsedCategoryId = parseInt(req.body[key], 10);
        if (isNaN(parsedCategoryId)) {
          return res.status(400).json({ error: 'category_id는 유효한 숫자여야 합니다' });
        }
        values.push(parsedCategoryId);
      } 
      // price가 문자열로 전달된 경우 숫자로 변환
      else if (key === 'price') {
        const parsedPrice = parseFloat(req.body[key]);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ error: 'price는 유효한 숫자여야 합니다' });
        }
        values.push(parsedPrice);
      } else {
        values.push(req.body[key]);
      }
    }
  }
  
  // category_name이 제공된 경우 카테고리 자동 생성 로직
  if (category_name && !req.body.category_id) {
    // 현재 메뉴의 store_id를 가져와야 함
    const currentMenu = await pool.query('SELECT store_id FROM menus WHERE id = $1', [id]);
    if (currentMenu.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    
    const store_id = currentMenu.rows[0].store_id;
    
    // 먼저 해당 스토어에 같은 이름의 카테고리가 있는지 확인
    const existingCategory = await pool.query(
      'SELECT id FROM menu_categories WHERE store_id = $1 AND name = $2 AND is_active = true',
      [store_id, category_name]
    );
    
    let categoryId;
    if (existingCategory.rowCount > 0) {
      categoryId = existingCategory.rows[0].id;
    } else {
      // 새로운 카테고리 생성
      const newCategory = await pool.query(
        'INSERT INTO menu_categories (store_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id',
        [store_id, category_name]
      );
      categoryId = newCategory.rows[0].id;
    }
    
    fields.push(`category_id = $${i++}`);
    values.push(categoryId);
  }
  
  if (fields.length === 0) {
    return res.status(400).json({ error: '수정할 필드가 없습니다' });
  }
  
  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE menus SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error('메뉴 수정 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID 또는 카테고리 ID입니다' });
    } else {
      res.status(500).json({ error: '메뉴 수정 실패' });
    }
  }
});

/**
 * [DELETE] /api/menus/:id
 * 메뉴 삭제 (소프트 삭제 - is_available = false)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE menus SET is_available = false WHERE id = $1 RETURNING *', 
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 메뉴가 없습니다' });
    }
    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error('메뉴 삭제 실패:', e);
    res.status(500).json({ error: '메뉴 삭제 실패' });
  }
});

/**
 * [GET] /api/menus/store/:storeId
 * 특정 스토어의 메뉴 목록 조회
 */
router.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        m.id, m.store_id, m.category_id, m.name, m.description, 
        m.price, m.image_url, m.is_available, m.sort_order, 
        m.created_at, m.updated_at,
        mc.name as category_name,
        s.name as store_name
      FROM menus m
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      JOIN stores s ON m.store_id = s.id
      WHERE m.store_id = $1 AND m.is_available = true
      ORDER BY mc.sort_order, m.sort_order, m.name
    `, [storeId]);
    
    res.json(result.rows);
  } catch (e) {
    console.error('스토어별 메뉴 조회 실패:', e);
    res.status(500).json({ error: '스토어별 메뉴 조회 실패' });
  }
});

/**
 * [GET] /api/menus/category/:categoryId
 * 특정 카테고리의 메뉴 목록 조회
 */
router.get('/category/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        m.id, m.store_id, m.category_id, m.name, m.description, 
        m.price, m.image_url, m.is_available, m.sort_order, 
        m.created_at, m.updated_at,
        mc.name as category_name,
        s.name as store_name
      FROM menus m
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      JOIN stores s ON m.store_id = s.id
      WHERE m.category_id = $1 AND m.is_available = true
      ORDER BY m.sort_order, m.name
    `, [categoryId]);
    
    res.json(result.rows);
  } catch (e) {
    console.error('카테고리별 메뉴 조회 실패:', e);
    res.status(500).json({ error: '카테고리별 메뉴 조회 실패' });
  }
});

module.exports = router;
