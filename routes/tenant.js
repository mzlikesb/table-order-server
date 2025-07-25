const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { requireTenant, requireAdminPermission } = require('../middleware/tenant');

/**
 * [GET] /api/tenant/:storeId/dashboard
 * 가게 대시보드 정보 조회
 */
router.get('/:storeId/dashboard', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    
    // 오늘의 주문 통계
    const todayOrdersResult = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        SUM(total_amount) as total_revenue
      FROM orders 
      WHERE store_id = $1 AND DATE(created_at) = CURRENT_DATE
    `, [storeId]);
    
    // 대기 중인 주문
    const pendingOrdersResult = await pool.query(`
      SELECT COUNT(*) as pending_count
      FROM orders 
      WHERE store_id = $1 AND status IN ('pending', 'confirmed', 'preparing')
    `, [storeId]);
    
    // 대기 중인 호출
    const pendingCallsResult = await pool.query(`
      SELECT COUNT(*) as pending_calls
      FROM calls 
      WHERE store_id = $1 AND status = 'pending'
    `, [storeId]);
    
    // 테이블 상태
    const tableStatusResult = await pool.query(`
      SELECT 
        COUNT(*) as total_tables,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_tables,
        COUNT(CASE WHEN status = 'occupied' THEN 1 END) as occupied_tables
      FROM tables 
      WHERE store_id = $1 AND is_active = true
    `, [storeId]);
    
    const dashboard = {
      today: todayOrdersResult.rows[0],
      pending: {
        orders: pendingOrdersResult.rows[0].pending_count,
        calls: pendingCallsResult.rows[0].pending_calls
      },
      tables: tableStatusResult.rows[0]
    };
    
    res.json(dashboard);
  } catch (error) {
    console.error('Dashboard 조회 실패:', error);
    res.status(500).json({ error: '대시보드 조회 실패' });
  }
});

/**
 * [GET] /api/tenant/:storeId/menus
 * 가게별 메뉴 목록 조회
 */
router.get('/:storeId/menus', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    
    const result = await pool.query(`
      SELECT 
        m.id, m.category_id, m.name, m.description, 
        m.price, m.image_url, m.is_available, m.sort_order,
        mc.name as category_name
      FROM menus m 
      LEFT JOIN menu_categories mc ON m.category_id = mc.id
      WHERE m.store_id = $1 AND m.is_available = true
      ORDER BY mc.sort_order, m.sort_order, m.name
    `, [storeId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('메뉴 조회 실패:', error);
    res.status(500).json({ error: '메뉴 조회 실패' });
  }
});

/**
 * [GET] /api/tenant/:storeId/tables
 * 가게별 테이블 목록 조회
 */
router.get('/:storeId/tables', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    
    const result = await pool.query(`
      SELECT 
        id, table_number, name, capacity, status, is_active
      FROM tables 
      WHERE store_id = $1 AND is_active = true
      ORDER BY table_number
    `, [storeId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('테이블 조회 실패:', error);
    res.status(500).json({ error: '테이블 조회 실패' });
  }
});

/**
 * [GET] /api/tenant/:storeId/orders
 * 가게별 주문 목록 조회
 */
router.get('/:storeId/orders', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    const { status, limit = 50 } = req.query;
    
    let query = `
      SELECT 
        o.id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_at,
        t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.store_id = $1
    `;
    let params = [storeId];
    
    if (status) {
      query += ' AND o.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY o.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('주문 조회 실패:', error);
    res.status(500).json({ error: '주문 조회 실패' });
  }
});

/**
 * [POST] /api/tenant/:storeId/orders
 * 가게별 새 주문 생성
 */
router.post('/:storeId/orders', requireTenant, requireAdminPermission, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    const { table_id, items, total_amount, notes } = req.body;
    
    if (!table_id || !items || items.length === 0) {
      return res.status(400).json({ error: '테이블 ID와 주문 아이템이 필요합니다' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 테이블이 해당 스토어에 속하는지 확인
      const tableResult = await client.query(
        'SELECT table_number FROM tables WHERE id = $1 AND store_id = $2',
        [table_id, storeId]
      );
      
      if (tableResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }
      
      // 주문 번호 생성
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumberResult = await client.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE AND store_id = $1',
        [storeId]
      );
      const orderCount = parseInt(orderNumberResult.rows[0].count) + 1;
      const orderNumber = `ORD_${date}_${orderCount.toString().padStart(3, '0')}`;
      
      // 주문 생성
      const orderResult = await client.query(
        `INSERT INTO orders (store_id, table_id, order_number, status, total_amount, notes, created_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, NOW()) RETURNING *`,
        [storeId, table_id, orderNumber, total_amount, notes]
      );
      
      const orderId = orderResult.rows[0].id;
      
      // 주문 아이템들 등록
      for (const item of items) {
        const itemTotalPrice = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, menu_id, quantity, unit_price, total_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.menu_id, item.quantity, item.unit_price, itemTotalPrice, item.notes || null]
        );
      }
      
      await client.query('COMMIT');
      
      // 생성된 주문 정보 반환
      const finalOrderResult = await pool.query(`
        SELECT 
          o.id, o.table_id, o.order_number, o.status, 
          o.total_amount, o.notes, o.created_at,
          t.table_number
        FROM orders o
        JOIN tables t ON o.table_id = t.id
        WHERE o.id = $1
      `, [orderId]);
      
      res.status(201).json(finalOrderResult.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('주문 생성 실패:', error);
    res.status(500).json({ error: '주문 생성 실패' });
  }
});

/**
 * [PUT] /api/tenant/:storeId/orders/:orderId/status
 * 주문 상태 변경
 */
router.put('/:storeId/orders/:orderId/status', requireTenant, requireAdminPermission, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    const { orderId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 주문 상태입니다' });
    }
    
    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND store_id = $3
       RETURNING *`,
      [status, orderId, storeId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('주문 상태 변경 실패:', error);
    res.status(500).json({ error: '주문 상태 변경 실패' });
  }
});

/**
 * [GET] /api/tenant/:storeId/calls
 * 가게별 호출 목록 조회
 */
router.get('/:storeId/calls', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    const { status } = req.query;
    
    let query = `
      SELECT 
        c.id, c.table_id, c.call_type, c.message, c.status,
        c.responded_at, c.completed_at, c.created_at,
        t.table_number
      FROM calls c
      JOIN tables t ON c.table_id = t.id
      WHERE c.store_id = $1
    `;
    let params = [storeId];
    
    if (status) {
      query += ' AND c.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY c.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('호출 조회 실패:', error);
    res.status(500).json({ error: '호출 조회 실패' });
  }
});

/**
 * [POST] /api/tenant/:storeId/calls
 * 가게별 새 호출 생성
 */
router.post('/:storeId/calls', requireTenant, async (req, res) => {
  try {
    const storeId = req.tenant.storeId;
    const { table_id, call_type, message } = req.body;
    
    if (!table_id || !call_type) {
      return res.status(400).json({ error: '테이블 ID와 호출 타입이 필요합니다' });
    }
    
    const validCallTypes = ['service', 'bill', 'help', 'custom'];
    if (!validCallTypes.includes(call_type)) {
      return res.status(400).json({ error: '유효하지 않은 호출 타입입니다' });
    }
    
    const result = await pool.query(
      `INSERT INTO calls (store_id, table_id, call_type, message, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW()) RETURNING *`,
      [storeId, table_id, call_type, message || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('호출 생성 실패:', error);
    res.status(500).json({ error: '호출 생성 실패' });
  }
});

module.exports = router; 