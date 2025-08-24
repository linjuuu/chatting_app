const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const redis = require('redis');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Redis 클라이언트 설정
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// 미들웨어
app.use(cors());
app.use(express.json());

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'Chat App Backend Server' });
});

// Socket.io 연결 처리
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 매칭 요청
  socket.on('join-matching', async (data) => {
    const { username } = data;
    console.log(`${username} joined matching queue`);
    
    try {
      // Redis에 대기열 추가
      await redisClient.lPush('waiting_queue', JSON.stringify({
        socketId: socket.id,
        username: username,
        joinedAt: Date.now()
      }));
      
      // 매칭 시도
      await tryMatch(socket);
    } catch (error) {
      console.error('Error joining matching:', error);
    }
  });

  // 매칭 취소
  socket.on('cancel-matching', async () => {
    try {
      // 대기열에서 제거
      await redisClient.lRem('waiting_queue', 0, JSON.stringify({
        socketId: socket.id
      }));
      socket.emit('matching-cancelled');
    } catch (error) {
      console.error('Error cancelling matching:', error);
    }
  });

  // 메시지 전송
  socket.on('send-message', async (data) => {
    const { roomId, message, username } = data;
    
    try {
      // Redis에 메시지 저장
      const messageData = {
        id: Date.now().toString(),
        roomId,
        sender: username,
        content: message,
        timestamp: Date.now()
      };
      
      await redisClient.lPush(`room:${roomId}:messages`, JSON.stringify(messageData));
      await redisClient.expire(`room:${roomId}:messages`, 300); // 5분 후 만료
      
      // 방의 다른 사용자에게 메시지 전송
      socket.to(roomId).emit('new-message', messageData);
      
      // 마지막 메시지 시간 업데이트
      await redisClient.hSet(`room:${roomId}`, 'lastMessageAt', Date.now());
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // 채팅방 종료
  socket.on('end-chat', async (data) => {
    const { roomId } = data;
    
    try {
      // 방의 다른 사용자에게 종료 알림
      socket.to(roomId).emit('chat-ended');
      
      // Redis에서 방 데이터 삭제
      await redisClient.del(`room:${roomId}:messages`);
      await redisClient.del(`room:${roomId}`);
      
      socket.leave(roomId);
    } catch (error) {
      console.error('Error ending chat:', error);
    }
  });

  // 연결 해제
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    try {
      // 대기열에서 제거
      await redisClient.lRem('waiting_queue', 0, JSON.stringify({
        socketId: socket.id
      }));
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// 매칭 시도 함수
async function tryMatch(socket) {
  try {
    const waitingUsers = await redisClient.lRange('waiting_queue', 0, -1);
    const parsedUsers = waitingUsers.map(user => JSON.parse(user));
    
    // 2명 이상 대기 중이면 매칭
    if (parsedUsers.length >= 2) {
      const user1 = parsedUsers[0];
      const user2 = parsedUsers[1];
      
      // 대기열에서 제거
      await redisClient.lRem('waiting_queue', 0, JSON.stringify(user1));
      await redisClient.lRem('waiting_queue', 0, JSON.stringify(user2));
      
      // 채팅방 생성
      const roomId = `room_${Date.now()}`;
      
      // Redis에 방 정보 저장
      await redisClient.hSet(`room:${roomId}`, {
        user1: JSON.stringify(user1),
        user2: JSON.stringify(user2),
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      });
      
      // 5분 후 자동 만료
      await redisClient.expire(`room:${roomId}`, 300);
      
      // 사용자들을 방에 입장시킴
      const user1Socket = io.sockets.sockets.get(user1.socketId);
      const user2Socket = io.sockets.sockets.get(user2.socketId);
      
      if (user1Socket) {
        user1Socket.join(roomId);
        user1Socket.emit('match-found', { roomId, partner: user2.username });
      }
      
      if (user2Socket) {
        user2Socket.join(roomId);
        user2Socket.emit('match-found', { roomId, partner: user1.username });
      }
      
      console.log(`Match created: ${user1.username} and ${user2.username} in room ${roomId}`);
    }
  } catch (error) {
    console.error('Error in matching:', error);
  }
}

// 자동 매칭 체크 (5초마다)
setInterval(async () => {
  try {
    const waitingUsers = await redisClient.lRange('waiting_queue', 0, -1);
    const parsedUsers = waitingUsers.map(user => JSON.parse(user));
    
    if (parsedUsers.length >= 2) {
      // 매칭 가능한 사용자들에 대해 매칭 시도
      for (let i = 0; i < parsedUsers.length - 1; i += 2) {
        const user1 = parsedUsers[i];
        const user2 = parsedUsers[i + 1];
        
        const user1Socket = io.sockets.sockets.get(user1.socketId);
        if (user1Socket) {
          await tryMatch(user1Socket);
        }
      }
    }
  } catch (error) {
    console.error('Error in auto matching:', error);
  }
}, 5000);

// Redis 연결 및 서버 시작
async function startServer() {
  try {
    await redisClient.connect();
    
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startServer(); 