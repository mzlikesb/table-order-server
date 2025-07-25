// 테스트용 Express 앱 인스턴스
const express = require('express');
const app = express();

// 환경 변수 로드
require('dotenv').config();

// 미들웨어 설정
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 보안 미들웨어 (테스트용으로 간소화)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS 설정
const cors = require('cors');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// 멀티테넌트 미들웨어
const { tenantMiddleware } = require('../middleware/tenant');
app.use(tenantMiddleware);

// Socket.IO 설정 (테스트용으로 비활성화)
// const { createServer } = require('http');
// const { Server } = require('socket.io');
// const server = createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
//     credentials: true
//   }
// });

// 멀티테넌트 Socket.IO 헬퍼 함수들 (테스트용)
const socketHelpers = {
  notifyNewOrder: jest.fn(),
  notifyOrderStatusChange: jest.fn(),
  notifyNewCall: jest.fn(),
  notifyCallStatusChange: jest.fn(),
  notifyTableStatusChange: jest.fn()
};
app.set('socketHelpers', socketHelpers);

// 라우터 설정
const authRouter = require('../routes/auth');
const tablesRouter = require('../routes/tables');
const menusRouter = require('../routes/menus');
const menuCategoriesRouter = require('../routes/menu-categories');
const ordersRouter = require('../routes/orders');
const callsRouter = require('../routes/calls');
const storesRouter = require('../routes/stores');
const uploadRouter = require('../routes/upload');

app.use('/api/auth', authRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/menus', menusRouter);
app.use('/api/menu-categories', menuCategoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/calls', callsRouter);
app.use('/api/stores', storesRouter);
app.use('/api/upload', uploadRouter);

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'Table Order Server - Test Environment' });
});

// 404 핸들러 (Express 5.x 호환)
app.use((req, res) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다' });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('서버 에러:', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다' });
});

module.exports = app; 