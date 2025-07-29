// routes/orders.js

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { 
  authenticateToken, 
  requireStorePermission, 
  requireRole 
} = require('../middleware/auth');

/**
 * [GET] /api/orders
 * 주문 전체 목록 조회 (멀티테넌트 - 가게별 필터링)
 */
router.get('/', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { store_id, status, limit = 50, offset = 0 } = req.query;
    const storeId = store_id || req.tenant?.storeId;
    
    if (!storeId) {
      return res.status(400).json({ error: 'store_id가 필요합니다' });
    }
    
    try {
      let query = `
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
      `;
      let params = [storeId];
      
      if (status) {
        query += ' AND o.status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY o.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (e) {
      console.error('주문 목록 조회 실패:', e);
      res.status(500).json({ error: '주문 목록 조회 실패' });
    }
  }
);

/**
 * [GET] /api/orders/recent
 * 최근 주문 목록 조회 (멀티테넌트)
 */
router.get('/recent', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { limit = 10 } = req.query;
    const storeId = req.tenant?.storeId;
    
    try {
      const result = await pool.query(`
        SELECT 
          o.id, o.store_id, o.table_id, o.order_number, o.status, 
          o.total_amount, o.notes, o.created_by, o.completed_at,
          o.created_at, o.updated_at,
          t.table_number,
          s.name as store_name,
          COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN stores s ON o.store_id = s.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.store_id = $1
        GROUP BY o.id, o.store_id, o.table_id, o.order_number, o.status, o.total_amount, o.notes, o.created_by, o.completed_at, o.created_at, o.updated_at, t.table_number, s.name
        ORDER BY o.created_at DESC
        LIMIT $2
      `, [storeId, parseInt(limit)]);

      res.json(result.rows);
    } catch (e) {
      console.error('최근 주문 조회 실패:', e);
      res.status(500).json({ error: '최근 주문 조회 실패' });
    }
  }
);

/**
 * [GET] /api/orders/:id
 * 특정 주문 상세 조회 (주문 아이템 포함 - 멀티테넌트)
 */
