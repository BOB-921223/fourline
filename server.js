const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ----------------------------------------------------------------------
// 這是 Render 部署時需要的，但在本機運行時，它會使用 3000
const PORT = process.env.PORT || 3000;
// ----------------------------------------------------------------------

// 告訴 Express 伺服器去提供 "目前資料夾" (__dirname) 下的靜態檔案
app.use(express.static(__dirname));

// 路由：當有人訪問網站根目錄時，發送四子棋.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/四子棋.html');
});

let waitingPlayer = null; // 等待中的玩家

// Socket.IO 連線邏輯
io.on('connection', (socket) => {
  console.log('一位玩家連線了:', socket.id);

  // 監聽 'joinGame' 事件 (我們稍後會在 HTML 中加入這個)
  // 監聽 'joinGame' 事件
socket.on('joinGame', (data) => { // <-- (1) 接收 data
  
  // (2) 儲存玩家暱稱
  const playerName = data.name || `玩家${socket.id.substring(0, 4)}`;
  socket.playerName = playerName; // 將暱稱存儲在 socket 物件上
  console.log(`玩家 ${playerName} (${socket.id}) 請求加入`);

  // 檢查是否已經有玩家在等待
  if (waitingPlayer) {
      
      // ▼▼▼ 新增的隨機配對邏輯 ▼▼▼
      let player1, player2;
      
      if (Math.random() < 0.5) {
        player1 = waitingPlayer; // A 是 P1
        player2 = socket;        // B 是 P2
      } else {
        player1 = socket;        // B 是 P1
        player2 = waitingPlayer; // A 是 P2
      }
      // ▲▲▲

      // 清空等待室
      waitingPlayer = null;

      // 建立一個 "房間" (room) 給這兩位玩家
      // (注意：這裡的變數名稱 player1 和 player2 已經被隨機指派了)
      const roomName = `game_${player1.id}_${player2.id}`;
      player1.join(roomName);
      player2.join(roomName);

      // 將房間名稱存到 socket 物件上，方便之後使用
      player1.room = roomName;
      player2.room = roomName;

      // --- (此處的 player1 和 player2 已經是隨機的) ---
      // 玩家 1 (先手)
      player1.emit('gameStart', { 
        playerNumber: 1, 
        opponentName: player2.playerName 
      });
      // 玩家 2 (後手)
      player2.emit('gameStart', { 
        playerNumber: 2, 
        opponentName: player1.playerName 
      });
      // ------------------------------------------

      console.log(`遊戲開始 (隨機): ${player1.playerName} (P1) vs ${player2.playerName} (P2)`);

    } else {
      // (else 區塊保持不變)
      // 如果沒有玩家在等待，將這位玩家設為等待中
      waitingPlayer = socket;
      socket.emit('waitingForOpponent');
      console.log('玩家', socket.playerName, '正在等待對手...');
    }
});

  // 監聽 'makeMove' 事件
  socket.on('makeMove', (data) => {
    // 'data' 應該包含 { r, c, player }
    // 取得房間名稱
    const room = socket.room;
    if (!room) return;

    // 向 "同一個房間" 的 "另外一位" 玩家轉發這個移動
    // 'broadcast' 會發送給除了自己以外的所有人
    socket.to(room).emit('opponentMove', data);
  });

  // 監聽 'disconnect' (斷線) 事件
  socket.on('disconnect', () => {
    console.log('一位玩家斷線了:', socket.id);

    // 檢查斷線的是否是等待中的玩家
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
      console.log('等待中的玩家離開了');
    } else if (socket.room) {
      // 檢查斷線的玩家是否在遊戲中
      // 通知房間裡的另一位玩家
      socket.to(socket.room).emit('opponentLeft');
    }
  });
});

// 啟動伺服器
server.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});