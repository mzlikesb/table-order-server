require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db/connection');

// 보안 미들웨어 import
const { 
  corsOptions, 
  helmetConfig, 
  validateInput, 
  requestLogger, 
  errorHandler,
  loginRateLimit,
  apiRateLimit
} = require('./middleware/security');

const app = express();
const httpServer = http.createServer(app);

// 환경별 CORS 설정
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

const socketCorsOptions = {
  origin: isDevelopment 
    ? ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"]
    : process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
};

const io = new Server(httpServer, {
  cors: socketCorsOptions
});

// 보안 미들웨어 적용
app.use(helmetConfig);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 로깅 및 입력 검증
app.use(requestLogger);
app.use(validateInput);

// /customer 경로를 미들웨어 적용 전에 처리
app.get('/customer', async (req, res) => {
  console.log('=== 루트 레벨 /customer 경로 호출됨 (미들웨어 적용 전) ===');
  console.log('요청 URL:', req.originalUrl);
  console.log('쿼리 파라미터:', req.query);
  
  const { store_id, category_id } = req.query;
  
  if (!store_id) {
    return res.status(400).json({ error: '스토어 ID가 필요합니다' });
  }
  
  try {
    // 스토어 존재 확인
    const storeCheck = await pool.query(
      'SELECT id, name FROM stores WHERE id = $1',
      [store_id]
    );

    if (storeCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    // 카테고리 조회인지 메뉴 조회인지 확인
    const isCategoryRequest = req.headers['x-request-type'] === 'category' || 
                             req.query.type === 'category';
    
    if (isCategoryRequest) {
      // 카테고리 조회
      const result = await pool.query(`
        SELECT 
          mc.id, mc.name, mc.description, mc.sort_order,
          COUNT(m.id) as menu_count,
          COUNT(CASE WHEN m.is_available = true THEN 1 END) as active_menu_count
        FROM menu_categories mc
        LEFT JOIN menus m ON mc.id = m.category_id
        WHERE mc.store_id = $1 AND mc.is_active = true
        GROUP BY mc.id
        ORDER BY mc.sort_order, mc.name
      `, [store_id]);
      
      // COUNT 결과를 숫자로 변환
      const rows = result.rows.map(row => ({
        ...row,
        menu_count: parseInt(row.menu_count, 10),
        active_menu_count: parseInt(row.active_menu_count, 10)
      }));
      
      res.json(rows);
    } else {
      // 메뉴 조회
      let query = `
        SELECT 
          m.id, m.name, m.description, m.price, m.image_url, m.is_available,
          mc.name as category_name, mc.sort_order
        FROM menus m
        JOIN menu_categories mc ON m.category_id = mc.id
        WHERE m.store_id = $1 AND m.is_available = true AND mc.is_active = true
      `;
      let params = [store_id];
      
      if (category_id) {
        query += ' AND m.category_id = $' + (params.length + 1);
        params.push(parseInt(category_id));
      }
      
      query += ' ORDER BY mc.sort_order, m.name';
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    }
  } catch (e) {
    console.error('고객용 데이터 조회 실패:', e);
    res.status(500).json({ error: '데이터 조회 실패' });
  }
});

// Rate Limiting 적용
app.use('/api/auth/login', loginRateLimit);
app.use('/api', apiRateLimit);

// 멀티테넌트 미들웨어 적용
const { tenantMiddleware } = require('./middleware/tenant');
app.use(tenantMiddleware);

// 공개 API 경로들을 미들웨어에서 제외
app.use('/api/menus/customer', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

app.use('/api/menu-categories/customer', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

app.use('/api/stores/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

app.use('/api/tables/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

app.use('/api/calls/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

app.use('/api/orders/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  next();
});

// Socket.IO 연결 관리
io.on('connection', (socket) => {
  console.log('클라이언트 연결:', socket.id);
  
  // 직원용 룸에 참가 (전체 직원용 - 기존 호환성 유지)
  socket.on('join-staff', () => {
    socket.join('staff');
    console.log('직원이 전체 알림방에 참가:', socket.id);
  });

  // 스토어별 직원용 룸에 참가 (권장)
  socket.on('join-staff-store', (storeId) => {
    if (!storeId) {
      socket.emit('error', { message: 'storeId가 필요합니다' });
      return;
    }
    socket.join(`staff-store-${storeId}`);
    console.log(`직원이 스토어 ${storeId} 알림방에 참가:`, socket.id);
  });

  // 고객용 룸에 참가 (테이블별)
  socket.on('join-table', (tableId) => {
    if (!tableId) {
      socket.emit('error', { message: 'tableId가 필요합니다' });
      return;
    }
    socket.join(`table-${tableId}`);
    console.log(`테이블 ${tableId} 고객이 참가:`, socket.id);
  });

  // 연결 상태 확인
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    console.log('클라이언트 연결 해제:', socket.id, '사유:', reason);
  });
  
  // 에러 핸들링
  socket.on('error', (error) => {
    console.error('Socket.IO 에러:', error);
    socket.emit('error', { message: '서버 오류가 발생했습니다' });
  });
});

// 멀티테넌트 Socket.IO 헬퍼 함수들
const socketHelpers = {
  // 스토어별 직원 알림
  notifyStoreStaff: (storeId, event, data) => {
    if (!storeId) {
      console.error('storeId가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit(event, data);
  },
  
  // 테이블별 고객 알림
  notifyTable: (tableId, event, data) => {
    if (!tableId) {
      console.error('tableId가 필요합니다');
      return;
    }
    io.to(`table-${tableId}`).emit(event, data);
  },
  
  // 새 주문 알림
  notifyNewOrder: (storeId, orderData) => {
    if (!storeId || !orderData) {
      console.error('storeId와 orderData가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit('new-order', orderData);
  },
  
  // 주문 상태 변경 알림
  notifyOrderStatusChange: (storeId, orderData) => {
    if (!storeId || !orderData) {
      console.error('storeId와 orderData가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit('order-status-changed', orderData);
    if (orderData.table_id) {
      io.to(`table-${orderData.table_id}`).emit('order-update', orderData);
    }
  },
  
  // 새 호출 알림
  notifyNewCall: (storeId, callData) => {
    if (!storeId || !callData) {
      console.error('storeId와 callData가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit('new-call', callData);
  },
  
  // 호출 상태 변경 알림
  notifyCallStatusChange: (storeId, callData) => {
    if (!storeId || !callData) {
      console.error('storeId와 callData가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit('call-status-changed', callData);
  },

  // 테이블 상태 변경 알림
  notifyTableStatusChange: (storeId, tableData) => {
    if (!storeId || !tableData) {
      console.error('storeId와 tableData가 필요합니다');
      return;
    }
    io.to(`staff-store-${storeId}`).emit('table-status-changed', tableData);
  },

  // 연결된 클라이언트 수 확인
  getConnectedClients: (storeId) => {
    const room = io.sockets.adapter.rooms.get(`staff-store-${storeId}`);
    return room ? room.size : 0;
  }
};

app.set('socketHelpers', socketHelpers);
app.set('io', io);

// 라우터 설정
const authRouter = require('./routes/auth');
const uploadRouter = require('./routes/upload');
const menusRouter = require('./routes/menus');
const menuCategoriesRouter = require('./routes/menu-categories');
const ordersRouter = require('./routes/orders');
const tablesRouter = require('./routes/tables');
const callsRouter = require('./routes/calls');
const storesRouter = require('./routes/stores');
const tenantRouter = require('./routes/tenant');

// 정적 파일 서빙 (업로드된 이미지)
app.use('/uploads', express.static('uploads'));

// API 라우터 설정
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);

// 공개 API 경로들을 명시적으로 처리
app.use('/api/menus/customer', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 메뉴 API 요청:', req.originalUrl);
  next();
});

app.use('/api/menu-categories/customer', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 카테고리 API 요청:', req.originalUrl);
  next();
});

app.use('/api/stores/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 스토어 API 요청:', req.originalUrl);
  next();
});

app.use('/api/tables/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 테이블 API 요청:', req.originalUrl);
  next();
});

app.use('/api/calls/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 호출 API 요청:', req.originalUrl);
  next();
});

app.use('/api/orders/public', (req, res, next) => {
  // 공개 API이므로 인증 미들웨어를 건너뜀
  console.log('공개 주문 API 요청:', req.originalUrl);
  next();
});

// /customer 경로를 명시적으로 처리 (라우터 등록 전)
app.get('/customer', async (req, res) => {
  console.log('=== 루트 레벨 /customer 경로 호출됨 ===');
  console.log('요청 URL:', req.originalUrl);
  console.log('쿼리 파라미터:', req.query);
  
  const { store_id, category_id } = req.query;
  
  if (!store_id) {
    return res.status(400).json({ error: '스토어 ID가 필요합니다' });
  }
  
  try {
    // 스토어 존재 확인
    const storeCheck = await pool.query(
      'SELECT id, name FROM stores WHERE id = $1',
      [store_id]
    );

    if (storeCheck.rowCount === 0) {
      return res.status(404).json({ error: '해당 스토어가 없습니다' });
    }

    // 카테고리 조회인지 메뉴 조회인지 확인
    const isCategoryRequest = req.headers['x-request-type'] === 'category' || 
                             req.query.type === 'category';
    
    if (isCategoryRequest) {
      // 카테고리 조회
      const result = await pool.query(`
        SELECT 
          mc.id, mc.name, mc.description, mc.sort_order,
          COUNT(m.id) as menu_count,
          COUNT(CASE WHEN m.is_available = true THEN 1 END) as active_menu_count
        FROM menu_categories mc
        LEFT JOIN menus m ON mc.id = m.category_id
        WHERE mc.store_id = $1 AND mc.is_active = true
        GROUP BY mc.id
        ORDER BY mc.sort_order, mc.name
      `, [store_id]);
      
      // COUNT 결과를 숫자로 변환
      const rows = result.rows.map(row => ({
        ...row,
        menu_count: parseInt(row.menu_count, 10),
        active_menu_count: parseInt(row.active_menu_count, 10)
      }));
      
      res.json(rows);
    } else {
      // 메뉴 조회
      let query = `
        SELECT 
          m.id, m.name, m.description, m.price, m.image_url, m.is_available,
          mc.name as category_name, mc.sort_order
        FROM menus m
        JOIN menu_categories mc ON m.category_id = mc.id
        WHERE m.store_id = $1 AND m.is_available = true AND mc.is_active = true
      `;
      let params = [store_id];
      
      if (category_id) {
        query += ' AND m.category_id = $' + (params.length + 1);
        params.push(parseInt(category_id));
      }
      
      query += ' ORDER BY mc.sort_order, m.name';
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    }
  } catch (e) {
    console.error('고객용 데이터 조회 실패:', e);
    res.status(500).json({ error: '데이터 조회 실패' });
  }
});

app.use('/api/menus', menusRouter);
app.use('/api/menu-categories', menuCategoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/calls', callsRouter);
app.use('/api/stores', storesRouter);
app.use('/api/tenant', tenantRouter);



// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// API 루트 엔드포인트
app.get('/api', (req, res) => {
  res.json({ 
    message: "테이블오더 서버에 오신 것을 환영합니다!",
    version: "1.0.0",
    environment: process.env.NODE_ENV || 'development'
  });
});

// 에러 핸들링 미들웨어 (라우터 이후에 추가)
app.use(errorHandler);

// 404 핸들러 (마지막에 추가)
app.use((req, res) => {
  res.status(404).json({ 
    error: '요청한 리소스를 찾을 수 없습니다',
    path: req.originalUrl,
    method: req.method
  });
});

// 프로세스 종료 시 정리 작업
process.on('SIGTERM', () => {
  console.log('SIGTERM 신호를 받았습니다. 서버를 종료합니다...');
  httpServer.close(() => {
    console.log('HTTP 서버가 종료되었습니다.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT 신호를 받았습니다. 서버를 종료합니다...');
  httpServer.close(() => {
    console.log('HTTP 서버가 종료되었습니다.');
    process.exit(0);
  });
});

// 예상치 못한 에러 처리
process.on('uncaughtException', (error) => {
  console.error('예상치 못한 에러:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 Promise 거부:', reason);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 서버가 포트 ${PORT}에서 실행되었습니다.`);
  console.log(`📊 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? '설정됨' : '기본값 사용'}`);
  console.log(`🌐 CORS Origins: ${isDevelopment ? '개발 모드 (localhost 허용)' : process.env.ALLOWED_ORIGINS || '설정되지 않음'}`);
  console.log(`📅 시작 시간: ${new Date().toISOString()}`);
});
