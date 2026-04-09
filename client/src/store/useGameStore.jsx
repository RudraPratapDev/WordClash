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
