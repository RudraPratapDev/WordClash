const roomManager = require('../game/roomManager');
const { validateGuess, calculateScore } = require('../game/gameLogic');
const { isValidWord } = require('../game/wordList');

function sanitizePlayerName(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  return trimmed || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function clearRoomTimer(room) {
  if (room?.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
}

function scheduleRoundTimer(io, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.state !== 'IN_ROUND') return;

  clearRoomTimer(room);
  const timeoutMs = Math.max(0, (room.roundEndsAt || 0) - Date.now());

  room.roundTimer = setTimeout(() => {
    const currentRoom = roomManager.getRoom(roomId);
    if (!currentRoom || currentRoom.state !== 'IN_ROUND' || currentRoom.roundEnding) return;

    currentRoom.roundEnding = true;
    endRound(io, roomId, 'timeout');
  }, timeoutMs);
}

function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('create_room', ({ playerName, settings, playerKey }, callback) => {
      const safeName = sanitizePlayerName(playerName);
      // Create a short room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const room = roomManager.createRoom(roomId, socket.id, safeName, { ...settings, playerKey });
      
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = playerKey;

      callback(roomManager.getSafeRoomPayload(room));
    });

    socket.on('join_room', ({ roomId, playerName, playerKey }, callback) => {
      const safeName = sanitizePlayerName(playerName);
      const result = roomManager.joinRoom(roomId, socket.id, safeName, playerKey);
      if (result.error) {
        return callback({ error: result.error });
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = playerKey;

      const safeRoom = roomManager.getSafeRoomPayload(result.room);
      io.to(roomId).emit('room_updated', safeRoom);
      callback({ room: safeRoom, rejoined: Boolean(result.rejoined) });
    });

    socket.on('resume_session', ({ roomId, playerName, playerKey }, callback) => {
      if (!roomId || !playerKey) {
        return callback?.({ error: 'Missing session data' });
      }

      const safeName = sanitizePlayerName(playerName);
      const result = roomManager.reconnectPlayer(roomId, playerKey, socket.id, safeName);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      const safeRoom = roomManager.getSafeRoomPayload(result.room);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = playerKey;

      io.to(roomId).emit('room_updated', safeRoom);
      callback?.({ room: safeRoom, resumed: true });
    });

    socket.on('chat_message', ({ text }) => {
      const roomId = socket.data.roomId;
      if (roomId) {
        io.to(roomId).emit('chat_message', {
          id: Date.now().toString(),
          sender: socket.data.playerName,
          text,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('submit_guess', async ({ guess }, callback) => {
      const roomId = socket.data.roomId;
      if (!roomId) return callback({ error: 'Not in a room' });

      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'IN_ROUND') return callback({ error: 'Round not active' });

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return callback({ error: 'Player not found' });
      if (player.hasGuessedCorrectly || player.guesses.length >= 6) {
        return callback({ error: 'Cannot guess anymore' });
      }

      const normalizedGuess = (guess || '').toUpperCase().trim();

      if (normalizedGuess.length !== room.settings.wordLength) {
        return callback({ error: 'Invalid word length' });
      }

      const validWord = await isValidWord(normalizedGuess, room.settings.wordLength);
      if (!validWord) {
        return callback({ error: 'Word does not exist' });
      }

      // Check guess
      const statusArr = validateGuess(normalizedGuess, room.targetWord);
      player.guesses.push(statusArr);
      
      const isCorrect = statusArr.every(s => s === 'correct');
      if (isCorrect) {
        player.hasGuessedCorrectly = true;
        
        // Calculate score
        const timeElapsed = (Date.now() - room.roundStartTime) / 1000;
        const timeRemaining = Math.max(0, room.settings.timeLimit - timeElapsed);
        
        const anyoneElseCorrect = room.players.some(p => p.id !== socket.id && p.hasGuessedCorrectly);
        const scoreEarned = calculateScore(timeRemaining, player.guesses.length, true, !anyoneElseCorrect);
        
        player.score += scoreEarned;
      }

      io.to(roomId).emit('room_updated', roomManager.getSafeRoomPayload(room));

      // Check if round should end
      const allDone = room.players.every(p => p.hasGuessedCorrectly || p.guesses.length >= 6);
      if (allDone && !room.roundEnding) {
        room.roundEnding = true;
        clearRoomTimer(room);
        setTimeout(() => {
          endRound(io, roomId, 'all-done');
        }, 1500); // Small delay to let users see final guess animation
      }

      callback({ statuses: statusArr });
    });

    socket.on('start_game', () => {
      const roomId = socket.data.roomId;
      const room = roomManager.getRoom(roomId);
      if (room && room.ownerId === socket.id && room.state === 'LOBBY') {
        roomManager.resetMatch(roomId);
        const updatedRoom = roomManager.prepareRound(roomId);
        io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
        scheduleRoundTimer(io, roomId);
      }
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = roomManager.markPlayerDisconnected(roomId, socket.id);
        if (room) {
          io.to(roomId).emit('room_updated', roomManager.getSafeRoomPayload(room));
        }
      }
      console.log('Client disconnected:', socket.id);
    });
  });
}

function endRound(io, roomId, reason = 'unknown') {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  clearRoomTimer(room);

  if (room.currentRound >= room.settings.numRounds) {
    room.state = 'GAME_OVER';
  } else {
    room.state = 'ROUND_ENDED';
  }

  room.roundEndsAt = null;
  
  // We can reveal the target word at the end of the round
  io.to(roomId).emit('round_ended', { 
    room: roomManager.getSafeRoomPayload(room),
    targetWord: room.targetWord,
    reason,
  });

  if (room.state !== 'GAME_OVER') {
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || currentRoom.state !== 'ROUND_ENDED') return;

      const updatedRoom = roomManager.prepareRound(roomId);
      io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
      scheduleRoundTimer(io, roomId);
    }, 4000);
  }
}

module.exports = { setupSockets };