router.get('/:id', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 주문 기본 정보 (가게별 권한 확인)
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
        WHERE o.id = $1 AND o.store_id = $2
      `, [id, storeId]);

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
  }
);

/**
 * [POST] /api/orders
 * 새 주문 생성 (멀티테넌트)
 * Body: { table_id, items: [{menu_id, quantity, unit_price, notes}], total_amount, notes }
 */
router.post('/', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { table_id, items, total_amount, notes } = req.body;
    const storeId = req.tenant?.storeId;
    const adminId = req.user?.id;

    if (!table_id || !items || items.length === 0) {
      return res.status(400).json({ error: '테이블 ID와 주문 아이템이 필요합니다' });
    }

    // 아이템 검증
    for (const item of items) {
      if (!item.menu_id || !item.quantity || item.quantity <= 0 || !item.unit_price || item.unit_price <= 0) {
        return res.status(400).json({ error: '주문 아이템 정보가 올바르지 않습니다' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 테이블이 해당 스토어에 속하는지 확인
      const tableResult = await client.query(
        `SELECT table_number, status FROM tables WHERE id = $1 AND store_id = $2`,
        [table_id, storeId]
      );

      if (tableResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 메뉴들이 해당 스토어에 속하는지 확인
      const menuIds = items.map(item => item.menu_id);
      const menuPlaceholders = menuIds.map((_, index) => `$${index + 1}`).join(',');
      const menuCheckResult = await client.query(
        `SELECT id FROM menus WHERE id IN (${menuPlaceholders}) AND store_id = $${menuIds.length + 1} AND is_available = true`,
        [...menuIds, storeId]
      );

      if (menuCheckResult.rowCount !== menuIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '일부 메뉴가 해당 가게에 속하지 않거나 비활성화되어 있습니다' });
      }

      // 주문 번호 생성 (ORD_YYYYMMDD_XXX 형식)
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumberResult = await client.query(
        `SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE AND store_id = $1`,
        [storeId]
      );
      const orderCount = parseInt(orderNumberResult.rows[0].count) + 1;
      const orderNumber = `ORD_${date}_${orderCount.toString().padStart(3, '0')}`;

      // 주문 생성
      const orderResult = await client.query(
        `INSERT INTO orders (store_id, table_id, order_number, status, total_amount, notes, created_by, created_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW()) RETURNING *`,
        [storeId, table_id, orderNumber, total_amount, notes, adminId]
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

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const orderData = {
            orderId,
            orderNumber,
            storeId: storeId,
            tableId: table_id,
            tableNumber: tableResult.rows[0].table_number,
            totalAmount: total_amount,
            itemCount: items.length,
            status: 'pending',
            createdAt: orderResult.rows[0].created_at
          };
          
          socketHelpers.notifyNewOrder(storeId, orderData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

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
        res.status(400).json({ error: '존재하지 않는 테이블 ID 또는 메뉴 ID입니다' });
      } else {
        res.status(500).json({ error: '주문 생성 실패' });
      }
    } finally {
      client.release();
    }
  }
);

/**
 * [PATCH] /api/orders/:id/status
 * 주문 상태 변경 (pending -> confirmed -> preparing -> ready -> completed -> cancelled)
 */
router.patch('/:id/status', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const storeId = req.tenant?.storeId;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      // 주문이 해당 스토어에 속하는지 확인
      const orderCheck = await pool.query(
        'SELECT id, store_id FROM orders WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (orderCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      const result = await pool.query(`
        UPDATE orders SET 
          status = $1::VARCHAR(20),
          completed_at = CASE WHEN $1::VARCHAR(20) = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $2::INTEGER AND store_id = $3
        RETURNING *
      `, [status, id, storeId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      // 업데이트된 주문 정보와 함께 테이블, 스토어 정보 조회
      const orderWithDetails = await pool.query(`
        SELECT o.*, t.table_number, s.name as store_name
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.id = $1::INTEGER AND o.store_id = $2
      `, [id, storeId]);

      const updatedOrder = orderWithDetails.rows[0];

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          // 직원들에게 상태 변경 알림
          socketHelpers.notifyOrderStatusChange(storeId, {
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
            if (updatedOrder.table_id) {
              socketHelpers.notifyOrderStatusChange(storeId, {
                orderId: id,
                orderNumber: updatedOrder.order_number,
                tableId: updatedOrder.table_id,
                tableNumber: updatedOrder.table_number,
                status: status,
                message: status === 'preparing' ? '주문이 조리 중입니다' : '주문이 완료되었습니다',
                updatedAt: new Date()
              });
            }
          }
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
        // Socket.IO 오류는 주문 상태 변경을 막지 않음
      }

      res.json({
        success: true,
        order: updatedOrder
      });
    } catch (e) {
      console.error('주문 상태 변경 실패:', e);
      
      // 더 자세한 오류 정보 제공
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 주문 ID입니다' });
      } else if (e.code === '22P02') {
        res.status(400).json({ error: '잘못된 주문 ID 형식입니다' });
      } else {
        res.status(500).json({ 
          error: '주문 상태 변경 실패',
          details: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
      }
    }
  }
);

/**
 * [PUT] /api/orders/:id
 * 주문 전체 수정 (아이템 포함 - 멀티테넌트)
 */
router.put('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const { table_id, items, total_amount, notes, status } = req.body;
    const storeId = req.tenant?.storeId;

    if (!table_id) {
      return res.status(400).json({ error: '테이블 ID는 필수입니다' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 주문이 해당 스토어에 속하는지 확인
      const orderCheck = await client.query(
        'SELECT id FROM orders WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (orderCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await client.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [table_id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 주문 기본 정보 수정
      const orderResult = await client.query(
        `UPDATE orders SET 
           table_id = $1, 
           total_amount = $2, 
           notes = $3,
           status = COALESCE($4, 'pending')
         WHERE id = $5 AND store_id = $6 RETURNING *`,
        [table_id, total_amount, notes, status, id, storeId]
      );

      if (orderResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      // 기존 주문 아이템 삭제
      await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);

      // 새 주문 아이템들 등록
      if (items && items.length > 0) {
        // 메뉴들이 해당 스토어에 속하는지 확인
        const menuIds = items.map(item => item.menu_id);
        const menuPlaceholders = menuIds.map((_, index) => `$${index + 1}`).join(',');
        const menuCheckResult = await client.query(
          `SELECT id FROM menus WHERE id IN (${menuPlaceholders}) AND store_id = $${menuIds.length + 1} AND is_available = true`,
          [...menuIds, storeId]
        );

        if (menuCheckResult.rowCount !== menuIds.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: '일부 메뉴가 해당 가게에 속하지 않거나 비활성화되어 있습니다' });
        }

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
      res.json({
        success: true,
        order: orderResult.rows[0]
      });

    } catch (e) {
      await client.query('ROLLBACK');
      console.error('주문 수정 실패:', e);
      if (e.code === '23503') {
        res.status(400).json({ error: '존재하지 않는 테이블 ID 또는 메뉴 ID입니다' });
      } else {
        res.status(500).json({ error: '주문 수정 실패' });
      }
    } finally {
      client.release();
    }
  }
);

/**
 * [DELETE] /api/orders/:id
 * 주문 삭제 (주문 아이템도 함께 삭제 - 멀티테넌트)
 */
router.delete('/:id', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { id } = req.params;
    const storeId = req.tenant?.storeId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 주문이 해당 스토어에 속하는지 확인
      const orderCheck = await client.query(
        'SELECT id, table_id FROM orders WHERE id = $1 AND store_id = $2',
        [id, storeId]
      );

      if (orderCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      // 주문 아이템 먼저 삭제
      await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);

      // 주문 삭제
      const result = await client.query(
        'DELETE FROM orders WHERE id = $1 AND store_id = $2 RETURNING *', 
        [id, storeId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 주문이 없습니다' });
      }

      // 테이블에 다른 주문이 없으면 테이블 상태를 'available'로 변경
      const tableId = orderCheck.rows[0].table_id;
      const remainingOrders = await client.query(
        'SELECT COUNT(*) as count FROM orders WHERE table_id = $1 AND status NOT IN ($2, $3)',
        [tableId, 'completed', 'cancelled']
      );

      if (parseInt(remainingOrders.rows[0].count) === 0) {
        await client.query(
          'UPDATE tables SET status = $1 WHERE id = $2',
          ['available', tableId]
        );
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
  }
);

/**
 * [GET] /api/orders/table/:tableId
 * 특정 테이블의 주문 목록 조회 (멀티테넌트)
 */
router.get('/table/:tableId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { tableId } = req.params;
    const storeId = req.tenant?.storeId;
    
    try {
      // 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await pool.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [tableId, storeId]
      );

      if (tableCheck.rowCount === 0) {
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

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
        WHERE o.table_id = $1 AND o.store_id = $2
        ORDER BY o.created_at DESC
      `, [tableId, storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('테이블별 주문 조회 실패:', e);
      res.status(500).json({ error: '테이블별 주문 조회 실패' });
    }
  }
);

