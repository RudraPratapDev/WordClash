const roomManager = require('../game/roomManager');
const { validateGuess, calculateScore } = require('../game/gameLogic');
const { isValidWord } = require('../game/wordList');

function sanitizePlayerName(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  return trimmed || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('create_room', ({ playerName, settings }, callback) => {
      const safeName = sanitizePlayerName(playerName);
      // Create a short room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const room = roomManager.createRoom(roomId, socket.id, safeName, settings);
      
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;

      callback(roomManager.getSafeRoomPayload(room));
    });

    socket.on('join_room', ({ roomId, playerName }, callback) => {
      const safeName = sanitizePlayerName(playerName);
      const result = roomManager.joinRoom(roomId, socket.id, safeName);
      if (result.error) {
        return callback({ error: result.error });
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;

      const safeRoom = roomManager.getSafeRoomPayload(result.room);
      io.to(roomId).emit('room_updated', safeRoom);
      callback({ room: safeRoom });
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
        setTimeout(() => {
          endRound(io, roomId);
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
      }
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = roomManager.leaveRoom(roomId, socket.id);
        if (room) {
          io.to(roomId).emit('room_updated', roomManager.getSafeRoomPayload(room));
        }
      }
      console.log('Client disconnected:', socket.id);
    });
  });
}

function endRound(io, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  if (room.currentRound >= room.settings.numRounds) {
    room.state = 'GAME_OVER';
  } else {
    room.state = 'ROUND_ENDED';
  }
  
  // We can reveal the target word at the end of the round
  io.to(roomId).emit('round_ended', { 
    room: roomManager.getSafeRoomPayload(room),
    targetWord: room.targetWord 
  });

  if (room.state !== 'GAME_OVER') {
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || currentRoom.state !== 'ROUND_ENDED') return;

      const updatedRoom = roomManager.prepareRound(roomId);
      io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
    }, 4000);
  }
}

module.exports = { setupSockets };
