const roomManager = require('../game/roomManager');
const { validateGuess, calculateScore } = require('../game/gameLogic');
const { isValidWord, isValidWordSync, getWordInsight } = require('../game/wordList');
const {
  REPORT_REASON_MAX_LENGTH,
  saveWordReport,
  sanitizeCategory,
  sanitizeReasonText,
} = require('../services/wordReportService');

const MAX_ACTIVE_ROOMS = Number(process.env.MAX_ACTIVE_ROOMS || 150);
const MAX_CHAT_LENGTH = Number(process.env.MAX_CHAT_LENGTH || 280);
const WORD_REPORT_WINDOW_MS = Number(process.env.WORD_REPORT_WINDOW_MS || 10 * 60 * 1000);
const WORD_REPORT_MAX_PER_WINDOW = Number(process.env.WORD_REPORT_MAX_PER_WINDOW || 3);

const reportUserRateLimit = new Map();
const reportIpRateLimit = new Map();

function sanitizePlayerName(name) {
  const trimmed = (name || '').trim().slice(0, 20);
  return trimmed || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function sanitizePlayerKey(playerKey, fallback = '') {
  if (typeof playerKey !== 'string') return fallback;
  const cleaned = playerKey.trim();
  if (cleaned.length < 8 || cleaned.length > 120) return fallback;
  return cleaned;
}

function sanitizeChatText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
}

function sanitizeReportedWords(input, fallbackWord) {
  const words = [];

  if (Array.isArray(input)) {
    words.push(...input);
  } else if (typeof input === 'string') {
    words.push(input);
  }

  if (!words.length && fallbackWord) {
    words.push(fallbackWord);
  }

  const normalized = words
    .map((word) => (typeof word === 'string' ? word.trim().toUpperCase() : ''))
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, 12);
}

function getClientIp(socket) {
  const headerValue = socket?.handshake?.headers?.['x-forwarded-for'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.split(',')[0].trim();
  }

  const address = socket?.handshake?.address || socket?.conn?.remoteAddress || '';
  return typeof address === 'string' ? address : '';
}

function consumeRateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const safeKey = key || 'unknown';
  const existing = map.get(safeKey);

  if (!existing || now >= existing.resetAt) {
    map.set(safeKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  map.set(safeKey, existing);
  return {
    allowed: true,
    remaining: max - existing.count,
    resetAt: existing.resetAt,
  };
}

function sweepRateLimitMap(map) {
  const now = Date.now();
  for (const [key, value] of map.entries()) {
    if (now >= value.resetAt) {
      map.delete(key);
    }
  }
}

setInterval(() => {
  sweepRateLimitMap(reportUserRateLimit);
  sweepRateLimitMap(reportIpRateLimit);
}, Math.max(60 * 1000, Math.floor(WORD_REPORT_WINDOW_MS / 2))).unref?.();

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
  io.to(roomId).emit('presence_event', { ...event, roomId });
}

function findPublicIdBySocket(room, socketId) {
  return room?.players.find(player => player.id === socketId)?.publicId || null;
}

function tryEndRoundIfEligible(io, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.state !== 'IN_ROUND' || room.roundEnding) return;

  const activePlayers = room.players.filter(p => p.isOnline);

  // If everyone is offline, do nothing — the round timer keeps running and the
  // 30s reconnect grace window gives players a chance to come back.
  // If nobody reconnects, the disconnect timers will remove them and the room
  // will be cleaned up naturally.
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
  socket.data.playerKey = undefined;
}

