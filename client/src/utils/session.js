const PLAYER_KEY_STORAGE = 'wordclash.playerKey';
const SESSION_STORAGE = 'wordclash.session';
const PLAYER_NAME_STORAGE = 'wordclash.playerName';
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

function generatePlayerKey() {
  return `pk_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function getPlayerKey() {
  let key = localStorage.getItem(PLAYER_KEY_STORAGE);
  if (!key) {
    key = generatePlayerKey();
    localStorage.setItem(PLAYER_KEY_STORAGE, key);
  }
  return key;
}

export function saveSession(data) {
  localStorage.setItem(SESSION_STORAGE, JSON.stringify({ ...data, savedAt: Date.now() }));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Treat sessions older than 2 hours as expired — server room is gone by then anyway.
    if (parsed?.savedAt && Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_STORAGE);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE);
}

export function getSavedPlayerName() {
  return localStorage.getItem(PLAYER_NAME_STORAGE) || '';
}

export function savePlayerName(name) {
  if (name && typeof name === 'string') {
    localStorage.setItem(PLAYER_NAME_STORAGE, name.trim());
  }
}
