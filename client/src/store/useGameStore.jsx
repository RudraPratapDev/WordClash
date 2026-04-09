import { create } from 'zustand';

const useGameStore = create((set, get) => ({
  playerName: '',
  roomId: null,
  room: null,
  chat: [],
  toasts: [],
  roundState: 'LOBBY',
  lastTargetWord: '',
  lastWordInfo: null,
  isDarkMode: false,

  setPlayerName: (name) => set({ playerName: name }),
  setRoom: (room) => set({ room, roomId: room.id, roundState: room.state }),
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
  
  toggleTheme: () => set((state) => {
    const isDark = !state.isDarkMode;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { isDarkMode: isDark };
  }),
}));

export default useGameStore;
