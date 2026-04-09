import { create } from 'zustand';

const useGameStore = create((set, get) => ({
  playerName: '',
  roomId: null,
  room: null,
  chat: [],
  roundState: 'LOBBY',
  lastTargetWord: '',
  isDarkMode: false,

  setPlayerName: (name) => set({ playerName: name }),
  setRoom: (room) => set({ room, roomId: room.id, roundState: room.state }),
  setRoundState: (state, targetWord = '') => set({ roundState: state, lastTargetWord: targetWord }),
  addChatMessage: (msg) => set((state) => ({ chat: [...state.chat, msg] })),
  
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
