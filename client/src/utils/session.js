const PLAYER_KEY_STORAGE = 'wordclash.playerKey';
const SESSION_STORAGE = 'wordclash.session';

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
  localStorage.setItem(SESSION_STORAGE, JSON.stringify(data));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE);
}
