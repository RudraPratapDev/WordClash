const { getRandomWord, getWordPool } = require('./wordList');

const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 30000);
const IDLE_ROOM_TTL_MS = Number(process.env.IDLE_ROOM_TTL_MS || 30 * 60 * 1000);
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 10 * 60 * 1000);

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

function markRoomDirty(room) {
  if (!room) return;
  room.lastActivityAt = Date.now();
  room._payloadVersion = (room._payloadVersion || 0) + 1;
  room._safePayload = null;
  room._safePayloadVersion = -1;
}

function destroyRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  room.players.forEach((player) => {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
  });

  delete rooms[roomId];
}

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
    lastActivityAt: Date.now(),
    _payloadVersion: 0,
    _safePayloadVersion: -1,
    _safePayload: null,
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
    isGuessing: false,
    avatar: pickAvatar(room, ownerId),
  });

  rooms[roomId] = room;
  markRoomDirty(rooms[roomId]);
  return rooms[roomId];
}

function getRoom(roomId) {
  return rooms[roomId];
}

function getAllRooms() {
  return rooms;
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

    markRoomDirty(room);
    return { room, rejoined: true };
  }

  // New players can only join while the room is in lobby state.
  if (room.state !== 'LOBBY') {
    return { error: 'Match already started. Wait for a new lobby.' };
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
      isGuessing: false,
      avatar: pickAvatar(room, playerId),
    });
    markRoomDirty(room);
  }
  
  return { room };
}

function leaveRoom(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return null;

  const leavingPlayer = room.players.find((player) => player.id === playerId);
  if (leavingPlayer?.disconnectTimer) {
    clearTimeout(leavingPlayer.disconnectTimer);
    leavingPlayer.disconnectTimer = null;
  }
  
  room.players = room.players.filter(p => p.id !== playerId);
  
  if (room.players.length === 0) {
    destroyRoom(roomId);
    return null; // Room deleted
  }
  
  // Reassign owner if owner left
  if (room.ownerId === playerId) {
    room.ownerId = room.players[0].id;
  }

  markRoomDirty(room);
  
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

  markRoomDirty(room);
  return { room, player };
}

function markPlayerDisconnected(roomId, playerId, onExpired) {
  const room = rooms[roomId];
  if (!room) return null;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return room;

  player.isOnline = false;
  player.disconnectedAt = Date.now();
  markRoomDirty(room);

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
      destroyRoom(roomId);
      return;
    }

    if (currentRoom.ownerId === target.id) {
      currentRoom.ownerId = currentRoom.players[0].id;
    }

    markRoomDirty(currentRoom);

    if (typeof onExpired === 'function') {
      onExpired(currentRoom, target);
    }
  }, RECONNECT_GRACE_MS);

  return room;
}

function prepareRound(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  // Don't start a round if nobody is online — room will be cleaned up naturally.
  const onlinePlayers = room.players.filter(p => p.isOnline);
  if (onlinePlayers.length === 0) return null;

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
    p.isGuessing = false;
  });
  
  room.state = 'IN_ROUND';
  room.roundStartTime = Date.now();
  room.roundEndsAt = room.roundStartTime + room.settings.timeLimit * 1000;
  markRoomDirty(room);
  
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
    p.isGuessing = false;
  });

  markRoomDirty(room);

  return room;
}

function getSafePlayerPayload(player) {
  if (!player) return null;

  return {
    id: player.id,
    publicId: player.publicId,
    name: player.name,
    avatar: player.avatar,
    isOnline: player.isOnline,
    score: player.score,
    isReady: player.isReady,
    guessStatuses: player.guesses,
    hasGuessedCorrectly: player.hasGuessedCorrectly,
  };
}

// Map the player object to safely emit to clients (hide guesses' letters if not strictly needed, but client needs color results)
// The actual word is NEVER sent to the client. Color results are tracked as an array of 'correct', 'present', 'absent' arrays.
function getSafeRoomPayload(room) {
  if (!room) return null;

  if (room._safePayload && room._safePayloadVersion === room._payloadVersion) {
    return room._safePayload;
  }

  const completedWords = room.state === 'IN_ROUND'
    ? room.usedWords.slice(0, -1)
    : room.usedWords.slice();

  const payload = {
    id: room.id,
    ownerId: room.ownerId,
    settings: room.settings,
    state: room.state,
    currentRound: room.currentRound,
    roundEndsAt: room.roundEndsAt,
    completedWords,
    players: room.players.map(getSafePlayerPayload)
  };

  room._safePayload = payload;
  room._safePayloadVersion = room._payloadVersion;
  return payload;

}

const ROOM_CLEANUP_HANDLE_KEY = '__wordClashRoomCleanupInterval';

if (!global[ROOM_CLEANUP_HANDLE_KEY]) {
  const roomCleanupInterval = setInterval(() => {
    const now = Date.now();

    Object.entries(rooms).forEach(([roomId, room]) => {
      const isIdleState = room.state === 'LOBBY' || room.state === 'GAME_OVER';
      if (!isIdleState) return;

      const lastActivity = room.lastActivityAt || 0;
      if (now - lastActivity <= IDLE_ROOM_TTL_MS) return;

      destroyRoom(roomId);
    });
  }, ROOM_CLEANUP_INTERVAL_MS);

  if (typeof roomCleanupInterval.unref === 'function') {
    roomCleanupInterval.unref();
  }

  global[ROOM_CLEANUP_HANDLE_KEY] = roomCleanupInterval;
}

module.exports = {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  leaveRoom,
  reconnectPlayer,
  markPlayerDisconnected,
  prepareRound,
  resetMatch,
  getSafeRoomPayload,
  getSafePlayerPayload,
  markRoomDirty,
  destroyRoom,
};
