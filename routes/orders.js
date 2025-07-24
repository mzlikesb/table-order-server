// routes/orders.js

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
 * [GET] /api/orders
 * 주문 전체 목록 조회 (최신순)
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_by, o.completed_at,
        o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('주문 목록 조회 실패:', e);
    res.status(500).json({ error: '주문 목록 조회 실패' });
  }
});

/**
 * [GET] /api/orders/:id
 * 특정 주문 상세 조회 (주문 아이템 포함)
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 주문 기본 정보
    const orderResult = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_by, o.completed_at,
        o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }

    // 주문 아이템 정보
    const itemsResult = await pool.query(`
      SELECT 
        oi.id, oi.menu_id, oi.quantity, oi.unit_price, oi.total_price, oi.notes,
        m.name as menu_name, m.description as menu_description
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.id
      WHERE oi.order_id = $1
    `, [id]);

    const order = orderResult.rows[0];
    order.items = itemsResult.rows;

    res.json(order);
  } catch (e) {
    console.error('주문 조회 실패:', e);
    res.status(500).json({ error: '주문 조회 실패' });
  }
});

/**
 * [POST] /api/orders
 * 새 주문 생성
 * Body: { store_id, table_id, items: [{menu_id, quantity, unit_price, notes}], total_amount, notes }
 */
