# 채팅 앱 (Random Chat App)

1회성 랜덤 매칭 채팅 앱입니다. 사용자는 매칭 버튼을 눌러 상대방과 1:1 채팅을 할 수 있습니다.

## 🚀 주요 기능

- **랜덤 매칭**: 매칭 버튼으로 상대방과 연결
- **실시간 채팅**: Socket.io 기반 실시간 메시지 송수신
- **자동 종료**: 5분 무응답 시 자동 채팅 종료
- **수동 종료**: 종료 버튼으로 언제든 채팅 종료
- **데이터 삭제**: 채팅 종료 시 즉시 모든 메시지 삭제

## 🛠️ 기술 스택

### Frontend
- React Native (Expo)
- Socket.io Client
- React Native Gesture Handler

### Backend
- Node.js
- Express.js
- Socket.io
- Redis

## 📦 설치 및 실행

### 1. Redis 설치 및 실행
```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# 또는 Docker 사용
docker run -d -p 6379:6379 redis:alpine
```

### 2. Backend 실행
```bash
cd backend
npm install
cp env.example .env  # 환경변수 파일 생성
npm run dev
```

### 3. Frontend 실행
```bash
cd frontend
npm install
npx expo start
```

## 📱 앱 사용법

1. **사용자명 입력**: 앱 실행 후 사용자명 입력
2. **매칭 시작**: "매칭 시작" 버튼 클릭
3. **매칭 대기**: 상대방을 찾을 때까지 대기
4. **채팅 시작**: 매칭 성공 시 자동으로 채팅 시작
5. **채팅 종료**: "종료" 버튼 또는 5분 무응답 시 자동 종료

## 🔧 개발 환경 설정

### 환경변수 설정 (backend/.env)
```
PORT=3001
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### 개발 서버 실행
```bash
# Backend (터미널 1)
cd backend
npm run dev

# Frontend (터미널 2)
cd frontend
npx expo start
```

## 📁 프로젝트 구조

```
chatting_app/
├── frontend/          # React Native 앱
│   ├── App.js        # 메인 앱 컴포넌트
│   └── package.json
├── backend/           # Node.js 서버
│   ├── index.js      # 서버 메인 파일
│   ├── package.json
│   └── env.example
└── README.md
```

## 🚀 배포 준비

### Backend 배포
- Vercel, Heroku, AWS 등에 배포 가능
- Redis Cloud 또는 Upstash 사용 권장

### Frontend 배포
- Expo EAS Build로 앱 빌드
- App Store, Google Play Store 배포

## 🔄 향후 개선 사항

- [ ] 파일/이미지 전송 기능
- [ ] 푸시 알림
- [ ] 이모지 지원
- [ ] 다크모드
- [ ] 채팅방 테마 설정
- [ ] 사용자 통계 및 분석 