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
  const { setRoom, addChatMessage, setRoundState, setWordInsight, pushToast } = useGameStore();

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

    function onRoundEnded({ room, targetWord, wordInfo }) {
      setRoom(room);
      setRoundState(room.state, targetWord, wordInfo || null);
    }

    function onWordInsight({ targetWord, wordInfo }) {
      if (!targetWord || !wordInfo) return;
      setWordInsight(targetWord, wordInfo);
    }

    function onPresenceEvent(event) {
      const state = useGameStore.getState();
      const currentRoom = state.room;
      if (!currentRoom || !event) return;

      const me = currentRoom.players.find((player) => player.id === socket.id);
      if (event.playerId && me?.publicId && event.playerId === me.publicId) {
        return;
      }

      if (event.type === 'joined' && currentRoom.state === 'LOBBY') {
        pushToast(`${event.playerName} joined the room.`, 'info');
        return;
      }

      if (event.type === 'rejoined') {
        pushToast(`${event.playerName} is back online.`, 'good');
        return;
      }

      if (event.type === 'offline') {
        pushToast(`${event.playerName} went offline. 30s reconnect window started.`, 'warn');
        return;
      }

      if (event.type === 'expired') {
        pushToast(`${event.playerName} did not return in time and was removed.`, 'warn');
      }
    }

    function onChatMessage(msg) {
      addChatMessage(msg);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_updated', onRoomUpdated);
    socket.on('round_started', onRoundStarted);
    socket.on('round_ended', onRoundEnded);
    socket.on('word_insight', onWordInsight);
    socket.on('chat_message', onChatMessage);
    socket.on('presence_event', onPresenceEvent);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_updated', onRoomUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_ended', onRoundEnded);
      socket.off('word_insight', onWordInsight);
      socket.off('chat_message', onChatMessage);
      socket.off('presence_event', onPresenceEvent);
      socket.disconnect();
    };
  }, []);

  return { isConnected, socket };
}
