const { getRandomWord, getWordPool } = require('./wordList');

const RECONNECT_GRACE_MS = 30000;

const AVATAR_SET = ['AX', 'BR', 'CT', 'DV', 'EL', 'FN', 'GK', 'HM', 'IR', 'JS', 'KV', 'LW', 'MX', 'NY', 'PZ', 'QR'];

function createPublicId() {
  return `u_${Math.random().toString(36).slice(2, 10)}`;
}

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickAvatar(room, playerId) {
  const taken = new Set(room.players.map(player => player.avatar).filter(Boolean));
  const startIndex = hashString(`${room.id}:${playerId}`) % AVATAR_SET.length;

  for (let offset = 0; offset < AVATAR_SET.length; offset++) {
    const candidate = AVATAR_SET[(startIndex + offset) % AVATAR_SET.length];
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return AVATAR_SET[startIndex];
}

// rooms = {
//   [roomId]: {
//     id: 'room123',
//     ownerId: 'socketId',
//     settings: { maxPlayers: 4, wordLength: 5, numRounds: 3, timeLimit: 60 },
//     state: 'LOBBY', // LOBBY, IN_ROUND, ROUND_ENDED, GAME_OVER
//     players: [ { id, name, score, isReady, status } ],
//     currentRound: 0,
//     targetWord: '',
//     roundStartTime: null,
//     timerInterval: null
//   }
// }
const rooms = {};

function createRoom(roomId, ownerId, ownerName, settings) {
  const timeLimit = Math.min(Math.max(Number(settings.timeLimit || 120), 15), 600);
  const wordLength = Math.min(Math.max(settings.wordLength || 5, 4), 6);
  const availableWords = getWordPool(wordLength).length;
  const requestedRounds = Math.min(Math.max(settings.numRounds || 3, 1), 10);

  // Ensure default limits
  const sanitizedSettings = {
    maxPlayers: Math.min(Math.max(settings.maxPlayers || 4, 2), 8),
    wordLength,
    numRounds: Math.min(requestedRounds, availableWords),
    timeLimit,
  };

  const room = {
    id: roomId,
    ownerId,
    settings: sanitizedSettings,
    state: 'LOBBY',
    players: [],
    currentRound: 0,
    targetWord: '',
    usedWords: [],
    roundEnding: false,
    roundStartTime: null,
    roundEndsAt: null,
    roundTimer: null,
    prefetchedWordInfo: null,
  };

  room.players.push({
    id: ownerId,
    publicId: createPublicId(),
    playerKey: settings.playerKey || ownerId,
    name: ownerName,
    score: 0,
    isReady: false,
    isOnline: true,
    disconnectedAt: null,
    disconnectTimer: null,
    guesses: [],
    hasGuessedCorrectly: false,
    avatar: pickAvatar(room, ownerId),
  });

  rooms[roomId] = room;
  return rooms[roomId];
}

function getRoom(roomId) {
  return rooms[roomId];
}

function joinRoom(roomId, playerId, playerName, playerKey) {
  const room = rooms[roomId];
  if (!room) return { error: 'Room not found' };

  const existingByKey = room.players.find(p => p.playerKey && p.playerKey === playerKey);
  if (existingByKey) {
    if (existingByKey.disconnectTimer) {
      clearTimeout(existingByKey.disconnectTimer);
      existingByKey.disconnectTimer = null;
    }

    const oldId = existingByKey.id;
    existingByKey.id = playerId;
    existingByKey.name = playerName || existingByKey.name;
    existingByKey.isOnline = true;
    existingByKey.disconnectedAt = null;

    if (room.ownerId === oldId) {
      room.ownerId = playerId;
    }

    return { room, rejoined: true };
  }
  
  if (room.players.length >= room.settings.maxPlayers) {
    return { error: 'Room is full' };
  }

  // Check if player already in room
  const exists = room.players.find(p => p.id === playerId);
  if (!exists) {
    room.players.push({
      id: playerId,
      publicId: createPublicId(),
      playerKey,
      name: playerName,
      score: 0,
      isReady: false,
      isOnline: true,
      disconnectedAt: null,
      disconnectTimer: null,
      guesses: [],
      hasGuessedCorrectly: false,
      avatar: pickAvatar(room, playerId),
    });
  }
  
  return { room };
}

function leaveRoom(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return null;
  
  room.players = room.players.filter(p => p.id !== playerId);
  
  if (room.players.length === 0) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    delete rooms[roomId];
    return null; // Room deleted
  }
  
  // Reassign owner if owner left
  if (room.ownerId === playerId) {
    room.ownerId = room.players[0].id;
  }
  
  return room;
}

