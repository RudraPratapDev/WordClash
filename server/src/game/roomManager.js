const { getRandomWord, getWordPool } = require('./wordList');

const AVATAR_SET = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦉', '🐨', '🐬', '🦄', '🐺', '🦜', '🦋', '🐢', '🦝', '🐻'];

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
  const wordLength = Math.min(Math.max(settings.wordLength || 5, 4), 6);
  const availableWords = getWordPool(wordLength).length;
  const requestedRounds = Math.min(Math.max(settings.numRounds || 3, 1), 10);

  // Ensure default limits
  const sanitizedSettings = {
    maxPlayers: Math.min(Math.max(settings.maxPlayers || 4, 2), 8),
    wordLength,
    numRounds: Math.min(requestedRounds, availableWords),
    timeLimit: settings.timeLimit || 60, // 0 for unlimited
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
  };

  room.players.push({
    id: ownerId,
    name: ownerName,
    score: 0,
    isReady: false,
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

function joinRoom(roomId, playerId, playerName) {
  const room = rooms[roomId];
  if (!room) return { error: 'Room not found' };
  
  if (room.players.length >= room.settings.maxPlayers) {
    return { error: 'Room is full' };
  }

  // Check if player already in room
  const exists = room.players.find(p => p.id === playerId);
  if (!exists) {
    room.players.push({
      id: playerId,
      name: playerName,
      score: 0,
      isReady: false,
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
    delete rooms[roomId];
    return null; // Room deleted
  }
  
  // Reassign owner if owner left
  if (room.ownerId === playerId) {
    room.ownerId = room.players[0].id;
  }
  
  return room;
}

function prepareRound(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  room.currentRound += 1;
  room.targetWord = getRandomWord(room.settings.wordLength, room.usedWords);
  room.usedWords.push(room.targetWord);
  room.roundEnding = false;
  
  // Reset player round states
  room.players.forEach(p => {
    p.guesses = [];
    p.hasGuessedCorrectly = false;
  });
  
  room.state = 'IN_ROUND';
  room.roundStartTime = Date.now();
  
  return room;
}

function resetMatch(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  room.currentRound = 0;
  room.targetWord = '';
  room.usedWords = [];
  room.roundEnding = false;
  room.state = 'LOBBY';

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
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
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
  prepareRound,
  resetMatch,
  getSafeRoomPayload
};
