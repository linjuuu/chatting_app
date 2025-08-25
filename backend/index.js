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

// 유틸: 대기열에서 socketId로 안전 제거
async function removeFromQueueBySocketId(targetSocketId) {
  const all = await redisClient.lRange('waiting_queue', 0, -1);
  for (const entry of all) {
    try {
      const parsed = JSON.parse(entry);
      if (parsed && parsed.socketId === targetSocketId) {
        await redisClient.lRem('waiting_queue', 0, entry);
      }
    } catch (_) {}
  }
}

// 유틸: 방 정보로 두 참가자 socketId 추출
async function getRoomParticipantsSocketIds(roomId) {
  const roomKey = `room:${roomId}`;
  const data = await redisClient.hGetAll(roomKey);
  if (!data || !data.user1 || !data.user2) return [];
  const u1 = JSON.parse(data.user1);
  const u2 = JSON.parse(data.user2);
  return [u1?.socketId, u2?.socketId].filter(Boolean);
}

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
      // 이미 방에 있는 사용자는 큐에 넣지 않음
      const isInRoom = await redisClient.sIsMember('in_room', socket.id);
      if (isInRoom) {
        socket.emit('matching-error', { message: '현재 채팅 중입니다.' });
        return;
      }

      // 중복 큐 방지: 기존 동일 소켓 큐 엔트리 제거 후 추가
      await removeFromQueueBySocketId(socket.id);
      await redisClient.rPush('waiting_queue', JSON.stringify({
        socketId: socket.id,
        username: username,
        joinedAt: Date.now()
      }));

      await tryMatch();
    } catch (error) {
      console.error('Error joining matching:', error);
    }
  });

  // 매칭 취소
  socket.on('cancel-matching', async () => {
    try {
      await removeFromQueueBySocketId(socket.id);
      socket.emit('matching-cancelled');
    } catch (error) {
      console.error('Error cancelling matching:', error);
    }
  });

  // 메시지 전송
  socket.on('send-message', async (data) => {
    const { roomId, message, username } = data;

    try {
      const messageData = {
        id: Date.now().toString(),
        roomId,
        sender: username,
        content: message,
        timestamp: Date.now()
      };

      await redisClient.lPush(`room:${roomId}:messages`, JSON.stringify(messageData));
      await redisClient.expire(`room:${roomId}:messages`, 300); // 5분 후 만료

      socket.to(roomId).emit('new-message', messageData);

      await redisClient.hSet(`room:${roomId}`, 'lastMessageAt', Date.now());
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // 채팅방 종료
  socket.on('end-chat', async (data) => {
    const { roomId } = data;

    try {
      // 방의 모든 사용자에게 종료 알림
      io.in(roomId).emit('chat-ended');

      // 방 참가자 식별 후 큐/활성상태 정리
      const participantSocketIds = await getRoomParticipantsSocketIds(roomId);
      for (const sid of participantSocketIds) {
        await removeFromQueueBySocketId(sid);
        await redisClient.sRem('in_room', sid);
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(roomId);
      }

      // 방 데이터 삭제
      await redisClient.del(`room:${roomId}:messages`);
      await redisClient.del(`room:${roomId}`);
    } catch (error) {
      console.error('Error ending chat:', error);
    }
  });

  // 연결 해제
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);

    try {
      await removeFromQueueBySocketId(socket.id);
      await redisClient.sRem('in_room', socket.id);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// 매칭 시도 함수
async function tryMatch() {
  try {
    const waitingUsers = await redisClient.lRange('waiting_queue', 0, -1);
    const parsed = waitingUsers.map((u) => {
      try { return JSON.parse(u); } catch { return null; }
    }).filter(Boolean);

    // 짝지어가며 매칭 시도
    while (parsed.length >= 2) {
      const user1 = parsed.shift();
      const user2 = parsed.shift();

      // 대기열에서 정확히 제거
      await redisClient.lRem('waiting_queue', 1, JSON.stringify(user1));
      await redisClient.lRem('waiting_queue', 1, JSON.stringify(user2));

      // 이미 방에 있는 사용자는 건너뜀
      const inRoom1 = await redisClient.sIsMember('in_room', user1.socketId);
      const inRoom2 = await redisClient.sIsMember('in_room', user2.socketId);
      if (inRoom1 || inRoom2) continue;

      const roomId = `room_${Date.now()}`;

      await redisClient.hSet(`room:${roomId}`, {
        user1: JSON.stringify(user1),
        user2: JSON.stringify(user2),
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      });
      await redisClient.expire(`room:${roomId}`, 300);

      // 활성 사용자 등록
      await redisClient.sAdd('in_room', user1.socketId, user2.socketId);

      // 소켓 참여 및 통지
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
    await tryMatch();
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