function setupSockets(io) {
  io.on('connection', (socket) => {
    socket.on('create_room', ({ playerName, settings, playerKey } = {}, callback) => {
      const safeName = sanitizePlayerName(playerName);
      const safeSettings = settings && typeof settings === 'object' ? settings : {};
      const safePlayerKey = sanitizePlayerKey(playerKey, socket.id);

      if (socket.data.roomId) {
        leaveCurrentRoom(io, socket);
      }

      if (Object.keys(roomManager.getAllRooms()).length >= MAX_ACTIVE_ROOMS) {
        return callback?.({ error: 'Server is at capacity. Try again in a few minutes.' });
      }

      // Create a short room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const room = roomManager.createRoom(roomId, socket.id, safeName, { ...safeSettings, playerKey: safePlayerKey });
      
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = safePlayerKey;

      callback?.(roomManager.getSafeRoomPayload(room));
    });

    socket.on('join_room', ({ roomId, playerName, playerKey } = {}, callback) => {
      const normalizedRoomId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
      if (!normalizedRoomId) {
        return callback?.({ error: 'Room code is required' });
      }

      const safeName = sanitizePlayerName(playerName);
      const safePlayerKey = sanitizePlayerKey(playerKey, socket.id);
      if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) {
        leaveCurrentRoom(io, socket);
      }

      // Displace any existing socket that owns this playerKey in this room.
      const existingRoom = roomManager.getRoom(normalizedRoomId);
      if (existingRoom && safePlayerKey) {
        const existingPlayer = existingRoom.players.find(p => p.playerKey === safePlayerKey);
        if (existingPlayer && existingPlayer.id !== socket.id) {
          const oldSocket = io.sockets.sockets.get(existingPlayer.id);
          if (oldSocket) {
            oldSocket.emit('session_displaced');
          }
        }
      }

      const result = roomManager.joinRoom(normalizedRoomId, socket.id, safeName, safePlayerKey);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      socket.join(normalizedRoomId);
      socket.data.roomId = normalizedRoomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = safePlayerKey;

      const safeRoom = roomManager.getSafeRoomPayload(result.room);
      io.to(normalizedRoomId).emit('room_updated', safeRoom);
      emitPresenceEvent(io, normalizedRoomId, {
        type: result.rejoined ? 'rejoined' : 'joined',
        playerName: safeName,
        playerId: findPublicIdBySocket(result.room, socket.id),
      });
      callback?.({ room: safeRoom, rejoined: Boolean(result.rejoined) });
    });

    socket.on('resume_session', ({ roomId, playerName, playerKey } = {}, callback) => {
      const safeRoomId = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
      const safePlayerKey = sanitizePlayerKey(playerKey, '');
      if (!safeRoomId || !safePlayerKey) {
        return callback?.({ error: 'Missing session data' });
      }

      if (socket.data.roomId && socket.data.roomId !== safeRoomId) {
        leaveCurrentRoom(io, socket);
      }

      // Displace any existing socket that owns this playerKey in this room.
      const existingRoom = roomManager.getRoom(safeRoomId);
      if (existingRoom && safePlayerKey) {
        const existingPlayer = existingRoom.players.find(p => p.playerKey === safePlayerKey);
        if (existingPlayer && existingPlayer.id !== socket.id) {
          const oldSocket = io.sockets.sockets.get(existingPlayer.id);
          if (oldSocket) {
            oldSocket.emit('session_displaced');
          }
        }
      }

      const safeName = sanitizePlayerName(playerName);
      const result = roomManager.reconnectPlayer(safeRoomId, safePlayerKey, socket.id, safeName);
      if (result.error) {
        return callback?.({ error: result.error });
      }

      const safeRoom = roomManager.getSafeRoomPayload(result.room);
      socket.join(safeRoomId);
      socket.data.roomId = safeRoomId;
      socket.data.playerName = safeName;
      socket.data.playerKey = safePlayerKey;

      io.to(safeRoomId).emit('room_updated', safeRoom);
      emitPresenceEvent(io, safeRoomId, {
        type: 'rejoined',
        playerName: safeName,
        playerId: findPublicIdBySocket(result.room, socket.id),
      });
      callback?.({ room: safeRoom, resumed: true });

      // If the room was stuck in ROUND_ENDED with no online players before this reconnect,
      // kick off the next round now that someone is back.
      if (result.room.state === 'ROUND_ENDED' && !result.room.roundTimer) {
        setTimeout(() => {
          const currentRoom = roomManager.getRoom(safeRoomId);
          if (!currentRoom || currentRoom.state !== 'ROUND_ENDED') return;
          const updatedRoom = roomManager.prepareRound(safeRoomId);
          if (!updatedRoom) return;
          io.to(safeRoomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
          prefetchRoundWordInsight(safeRoomId);
          scheduleRoundTimer(io, safeRoomId);
        }, 1500);
      }
    });

    socket.on('leave_room', (_payload, callback) => {
      if (!socket.data.roomId) {
        callback?.({ ok: true });
        return;
      }

      leaveCurrentRoom(io, socket);
      callback?.({ ok: true });
    });

    socket.on('chat_message', ({ text } = {}) => {
      const roomId = socket.data.roomId;
      const safeText = sanitizeChatText(text);
      if (!safeText) return;
      if (roomId) {
        io.to(roomId).emit('chat_message', {
          id: Date.now().toString(),
          roomId,
          sender: socket.data.playerName,
          text: safeText,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('report_word', async ({ category, reasonText, clientVersion, reportedWord, reportedWords } = {}, callback) => {
      const roomId = socket.data.roomId;
      if (!roomId) {
        return callback?.({ error: 'Not in a room.' });
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        return callback?.({ error: 'Room not found.' });
      }

      if (room.state !== 'GAME_OVER') {
        return callback?.({ error: 'Word can be reported only after the match ends.' });
      }

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) {
        return callback?.({ error: 'Only players from this match can submit reports.' });
      }

      const playerKey = socket.data.playerKey || player.playerKey || '';
      if (!playerKey) {
        return callback?.({ error: 'Session key missing. Please refresh and try again.' });
      }

      const requestedWords = sanitizeReportedWords(reportedWords, reportedWord || room.targetWord);
      if (!requestedWords.length) {
        return callback?.({ error: 'Please select at least one word to report.' });
      }

      const matchWords = new Set((room.usedWords || []).map((word) => String(word || '').toUpperCase()));
      const wordRoundMap = new Map(
        (room.usedWords || []).map((word, index) => [String(word || '').toUpperCase(), index + 1])
      );
      const invalidSelection = requestedWords.some((word) => !matchWords.has(word));
      if (invalidSelection) {
        return callback?.({ error: 'One or more selected words are invalid for this match.' });
      }

      const invalidLength = requestedWords.some((word) => word.length < 4 || word.length > 6);
      if (invalidLength) {
        return callback?.({ error: 'One or more selected words have invalid length.' });
      }

      const userRateKey = `${roomId}:${player.playerKey || player.id}`;
      const ipRateKey = `${roomId}:${getClientIp(socket)}`;

      const accepted = [];
      const duplicates = [];
      const rejected = [];

      for (const word of requestedWords) {
        const byUser = consumeRateLimit(reportUserRateLimit, userRateKey, WORD_REPORT_MAX_PER_WINDOW, WORD_REPORT_WINDOW_MS);
        if (!byUser.allowed) {
          const retrySeconds = Math.max(1, Math.ceil((byUser.resetAt - Date.now()) / 1000));
          return callback?.({
            error: `Too many reports. Try again in ${retrySeconds}s.`,
            accepted,
            duplicates,
            rejected: [...rejected, word],
          });
        }

        const byIp = consumeRateLimit(reportIpRateLimit, ipRateKey, WORD_REPORT_MAX_PER_WINDOW * 2, WORD_REPORT_WINDOW_MS);
        if (!byIp.allowed) {
          const retrySeconds = Math.max(1, Math.ceil((byIp.resetAt - Date.now()) / 1000));
          return callback?.({
            error: `Too many reports from this network. Try again in ${retrySeconds}s.`,
            accepted,
            duplicates,
            rejected: [...rejected, word],
          });
        }

        const saveResult = await saveWordReport({
          reportedWord: word,
          category: sanitizeCategory(category),
          reasonText: sanitizeReasonText(reasonText).slice(0, REPORT_REASON_MAX_LENGTH),
          playerPublicId: player.publicId || 'unknown-player',
          playerName: player.name || 'Player',
          playerKey,
          ipAddress: getClientIp(socket),
          roomId,
          currentRound: wordRoundMap.get(word) || room.currentRound,
          numRounds: room.settings.numRounds,
          wordLength: word.length,
          matchStateAtReport: room.state,
          userAgent: socket?.handshake?.headers?.['user-agent'] || '',
          clientVersion,
        });

        if (saveResult.unavailable) {
          return callback?.({ error: saveResult.message });
        }

        if (saveResult.duplicate) {
          duplicates.push(word);
          continue;
        }

        if (!saveResult.ok) {
          rejected.push(word);
          continue;
        }

        accepted.push(word);
      }

      if (!accepted.length && duplicates.length) {
        return callback?.({
          error: 'Selected words were already reported by you for this match.',
          accepted,
          duplicates,
          rejected,
        });
      }

      if (!accepted.length) {
        return callback?.({
          error: 'Unable to submit selected word reports right now.',
          accepted,
          duplicates,
          rejected,
        });
      }

      return callback?.({
        ok: true,
        accepted,
        duplicates,
        rejected,
        reportCount: accepted.length,
      });
    });

    socket.on('submit_guess', async ({ guess } = {}, callback) => {
      const roomId = socket.data.roomId;
      if (!roomId) return callback?.({ error: 'Not in a room' });

      const room = roomManager.getRoom(roomId);
      if (!room || room.state !== 'IN_ROUND') return callback?.({ error: 'Round not active' });

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return callback?.({ error: 'Player not found' });
      if (player.isGuessing) {
        return callback?.({ error: 'Guess already in progress' });
      }
      if (player.hasGuessedCorrectly || player.guesses.length >= 6) {
        return callback?.({ error: 'Cannot guess anymore' });
      }

      player.isGuessing = true;

      try {
        const normalizedGuess = (guess || '').toUpperCase().trim();

        if (normalizedGuess.length !== room.settings.wordLength) {
          return callback?.({ error: 'Invalid word length' });
        }

        const validWord = isValidWordSync(normalizedGuess) || await isValidWord(normalizedGuess, room.settings.wordLength);
        if (!validWord) {
          return callback?.({ error: 'Word does not exist' });
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
        callback?.({ statuses: statusArr });

        io.to(roomId).emit('player_updated', {
          player: roomManager.getSafePlayerPayload(player),
        });

        // Ignore offline players when deciding whether the round can end.
        tryEndRoundIfEligible(io, roomId);
      } finally {
        player.isGuessing = false;
      }
    });

    socket.on('start_game', (callback) => {
      const roomId = socket.data.roomId;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        callback?.({ error: 'Room not found' });
        return;
      }

      if (room.ownerId !== socket.id) {
        callback?.({ error: 'Only the room leader can start a match.' });
        return;
      }

      if (!(room.state === 'LOBBY' || room.state === 'GAME_OVER')) {
        callback?.({ error: 'Match cannot be started right now.' });
        return;
      }

      roomManager.resetMatch(roomId);
      const updatedRoom = roomManager.prepareRound(roomId);
      io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
      prefetchRoundWordInsight(roomId);
      scheduleRoundTimer(io, roomId);
      callback?.({ ok: true });
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

      // Don't advance if nobody is online — wait for someone to reconnect.
      const onlinePlayers = currentRoom.players.filter(p => p.isOnline);
      if (onlinePlayers.length === 0) return;

      const updatedRoom = roomManager.prepareRound(roomId);
      if (!updatedRoom) return;
      io.to(roomId).emit('round_started', roomManager.getSafeRoomPayload(updatedRoom));
      prefetchRoundWordInsight(roomId);
      scheduleRoundTimer(io, roomId);
    }, 4000);
  }
}

module.exports = { setupSockets };
