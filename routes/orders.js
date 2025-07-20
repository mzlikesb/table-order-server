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
        o.id, o.table_id, o.status, o.total_price, o.created_at,
        t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) {
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
        o.id, o.table_id, o.status, o.total_price, o.created_at,
        t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: '해당 주문이 없습니다' });
    }

    // 주문 아이템 정보
    const itemsResult = await pool.query(`
      SELECT 
        oi.id, oi.menu_id, oi.quantity, oi.options,
        m.name as menu_name, m.price as menu_price
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.id
      WHERE oi.order_id = $1
    `, [id]);

    const order = orderResult.rows[0];
    order.items = itemsResult.rows;

    res.json(order);
  } catch (e) {
    res.status(500).json({ error: '주문 조회 실패' });
  }
});

/**
 * [POST] /api/orders
 * 새 주문 생성
 * Body: { table_id, items: [{menu_id, quantity, options}], total_price }
 */
router.post('/', async (req, res) => {
  const { table_id, items, total_price } = req.body;

  if (!table_id || !items || items.length === 0) {
    return res.status(400).json({ error: '테이블 ID와 주문 아이템이 필요합니다' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 주문 생성
    const orderResult = await client.query(
      `INSERT INTO orders (table_id, status, total_price, created_at)
       VALUES ($1, 'pending', $2, NOW()) RETURNING *`,
      [table_id, total_price]
    );
    
    const orderId = orderResult.rows[0].id;

    // 주문 아이템들 등록
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, options)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.menu_id, item.quantity, item.options || null]
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
      tableId: table_id,
      tableNumber: tableResult.rows[0].table_number,
      totalPrice: total_price,
      itemCount: items.length,
      status: 'pending',
      createdAt: orderResult.rows[0].created_at
    };

    io.to('staff').emit('new-order', orderData);

    res.status(201).json({ 
      success: true, 
      orderId,
      order: orderResult.rows[0]
    });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '주문 생성 실패' });
  } finally {
    client.release();
  }
});

/**
 * [PATCH] /api/orders/:id/status
 * 주문 상태 변경 (pending -> cooking -> served -> paid -> cancelled)
 */
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'cooking', 'served', 'paid', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
  }

  try {
    const result = await pool.query(`
      UPDATE orders SET status = $1 
      WHERE id = $2 
      RETURNING o.*, t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
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
      tableId: updatedOrder.table_id,
      tableNumber: updatedOrder.table_number,
      newStatus: status,
      updatedAt: new Date()
    });

    // 해당 테이블 고객에게도 알림 (주문 완료, 서빙 완료 등)
    if (status === 'served' || status === 'cooking') {
      io.to(`table-${updatedOrder.table_id}`).emit('order-update', {
        orderId: id,
        status: status,
        message: status === 'cooking' ? '주문이 조리 중입니다' : '주문이 완료되었습니다'
      });
    }

    res.json(updatedOrder);
  } catch (e) {
    res.status(500).json({ error: '주문 상태 변경 실패' });
  }
});

/**
 * [PUT] /api/orders/:id
 * 주문 전체 수정 (아이템 포함)
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { table_id, items, total_price, status } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 주문 기본 정보 수정
    const orderResult = await client.query(
      `UPDATE orders SET table_id = $1, total_price = $2, status = $3
       WHERE id = $4 RETURNING *`,
      [table_id, total_price, status || 'pending', id]
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
        await client.query(
          `INSERT INTO order_items (order_id, menu_id, quantity, options)
           VALUES ($1, $2, $3, $4)`,
          [id, item.menu_id, item.quantity, item.options || null]
        );
      }
    }

    await client.query('COMMIT');
    res.json(orderResult.rows[0]);

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '주문 수정 실패' });
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
        o.id, o.table_id, o.status, o.total_price, o.created_at,
        t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.table_id = $1
      ORDER BY o.created_at DESC
    `, [tableId]);

    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: '테이블별 주문 조회 실패' });
  }
});

/**
 * [GET] /api/orders/status/:status
 * 특정 상태의 주문들 조회
 */
router.get('/status/:status', async (req, res) => {
  const { status } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        o.id, o.table_id, o.status, o.total_price, o.created_at,
        t.table_number
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      WHERE o.status = $1
      ORDER BY o.created_at ASC
    `, [status]);

    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: '상태별 주문 조회 실패' });
  }
});

module.exports = router;