function reconnectPlayer(roomId, playerKey, playerId, playerName) {
  const room = rooms[roomId];
  if (!room) return { error: 'Room not found' };

  const player = room.players.find(p => p.playerKey === playerKey);
  if (!player) return { error: 'Session expired' };

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  const oldId = player.id;
  player.id = playerId;
  player.name = playerName || player.name;
  player.isOnline = true;
  player.disconnectedAt = null;

  if (room.ownerId === oldId) {
    room.ownerId = playerId;
  }

  return { room, player };
}

function markPlayerDisconnected(roomId, playerId, onExpired) {
  const room = rooms[roomId];
  if (!room) return null;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return room;

  player.isOnline = false;
  player.disconnectedAt = Date.now();

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
  }

  player.disconnectTimer = setTimeout(() => {
    const currentRoom = rooms[roomId];
    if (!currentRoom) return;

    const target = currentRoom.players.find(p => p.playerKey === player.playerKey);
    if (!target || target.isOnline) return;

    currentRoom.players = currentRoom.players.filter(p => p.playerKey !== target.playerKey);

    if (currentRoom.players.length === 0) {
      if (currentRoom.roundTimer) {
        clearTimeout(currentRoom.roundTimer);
        currentRoom.roundTimer = null;
      }
      delete rooms[roomId];
      return;
    }

    if (currentRoom.ownerId === target.id) {
      currentRoom.ownerId = currentRoom.players[0].id;
    }

    if (typeof onExpired === 'function') {
      onExpired(currentRoom, target);
    }
  }, RECONNECT_GRACE_MS);

  return room;
}

function prepareRound(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  room.currentRound += 1;
  room.targetWord = getRandomWord(room.settings.wordLength, room.usedWords);
  room.usedWords.push(room.targetWord);
  room.prefetchedWordInfo = null;
  room.roundEnding = false;
  
  // Reset player round states
  room.players.forEach(p => {
    p.guesses = [];
    p.hasGuessedCorrectly = false;
  });
  
  room.state = 'IN_ROUND';
  room.roundStartTime = Date.now();
  room.roundEndsAt = room.roundStartTime + room.settings.timeLimit * 1000;
  
  return room;
}

function resetMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  room.currentRound = 0;
  room.targetWord = '';
  room.usedWords = [];
  room.roundEnding = false;
  room.prefetchedWordInfo = null;
  room.state = 'LOBBY';
  room.roundStartTime = null;
  room.roundEndsAt = null;

  room.players.forEach(p => {
    p.score = 0;
    p.guesses = [];
    p.hasGuessedCorrectly = false;
  });

  return room;
}

// Map the player object to safely emit to clients (hide guesses' letters if not strictly needed, but client needs color results)
// The actual word is NEVER sent to the client. Color results are tracked as an array of 'correct', 'present', 'absent' arrays.
function getSafeRoomPayload(room) {
  if (!room) return null;
  return {
    id: room.id,
    ownerId: room.ownerId,
    settings: room.settings,
    state: room.state,
    currentRound: room.currentRound,
    roundEndsAt: room.roundEndsAt,
    players: room.players.map(p => ({
      id: p.id,
      publicId: p.publicId,
      name: p.name,
      avatar: p.avatar,
      isOnline: p.isOnline,
      score: p.score,
      isReady: p.isReady,
      guessStatuses: p.guesses, // This just contains color arrays, no letters
      hasGuessedCorrectly: p.hasGuessedCorrectly
    }))
  };
}

module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  reconnectPlayer,
  markPlayerDisconnected,
  prepareRound,
  resetMatch,
  getSafeRoomPayload
};
