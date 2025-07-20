require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", //FIXME: 추후 수정
    methods: ["GET", "POST"]
  }
});

app.use(cors()); // 모든 도메인의 요청을 허용 (개발 초기 단계)
app.use(express.json());

// Socket.IO 연결 관리
io.on('connection', (socket) => {
  console.log('클라이언트 연결:', socket.id);
  
  // 직원용 룸에 참가
  socket.on('join-staff', () => {
    socket.join('staff');
    console.log('직원이 알림방에 참가:', socket.id);
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

app.set('io', io);

const menusRouter = require('./routes/menus');
const ordersRouter = require('./routes/orders');
const tablesRouter = require('./routes/tables');
const callsRouter = require('./routes/calls');

app.use('/api/menus', menusRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/calls', callsRouter);

// 4. API 테스트를 위한 기본 라우트(경로)를 만듭니다.
app.get('/api', (req, res) => {
  res.json({ message: "테이블오더 서버에 오신 것을 환영합니다!" });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버가 실행되었습니다.`);
});