router.post('/', async (req, res) => {
  const { store_id, table_id, items, total_amount, notes } = req.body;

  if (!store_id || !table_id || !items || items.length === 0) {
    return res.status(400).json({ error: '스토어 ID, 테이블 ID와 주문 아이템이 필요합니다' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 테이블 정보 조회
    const tableResult = await client.query(
      `SELECT table_number FROM tables WHERE id = $1 AND store_id = $2`,
      [table_id, store_id]
    );

    if (tableResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }

    // 주문 번호 생성 (ORD_YYYYMMDD_XXX 형식)
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumberResult = await client.query(
      `SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE AND store_id = $1`,
      [store_id]
    );
    const orderCount = parseInt(orderNumberResult.rows[0].count) + 1;
    const orderNumber = `ORD_${date}_${orderCount.toString().padStart(3, '0')}`;

    // 주문 생성
    const orderResult = await client.query(
      `INSERT INTO orders (store_id, table_id, order_number, status, total_amount, notes, created_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, NOW()) RETURNING *`,
      [store_id, table_id, orderNumber, total_amount, notes]
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

    // 테이블 상태를 'occupied'로 변경
    await client.query(
      `UPDATE tables SET status = 'occupied' WHERE id = $1`,
      [table_id]
    );

    await client.query('COMMIT');

    // **실시간 알림 발송** - 직원들에게
    const io = req.app.get('io');
    const orderData = {
      orderId,
      orderNumber,
      storeId: store_id,
      tableId: table_id,
      tableNumber: tableResult.rows[0].table_number,
      totalAmount: total_amount,
      itemCount: items.length,
      status: 'pending',
      createdAt: orderResult.rows[0].created_at
    };

    io.to('staff').emit('new-order', orderData);

    res.status(201).json({ 
      success: true, 
      orderId,
      orderNumber,
      order: orderResult.rows[0]
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('주문 생성 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID, 테이블 ID 또는 메뉴 ID입니다' });
    } else {
      res.status(500).json({ error: '주문 생성 실패' });
    }
  } finally {
    client.release();
  }
});

/**
 * [PATCH] /api/orders/:id/status
 * 주문 상태 변경 (pending -> confirmed -> preparing -> ready -> completed -> cancelled)
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }

  try {
    const result = await pool.query(`
      UPDATE orders SET 
        status = $1,
        completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
      WHERE id = $2 
      RETURNING o.*, t.table_number, s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = $2
    `, [status, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }
    const updatedOrder = result.rows[0];

    // **실시간 알림 발송**
    const io = req.app.get('io');
    
    // 직원들에게 상태 변경 알림
    io.to('staff').emit('order-status-changed', {
      orderId: id,
      orderNumber: updatedOrder.order_number,
      storeId: updatedOrder.store_id,
      tableId: updatedOrder.table_id,
      tableNumber: updatedOrder.table_number,
      newStatus: status,
      updatedAt: new Date()
    });

    // 해당 테이블 고객에게도 알림 (주문 완료, 서빙 완료 등)
    if (status === 'ready' || status === 'preparing') {
      io.to(`table-${updatedOrder.table_id}`).emit('order-update', {
        orderId: id,
        orderNumber: updatedOrder.order_number,
        status: status,
        message: status === 'preparing' ? '주문이 조리 중입니다' : '주문이 완료되었습니다'
      });
    }

    res.json(updatedOrder);
  } catch (e) {
    console.error('주문 상태 변경 실패:', e);
    res.status(500).json({ error: '주문 상태 변경 실패' });
  }
});

/**
 * [PUT] /api/orders/:id
 * 주문 전체 수정 (아이템 포함)
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { store_id, table_id, items, total_amount, notes, status } = req.body;

  if (!store_id || !table_id) {
    return res.status(400).json({ error: '스토어 ID와 테이블 ID는 필수입니다' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 주문 기본 정보 수정
    const orderResult = await client.query(
      `UPDATE orders SET 
         store_id = $1, 
         table_id = $2, 
         total_amount = $3, 
         notes = $4,
         status = COALESCE($5, 'pending')
       WHERE id = $6 RETURNING *`,
      [store_id, table_id, total_amount, notes, status, id]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }

    // 기존 주문 아이템 삭제
    await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);

    // 새 주문 아이템들 등록
    if (items && items.length > 0) {
      for (const item of items) {
        const itemTotalPrice = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, menu_id, quantity, unit_price, total_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.menu_id, item.quantity, item.unit_price, itemTotalPrice, item.notes || null]
        );
      }
    }

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('주문 수정 실패:', e);
    if (e.code === '23503') {
      res.status(400).json({ error: '존재하지 않는 스토어 ID, 테이블 ID 또는 메뉴 ID입니다' });
    } else {
      res.status(500).json({ error: '주문 수정 실패' });
    }
  } finally {
    client.release();
  }
});

/**
 * [DELETE] /api/orders/:id
 * 주문 삭제 (주문 아이템도 함께 삭제)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 주문 아이템 먼저 삭제
    await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);

    // 주문 삭제
    const result = await client.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }

    await client.query('COMMIT');
    res.json({ success: true, deleted: result.rows[0] });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('주문 삭제 실패:', e);
    res.status(500).json({ error: '주문 삭제 실패' });
  } finally {
    client.release();
  }
});

/**
 * [GET] /api/orders/table/:tableId
 * 특정 테이블의 주문 목록 조회
 */
router.get('/table/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_by, o.completed_at,
        o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.table_id = $1
      ORDER BY o.created_at DESC
    `, [tableId]);

    res.json(result.rows);
  } catch (e) {
    console.error('테이블별 주문 조회 실패:', e);
    res.status(500).json({ error: '테이블별 주문 조회 실패' });
  }
});

/**
 * [GET] /api/orders/store/:storeId
 * 특정 스토어의 주문 목록 조회
 */
router.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_by, o.completed_at,
        o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.store_id = $1
      ORDER BY o.created_at DESC
    `, [storeId]);

    res.json(result.rows);
  } catch (e) {
    console.error('스토어별 주문 조회 실패:', e);
    res.status(500).json({ error: '스토어별 주문 조회 실패' });
  }
});

/**
 * [GET] /api/orders/status/:status
 * 특정 상태의 주문들 조회
 */
router.get('/status/:status', async (req, res) => {
  const { status } = req.params;
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_by, o.completed_at,
        o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.status = $1
      ORDER BY o.created_at ASC
    `, [status]);

    res.json(result.rows);
  } catch (e) {
    console.error('상태별 주문 조회 실패:', e);
    res.status(500).json({ error: '상태별 주문 조회 실패' });
  }
});

module.exports = router;
