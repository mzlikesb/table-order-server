require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // 모든 도메인의 요청을 허용 (개발 초기 단계)
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", 
    methods: ["GET", "POST"]
  }
});

// 4. API 테스트를 위한 기본 라우트(경로)를 만듭니다.
app.get('/api', (req, res) => {
  res.json({ message: "테이블오더 서버에 오신 것을 환영합니다!" });
});

io.on('connection', (socket) => {
  console.log(`클라이언트 연결됨: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`클라이언트 연결 끊김: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`${PORT}번 포트에서 서버가 실행되었습니다.`);
});