/**
 * [GET] /api/orders/store/:storeId
 * 특정 스토어의 주문 목록 조회 (멀티테넌트 - 권한 확인)
 */
router.get('/store/:storeId', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { storeId } = req.params;
    const tenantStoreId = req.tenant?.storeId;
    
    // 요청한 스토어와 테넌트 스토어가 일치하는지 확인
    if (storeId != tenantStoreId) {
      return res.status(403).json({ error: '다른 가게의 주문을 조회할 권한이 없습니다' });
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
        WHERE o.store_id = $1
        ORDER BY o.created_at DESC
      `, [storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('스토어별 주문 조회 실패:', e);
      res.status(500).json({ error: '스토어별 주문 조회 실패' });
    }
  }
);

/**
 * [GET] /api/orders/status/:status
 * 특정 상태의 주문들 조회 (멀티테넌트)
 */
router.get('/status/:status', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const { status } = req.params;
    const storeId = req.tenant?.storeId;
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
        WHERE o.status = $1 AND o.store_id = $2
        ORDER BY o.created_at ASC
      `, [status, storeId]);

      res.json(result.rows);
    } catch (e) {
      console.error('상태별 주문 조회 실패:', e);
      res.status(500).json({ error: '상태별 주문 조회 실패' });
    }
  }
);

