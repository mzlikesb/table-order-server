require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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
const io = new Server(httpServer, {
  cors: {
    origin: "*", //FIXME: 추후 수정
    methods: ["GET", "POST"]
  }
});

// 보안 미들웨어 적용
app.use(helmetConfig);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 로깅 및 입력 검증
app.use(requestLogger);
app.use(validateInput);

// Rate Limiting 적용
app.use('/api/auth/login', loginRateLimit);
app.use('/api', apiRateLimit);

// 멀티테넌트 미들웨어 적용
const { tenantMiddleware } = require('./middleware/tenant');
app.use(tenantMiddleware);

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
    socket.join(`staff-store-${storeId}`);
    console.log(`직원이 스토어 ${storeId} 알림방에 참가:`, socket.id);
  });

  // 고객용 룸에 참가 (테이블별)
  socket.on('join-table', (tableId) => {
    socket.join(`table-${tableId}`);
    console.log(`테이블 ${tableId} 고객이 참가:`, socket.id);
  });

  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제:', socket.id);
  });
  
});

// Socket.IO 이벤트 예시 (실제 사용 시에는 각 라우트에서 정의된 데이터를 사용)
// 스토어별 알림 (권장)
// io.to(`staff-store-${storeId}`).emit('new-order', orderData);
// io.to(`staff-store-${storeId}`).emit('order-status-changed', orderData);
// io.to(`staff-store-${storeId}`).emit('new-call', callData);
// io.to(`staff-store-${storeId}`).emit('call-status-changed', callData);

// 테이블별 고객 알림
// io.to(`table-${tableId}`).emit('order-update', orderData);

// 전체 직원 알림 (기존 호환성 - 권장하지 않음)
// io.to('staff').emit('order-updated', orderData);

// 멀티테넌트 Socket.IO 헬퍼 함수들
const socketHelpers = {
  // 스토어별 직원 알림
  notifyStoreStaff: (storeId, event, data) => {
    io.to(`staff-store-${storeId}`).emit(event, data);
  },
  
  // 테이블별 고객 알림
  notifyTable: (tableId, event, data) => {
    io.to(`table-${tableId}`).emit(event, data);
  },
  
  // 새 주문 알림
  notifyNewOrder: (storeId, orderData) => {
    io.to(`staff-store-${storeId}`).emit('new-order', orderData);
  },
  
  // 주문 상태 변경 알림
  notifyOrderStatusChange: (storeId, orderData) => {
    io.to(`staff-store-${storeId}`).emit('order-status-changed', orderData);
    if (orderData.table_id) {
      io.to(`table-${orderData.table_id}`).emit('order-update', orderData);
    }
  },
  
  // 새 호출 알림
  notifyNewCall: (storeId, callData) => {
    io.to(`staff-store-${storeId}`).emit('new-call', callData);
  },
  
  // 호출 상태 변경 알림
  notifyCallStatusChange: (storeId, callData) => {
    io.to(`staff-store-${storeId}`).emit('call-status-changed', callData);
  }
};

app.set('socketHelpers', socketHelpers);

app.set('io', io);

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

app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/menus', menusRouter);
app.use('/api/menu-categories', menuCategoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/calls', callsRouter);
app.use('/api/stores', storesRouter);
app.use('/api/tenant', tenantRouter);

// 4. API 테스트를 위한 기본 라우트(경로)를 만듭니다.
app.get('/api', (req, res) => {
  res.json({ message: "테이블오더 서버에 오신 것을 환영합니다!" });
});

// 에러 핸들링 미들웨어 (라우터 이후에 추가)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버가 실행되었습니다.`);
  console.log(`환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`JWT Secret: ${process.env.JWT_SECRET ? '설정됨' : '기본값 사용'}`);
});
