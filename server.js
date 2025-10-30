// server.js (房間制版本)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/四子棋.html');
});

// 不再使用 waitingPlayer
// 改用一個物件來儲存等待中的房間
// 格式: { '1234': { player1: socket } }
let pendingRooms = {};

// 產生一個 4 位數的房間代碼
function generateRoomCode() {
  let code = '';
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (pendingRooms[code]); // 確保代碼是唯一的
  return code;
}

io.on('connection', (socket) => {
  console.log('一位玩家連線了:', socket.id);

  // 1. 監聽 'createRoom' 事件
  socket.on('createRoom', (data) => {
    const roomCode = generateRoomCode();
    socket.playerName = data.name || '玩家一';
    
    pendingRooms[roomCode] = {
      player1: socket
    };

    socket.roomCode = roomCode; // 儲存代碼，用於斷線處理
    socket.join(roomCode); // 讓創建者加入 Socket.IO 房間
    
    console.log(`玩家 ${socket.playerName} 創建了房間 ${roomCode}`);
    // 回傳房間代碼給創建者
    socket.emit('roomCreated', { roomCode: roomCode });
  });

  // 2. 監聽 'joinRoom' 事件
  socket.on('joinRoom', (data) => {
    const { name, roomCode } = data;
    const room = pendingRooms[roomCode];

    // 檢查房間是否存在
    if (!room) {
      return socket.emit('joinError', { message: '錯誤：找不到這個房間' });
    }

    // 房間存在，可以加入
    socket.playerName = name || '玩家一';
    const player1 = room.player1;
    const player2 = socket;

    // 將 P2 也加入 Socket.IO 房間
    socket.join(roomCode);
    
    // 儲存 socket.room 屬性，供 'makeMove' 和 'disconnect' 使用
    player1.room = roomCode;
    player2.room = roomCode;

    // --- 隨機決定 P1/P2 (先手) ---
    let p1, p2;
    if (Math.random() < 0.5) {
      [p1, p2] = [player1, player2];
    } else {
      [p1, p2] = [player2, player1];
    }
    
    // --- 名稱衝突處理 ---
    let p1Name = p1.playerName;
    let p2Name = p2.playerName;
    if (p1Name === '玩家一' && p2Name === '玩家一') {
      p2Name = '玩家二';
      p2.playerName = p2Name; 
    }

    // --- 廣播遊戲開始 ---
    // 玩家 1 (先手)
    p1.emit('gameStart', { 
      playerNumber: 1, 
      yourName: p1Name,
      opponentName: p2Name
    });
    // 玩家 2 (後手)
    p2.emit('gameStart', { 
      playerNumber: 2, 
      yourName: p2Name,
      opponentName: p1Name
    });

    console.log(`遊戲開始: ${p1Name} (P1) vs ${p2Name} (P2) 於房間 ${roomCode}`);

    // 從等待列表移除
    delete pendingRooms[roomCode];
  });

  // 3. 監聽 'makeMove' 事件 (邏輯簡化)
  socket.on('makeMove', (data) => {
    // socket.room 是在 'joinRoom' 時設定的
    if (socket.room) {
      socket.to(socket.room).emit('opponentMove', data);
    }
  });

  // 4. 監聽 'disconnect' (斷線) 事件
  socket.on('disconnect', () => {
    console.log('一位玩家斷線了:', socket.id);

    // 情況 A: 玩家在等待室中斷線
    if (socket.roomCode && pendingRooms[socket.roomCode]) {
      // 檢查是否為 P1 (房主)
      if (pendingRooms[socket.roomCode].player1 === socket) {
        delete pendingRooms[socket.roomCode];
        console.log(`等待中的房間 ${socket.roomCode} 已解散`);
      }
    }

    // 情況 B: 玩家在遊戲中斷線
    // socket.room 是在 'joinRoom' 時設定的
    if (socket.room) {
      console.log(`玩家 ${socket.playerName} 在遊戲 ${socket.room} 中斷線`);
      socket.to(socket.room).emit('opponentLeft');
    }
  });
});

// 啟動伺服器
server.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});