/**
 * [GET] /api/orders/dashboard/stats
 * 주문 대시보드 통계 (멀티테넌트)
 */
router.get('/dashboard/stats', 
  authenticateToken, 
  requireStorePermission,
  async (req, res) => {
    const storeId = req.tenant?.storeId;
    
    try {
      // 오늘의 주문 통계
      const todayStats = await pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
          COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as avg_order_value
        FROM orders 
        WHERE store_id = $1 
        AND DATE(created_at) = CURRENT_DATE
      `, [storeId]);

      // 이번 주 주문 통계
      const weekStats = await pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as avg_order_value
        FROM orders 
        WHERE store_id = $1 
        AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
      `, [storeId]);

      // 시간대별 주문 통계 (오늘)
      const hourlyStats = await pool.query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as order_count,
          SUM(total_amount) as revenue
        FROM orders 
        WHERE store_id = $1 
        AND DATE(created_at) = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, [storeId]);

      res.json({
        today: todayStats.rows[0],
        this_week: weekStats.rows[0],
        hourly: hourlyStats.rows
      });
    } catch (e) {
      console.error('주문 통계 조회 실패:', e);
      res.status(500).json({ error: '주문 통계 조회 실패' });
    }
  }
);

/**
 * [POST] /api/orders/bulk-status-update
 * 여러 주문 상태 일괄 변경 (멀티테넌트)
 * Body: { order_ids: [1, 2, 3], new_status: 'completed' }
 */
