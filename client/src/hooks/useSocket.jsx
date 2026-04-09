import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import useGameStore from '../store/useGameStore';
import { clearSession, getSession } from '../utils/session';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});

export function useSocket() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const { setRoom, addChatMessage, setRoundState } = useGameStore();

  useEffect(() => {
    socket.connect();

    function onConnect() {
      setIsConnected(true);

      const session = getSession();
      if (session?.roomId && session?.playerKey) {
        socket.emit('resume_session', session, (response) => {
          if (response?.error) {
            clearSession();
            return;
          }

          if (response?.room) {
            setRoom(response.room);
            setRoundState(response.room.state, '');
          }
        });
      }
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomUpdated(room) {
      setRoom(room);
    }

    function onRoundStarted(room) {
      setRoom(room);
      setRoundState('IN_ROUND', '');
    }

    function onRoundEnded({ room, targetWord }) {
      setRoom(room);
      setRoundState(room.state, targetWord);
    }

    function onChatMessage(msg) {
      addChatMessage(msg);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_updated', onRoomUpdated);
    socket.on('round_started', onRoundStarted);
    socket.on('round_ended', onRoundEnded);
    socket.on('chat_message', onChatMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_updated', onRoomUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_ended', onRoundEnded);
      socket.off('chat_message', onChatMessage);
      socket.disconnect();
    };
  }, []);

  return { isConnected, socket };
}
