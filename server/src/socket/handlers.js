const roomManager = require('../game/roomManager');
const { validateGuess, calculateScore } = require('../game/gameLogic');
const { isValidWord, isValidWordSync, getWordInsight } = require('../game/wordList');

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

function prefetchRoundWordInsight(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.targetWord) return;

  const target = room.targetWord;
  getWordInsight(target)
    .then((wordInfo) => {
      const latestRoom = roomManager.getRoom(roomId);
      if (!latestRoom || latestRoom.targetWord !== target) return;

      latestRoom.prefetchedWordInfo = wordInfo || {
        word: target,
        partOfSpeech: 'Unknown',
        meaning: 'No dictionary insight available for this round word.',
        example: '',
        source: 'fallback',
      };
    })
    .catch(() => {
      const latestRoom = roomManager.getRoom(roomId);
      if (!latestRoom || latestRoom.targetWord !== target) return;

      latestRoom.prefetchedWordInfo = {
        word: target,
        partOfSpeech: 'Unknown',
        meaning: 'No dictionary insight available for this round word.',
        example: '',
        source: 'fallback',
      };
    });
}

function emitPresenceEvent(io, roomId, event) {
  io.to(roomId).emit('presence_event', event);
}

function findPublicIdBySocket(room, socketId) {
  return room?.players.find(player => player.id === socketId)?.publicId || null;
}

function tryEndRoundIfEligible(io, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.state !== 'IN_ROUND' || room.roundEnding) return;

  const activePlayers = room.players.filter(p => p.isOnline);
  if (activePlayers.length === 0) return;

  const allDone = activePlayers.every(p => p.hasGuessedCorrectly || p.guesses.length >= 6);
  if (!allDone) return;

  room.roundEnding = true;
  clearRoomTimer(room);
  setTimeout(() => {
    endRound(io, roomId, 'all-done');
  }, 1200);
}

function leaveCurrentRoom(io, socket) {
  const currentRoomId = socket.data.roomId;
  if (!currentRoomId) return;

  socket.leave(currentRoomId);
  const updatedRoom = roomManager.leaveRoom(currentRoomId, socket.id);
  if (updatedRoom) {
    io.to(currentRoomId).emit('room_updated', roomManager.getSafeRoomPayload(updatedRoom));
  }

  socket.data.roomId = undefined;
  socket.data.playerName = undefined;
}

function setupSockets(io) {
  io.on('connection', (socket) => {
    socket.on('create_room', ({ playerName, settings, playerKey }, callback) => {
      const safeName = sanitizePlayerName(playerName);
      if (socket.data.roomId) {
        leaveCurrentRoom(io, socket);
      }
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
      if (socket.data.roomId && socket.data.roomId !== roomId) {
        leaveCurrentRoom(io, socket);
      }
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
      emitPresenceEvent(io, roomId, {
        type: result.rejoined ? 'rejoined' : 'joined',
        playerName: safeName,
        playerId: findPublicIdBySocket(result.room, socket.id),
      });
      callback({ room: safeRoom, rejoined: Boolean(result.rejoined) });
    });

    socket.on('resume_session', ({ roomId, playerName, playerKey }, callback) => {
      if (!roomId || !playerKey) {
        return callback?.({ error: 'Missing session data' });
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        leaveCurrentRoom(io, socket);
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
      emitPresenceEvent(io, roomId, {
        type: 'rejoined',
        playerName: safeName,
        playerId: findPublicIdBySocket(result.room, socket.id),
      });
      callback?.({ room: safeRoom, resumed: true });
    });

    socket.on('leave_room', (_payload, callback) => {
      if (!socket.data.roomId) {
        callback?.({ ok: true });
        return;
      }

      leaveCurrentRoom(io, socket);
      callback?.({ ok: true });
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

      const validWord = isValidWordSync(normalizedGuess) || await isValidWord(normalizedGuess, room.settings.wordLength);
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
        const scoreEarned = calculateScore(
          timeRemaining,
          player.guesses.length,
          true,
          !anyoneElseCorrect,
          room.settings.timeLimit,
          room.settings.wordLength
        );
        
        player.score += scoreEarned;
      }

      roomManager.markRoomDirty(room);

      // Send result back immediately to keep input feedback snappy.
      callback({ statuses: statusArr });

      io.to(roomId).emit('player_updated', {
        player: roomManager.getSafePlayerPayload(player),
      });

      // Ignore offline players when deciding whether the round can end.
      tryEndRoundIfEligible(io, roomId);
    });

    socket.on('start_game', () => {
      const roomId = socket.data.roomId;
      const room = roomManager.getRoom(roomId);
      if (room && room.ownerId === socket.id && (room.state === 'LOBBY' || room.state === 'GAME_OVER')) {
        roomManager.resetMatch(roomId);
        const updatedRoom = roomManager.prepareRound(roomId);
        io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
        prefetchRoundWordInsight(roomId);
        scheduleRoundTimer(io, roomId);
      }
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = roomManager.markPlayerDisconnected(roomId, socket.id, (updatedRoom, removedPlayer) => {
          emitPresenceEvent(io, roomId, {
            type: 'expired',
            playerName: removedPlayer?.name || 'Player',
            playerId: removedPlayer?.publicId || null,
          });

          if (updatedRoom) {
            io.to(roomId).emit('room_updated', roomManager.getSafeRoomPayload(updatedRoom));
          }
        });
        if (room) {
          io.to(roomId).emit('room_updated', roomManager.getSafeRoomPayload(room));
          emitPresenceEvent(io, roomId, {
            type: 'offline',
            playerName: socket.data.playerName || 'Player',
            playerId: findPublicIdBySocket(room, socket.id),
          });
          tryEndRoundIfEligible(io, roomId);
        }
      }
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
  roomManager.markRoomDirty(room);

  const revealedWord = room.targetWord;
  
  // We can reveal the target word at the end of the round
  io.to(roomId).emit('round_ended', { 
    room: roomManager.getSafeRoomPayload(room),
    targetWord: revealedWord,
    wordInfo: room.prefetchedWordInfo || null,
    reason,
  });

  if (!room.prefetchedWordInfo && revealedWord) {
    io.to(roomId).emit('word_insight', {
      targetWord: revealedWord,
      wordInfo: {
        word: revealedWord,
        partOfSpeech: 'Unknown',
        meaning: 'No dictionary insight available for this round word.',
        example: '',
        source: 'fallback',
      },
    });
  }

  if (room.state !== 'GAME_OVER') {
    setTimeout(() => {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || currentRoom.state !== 'ROUND_ENDED') return;

      const updatedRoom = roomManager.prepareRound(roomId);
      io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
      prefetchRoundWordInsight(roomId);
      scheduleRoundTimer(io, roomId);
    }, 4000);
  }
}

module.exports = { setupSockets };