router.post('/bulk-status-update', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager']),
  async (req, res) => {
    const { order_ids, new_status } = req.body;
    const storeId = req.tenant?.storeId;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: '주문 ID 배열이 필요합니다' });
    }

    if (!new_status) {
      return res.status(400).json({ error: '새 상태값이 필요합니다' });
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
    }

    try {
      console.log('orders bulk-status debug:', { order_ids, new_status, storeId });
      
      // 주문들이 해당 스토어에 속하는지 확인
      const placeholders = order_ids.map((_, index) => `$${index + 1}`).join(',');
      const checkQuery = `SELECT id FROM orders WHERE id IN (${placeholders}) AND store_id = $${order_ids.length + 1}`;
      const checkResult = await pool.query(checkQuery, [...order_ids, storeId]);

      if (checkResult.rowCount !== order_ids.length) {
        return res.status(400).json({ error: '일부 주문이 해당 가게에 속하지 않습니다' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updatePlaceholders = order_ids.map((_, index) => `$${index + 2}`).join(',');
        const updateQuery = `
          UPDATE orders SET 
            status = $1::VARCHAR(20), 
            completed_at = CASE WHEN $1::VARCHAR(20) = 'completed' THEN NOW() ELSE completed_at END
          WHERE id IN (${updatePlaceholders}) AND store_id = $${order_ids.length + 2}
          RETURNING *
        `;
        console.log('updatePlaceholders:', updatePlaceholders);
        console.log('params:', [new_status.toString(), ...order_ids, storeId]);
        
        const result = await client.query(updateQuery, [new_status.toString(), ...order_ids, storeId]);

        await client.query('COMMIT');

        // **멀티테넌트 Socket.IO 알림 발송**
        try {
          const socketHelpers = req.app.get('socketHelpers');
          if (socketHelpers) {
            result.rows.forEach(order => {
              socketHelpers.notifyOrderStatusChange(storeId, {
                orderId: order.id,
                orderNumber: order.order_number,
                storeId: order.store_id,
                tableId: order.table_id,
                newStatus: new_status,
                updatedAt: new Date()
              });
            });
          }
        } catch (socketError) {
          console.warn('Socket.IO 알림 발송 실패:', socketError);
        }

        res.json({ 
          success: true, 
          updated_count: result.rowCount,
          updated_orders: result.rows 
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('주문 상태 일괄 변경 실패:', e);
      res.status(500).json({ error: '주문 상태 일괄 변경 실패' });
    }
  }
);

/**
 * [POST] /api/orders/duplicate
 * 주문 복제 (멀티테넌트)
 * Body: { order_id, table_id }
 */
router.post('/duplicate', 
  authenticateToken, 
  requireStorePermission,
  requireRole(['owner', 'manager', 'staff']),
  async (req, res) => {
    const { order_id, table_id } = req.body;
    const storeId = req.tenant?.storeId;
    const adminId = req.user?.id;

    if (!order_id || !table_id) {
      return res.status(400).json({ error: '주문 ID와 테이블 ID가 필요합니다' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 원본 주문이 해당 스토어에 속하는지 확인
      const originalOrder = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND store_id = $2',
        [order_id, storeId]
      );

      if (originalOrder.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '원본 주문이 없습니다' });
      }

      // 새 테이블이 해당 스토어에 속하는지 확인
      const tableCheck = await client.query(
        'SELECT id FROM tables WHERE id = $1 AND store_id = $2',
        [table_id, storeId]
      );

      if (tableCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '해당 테이블이 없습니다' });
      }

      // 주문 번호 생성
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumberResult = await client.query(
        `SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE AND store_id = $1`,
        [storeId]
      );
      const orderCount = parseInt(orderNumberResult.rows[0].count) + 1;
      const orderNumber = `ORD_${date}_${orderCount.toString().padStart(3, '0')}`;

      // 새 주문 생성
      const newOrder = await client.query(
        `INSERT INTO orders (store_id, table_id, order_number, status, total_amount, notes, created_by, created_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW()) RETURNING *`,
        [storeId, table_id, orderNumber, originalOrder.rows[0].total_amount, 
         `복사된 주문 (원본: ${originalOrder.rows[0].order_number})`, adminId]
      );

      const newOrderId = newOrder.rows[0].id;

      // 주문 아이템들 복제
      const orderItems = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order_id]
      );

      for (const item of orderItems.rows) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_id, quantity, unit_price, total_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newOrderId, item.menu_id, item.quantity, item.unit_price, item.total_price, item.notes]
        );
      }

      await client.query('COMMIT');

      // **멀티테넌트 Socket.IO 알림 발송**
      try {
        const socketHelpers = req.app.get('socketHelpers');
        if (socketHelpers) {
          const orderData = {
            orderId: newOrderId,
            orderNumber: orderNumber,
            storeId: storeId,
            tableId: table_id,
            totalAmount: originalOrder.rows[0].total_amount,
            itemCount: orderItems.rows.length,
            status: 'pending',
            createdAt: newOrder.rows[0].created_at
          };
          
          socketHelpers.notifyNewOrder(storeId, orderData);
        }
      } catch (socketError) {
        console.warn('Socket.IO 알림 발송 실패:', socketError);
      }

      res.status(201).json({
        success: true,
        orderId: newOrderId,
        orderNumber: orderNumber,
        order: newOrder.rows[0],
        original_order: originalOrder.rows[0],
        new_order: newOrder.rows[0],
        copied_items: orderItems.rows.length
      });

    } catch (e) {
      await client.query('ROLLBACK');
      console.error('주문 복제 실패:', e);
      res.status(500).json({ error: '주문 복제 실패' });
    } finally {
      client.release();
    }
  }
);

