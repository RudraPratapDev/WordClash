import { create } from 'zustand';

const THEME_STORAGE = 'wordclash.theme';

function applyThemeClass(isDark) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', Boolean(isDark));
}

function readInitialDarkMode() {
  if (typeof window === 'undefined') return false;

  try {
    const saved = window.localStorage.getItem(THEME_STORAGE);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {
    // Ignore storage access errors and fall back to media preference.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const initialDarkMode = readInitialDarkMode();
applyThemeClass(initialDarkMode);

const useGameStore = create((set) => ({
  playerName: '',
  roomId: null,
  room: null,
  matchMode: 'multiplayer',
  chat: [],
  toasts: [],
  roundState: 'LOBBY',
  lastTargetWord: '',
  lastWordInfo: null,
  isDarkMode: initialDarkMode,
  resumePrompt: null,      // session data to resume, or null
  displacedPrompt: false,  // true when kicked by another tab
  restoredGuesses: null,   // full { word, statuses }[] restored from session on resume
  takeoverPrompt: null,    // session data when a new tab detects an active session
  pendingGuesses: [],      // current round guesses persisted for cross-reload restore

  setPlayerName: (name) => set({ playerName: name }),
  setMatchMode: (mode) => set({ matchMode: mode === 'solo' ? 'solo' : 'multiplayer' }),
  setResumePrompt: (session) => set({ resumePrompt: session }),
  clearResumePrompt: () => set({ resumePrompt: null }),
  setDisplacedPrompt: (val) => set({ displacedPrompt: val }),
  clearDisplacedPrompt: () => set({ displacedPrompt: false }),
  setRestoredGuesses: (guesses) => set({ restoredGuesses: guesses }),
  clearRestoredGuesses: () => set({ restoredGuesses: null }),
  setPendingGuesses: (guesses) => set({ pendingGuesses: guesses }),
  clearPendingGuesses: () => set({ pendingGuesses: [] }),
  setTakeoverPrompt: (session) => set({ takeoverPrompt: session }),
  clearTakeoverPrompt: () => set({ takeoverPrompt: null }),
  setRoom: (room) => set((state) => {
    if (!room) {
      return {
        room: null,
        roomId: null,
        matchMode: 'multiplayer',
        roundState: 'LOBBY',
        chat: [],
        lastTargetWord: '',
        lastWordInfo: null,
      };
    }

    const switchedRoom = Boolean(state.roomId && state.roomId !== room.id);
    return {
      room,
      roomId: room.id,
      roundState: room.state,
      chat: switchedRoom ? [] : state.chat,
    };
  }),
  updateRoomPlayer: (incomingPlayer) => set((state) => {
    if (!state.room || !incomingPlayer) return {};

    const nextPlayers = state.room.players.map((player) => {
      const samePublicId = incomingPlayer.publicId && player.publicId === incomingPlayer.publicId;
      const sameId = player.id === incomingPlayer.id;
      if (!samePublicId && !sameId) return player;
      return { ...player, ...incomingPlayer };
    });

    return {
      room: {
        ...state.room,
        players: nextPlayers,
      },
    };
  }),
  setRoundState: (state, targetWord = '', wordInfo = null) => set({
    roundState: state,
    lastTargetWord: targetWord,
    lastWordInfo: wordInfo,
  }),
  setWordInsight: (targetWord, wordInfo) => set((state) => {
    if (!targetWord || targetWord !== state.lastTargetWord) return {};
    return { lastWordInfo: wordInfo };
  }),
  addChatMessage: (msg) => set((state) => ({ chat: [...state.chat, msg] })),
  clearChat: () => set({ chat: [] }),
  clearRoom: () => set({
    room: null,
    roomId: null,
    matchMode: 'multiplayer',
    roundState: 'LOBBY',
    chat: [],
    lastTargetWord: '',
    lastWordInfo: null,
    resumePrompt: null,
    displacedPrompt: false,
    restoredGuesses: null,
    takeoverPrompt: null,
    pendingGuesses: [],
  }),
  pushToast: (message, tone = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, tone }],
    }));
    return id;
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((toast) => toast.id !== id),
  })),
  clearToasts: () => set({ toasts: [] }),
  
  toggleTheme: () => set((state) => {
    const isDark = !state.isDarkMode;
    applyThemeClass(isDark);
    try {
      window.localStorage.setItem(THEME_STORAGE, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage access errors.
    }
    return { isDarkMode: isDark };
  }),
}));

export default useGameStore;