/**
 * [POST] /api/orders/public
 * 공개 주문 생성 (인증 없이 - 고객용)
 * Body: { store_id, table_id, items: [{menu_id, quantity, unit_price, notes}], total_amount, notes }
 */
router.post('/public', async (req, res) => {
  const { store_id, table_id, items, total_amount, notes } = req.body;

  if (!store_id || !table_id || !items || items.length === 0) {
    return res.status(400).json({ error: '스토어 ID, 테이블 ID, 주문 아이템이 필요합니다' });
  }

  // 아이템 검증
  for (const item of items) {
    if (!item.menu_id || !item.quantity || item.quantity <= 0 || !item.unit_price || item.unit_price <= 0) {
      return res.status(400).json({ error: '주문 아이템 정보가 올바르지 않습니다' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 스토어 존재 확인
    const storeCheck = await client.query(
      'SELECT id, name FROM stores WHERE id = $1',
      [store_id]
    );

    if (storeCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    // 테이블이 해당 스토어에 속하는지 확인
    const tableResult = await client.query(
      `SELECT table_number, status FROM tables WHERE id = $1 AND store_id = $2`,
      [table_id, store_id]
    );

    if (tableResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '해당 테이블이 없습니다' });
    }

    // 메뉴들이 해당 스토어에 속하는지 확인
    const menuIds = items.map(item => item.menu_id);
    const menuPlaceholders = menuIds.map((_, index) => `$${index + 1}`).join(',');
    const menuCheckResult = await client.query(
      `SELECT id FROM menus WHERE id IN (${menuPlaceholders}) AND store_id = $${menuIds.length + 1} AND is_available = true`,
      [...menuIds, store_id]
    );

    if (menuCheckResult.rowCount !== menuIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '일부 메뉴가 해당 가게에 속하지 않거나 비활성화되어 있습니다' });
    }

    // 주문 번호 생성
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
      [store_id, table_id, orderNumber, total_amount || 0, notes || null]
    );

    const orderId = orderResult.rows[0].id;

    // 주문 아이템들 생성
    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price;
      await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, unit_price, total_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.menu_id, item.quantity, item.unit_price, totalPrice, item.notes || null]
      );
    }

    await client.query('COMMIT');

    // 주문 정보와 아이템들을 함께 조회
    const orderWithItems = await pool.query(`
      SELECT 
        o.id, o.store_id, o.table_id, o.order_number, o.status, 
        o.total_amount, o.notes, o.created_at, o.updated_at,
        t.table_number,
        s.name as store_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = $1
    `, [orderId]);

    const itemsResult = await pool.query(`
      SELECT 
        oi.id, oi.menu_id, oi.quantity, oi.unit_price, oi.total_price, oi.notes,
        m.name as menu_name, m.description as menu_description
      FROM order_items oi
      JOIN menus m ON oi.menu_id = m.id
      WHERE oi.order_id = $1
    `, [orderId]);

    const order = orderWithItems.rows[0];
    order.items = itemsResult.rows;

    // **멀티테넌트 Socket.IO 알림 발송**
    try {
      const socketHelpers = req.app.get('socketHelpers');
      if (socketHelpers) {
        const orderData = {
          orderId: orderId,
          orderNumber: orderNumber,
          storeId: store_id,
          tableId: table_id,
          totalAmount: total_amount || 0,
          itemCount: items.length,
          status: 'pending',
          createdAt: order.created_at
        };
        
        socketHelpers.notifyNewOrder(store_id, orderData);
      }
    } catch (socketError) {
      console.warn('Socket.IO 알림 발송 실패:', socketError);
    }

    res.status(201).json({
      success: true,
      order: order
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('공개 주문 생성 실패:', e);
    res.status(500).json({ error: '공개 주문 생성 실패' });
  } finally {
    client.release();
  }
});

module.exports = router;
