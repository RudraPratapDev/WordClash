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
  const setRoom = useGameStore((state) => state.setRoom);
  const addChatMessage = useGameStore((state) => state.addChatMessage);
  const setMatchMode = useGameStore((state) => state.setMatchMode);
  const setRoundState = useGameStore((state) => state.setRoundState);
  const setWordInsight = useGameStore((state) => state.setWordInsight);
  const updateRoomPlayer = useGameStore((state) => state.updateRoomPlayer);
  const pushToast = useGameStore((state) => state.pushToast);
  const clearRoom = useGameStore((state) => state.clearRoom);
  const setResumePrompt = useGameStore((state) => state.setResumePrompt);
  const setDisplacedPrompt = useGameStore((state) => state.setDisplacedPrompt);
  const setTakeoverPrompt = useGameStore((state) => state.setTakeoverPrompt);

  useEffect(() => {
    // Only show session prompts on the very first connect, not on socket.io auto-reconnects.
    let sessionHandled = false;

    socket.connect();

    function onConnect() {
      setIsConnected(true);

      // If we already have an active room in store, this is an auto-reconnect mid-session — skip prompts.
      if (useGameStore.getState().roomId) return;

      // Only handle session once per page load.
      if (sessionHandled) return;
      sessionHandled = true;

      const path = (window.location.pathname || '').toLowerCase();
      const session = getSession();
      if (!session?.roomId || !session?.playerKey) return;

      setMatchMode(session.matchMode === 'solo' ? 'solo' : 'multiplayer');

      if (path.startsWith('/room/') || path === '/game') {
        setResumePrompt(session);
      } else {
        setTakeoverPrompt(session);
      }
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onSessionDisplaced() {
      clearSession();
      // Don't clearRoom yet — Game.jsx watches room and would navigate away.
      // Just set the flag; the prompt overlay will handle navigation.
      setDisplacedPrompt(true);
    }

    function onRoomUpdated(room) {
      const activeRoomId = useGameStore.getState().roomId;
      if (!activeRoomId || room?.id !== activeRoomId) return;
      setRoom(room);
    }

    function onRoundStarted(room) {
      const activeRoomId = useGameStore.getState().roomId;
      if (!activeRoomId || room?.id !== activeRoomId) return;
      setRoom(room);
      setRoundState('IN_ROUND', '');
    }

    function onRoundEnded({ room, targetWord, wordInfo }) {
      const activeRoomId = useGameStore.getState().roomId;
      if (!activeRoomId || room?.id !== activeRoomId) return;
      setRoom(room);
      setRoundState(room.state, targetWord, wordInfo || null);
    }

    function onPlayerUpdated({ player }) {
      const activeRoomId = useGameStore.getState().roomId;
      if (!activeRoomId) return;
      if (!player) return;
      updateRoomPlayer(player);
    }

    function onWordInsight({ targetWord, wordInfo }) {
      if (!targetWord || !wordInfo) return;
      setWordInsight(targetWord, wordInfo);
    }

    function onPresenceEvent(event) {
      const state = useGameStore.getState();
      if (!event?.roomId || !state.roomId || event.roomId !== state.roomId) return;

      // If we've been displaced, suppress all presence toasts — we're leaving anyway.
      if (state.displacedPrompt) return;

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
      const state = useGameStore.getState();
      if (!msg?.roomId || !state.roomId || msg.roomId !== state.roomId) return;
      addChatMessage(msg);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session_displaced', onSessionDisplaced);
    socket.on('room_updated', onRoomUpdated);
    socket.on('round_started', onRoundStarted);
    socket.on('round_ended', onRoundEnded);
    socket.on('player_updated', onPlayerUpdated);
    socket.on('word_insight', onWordInsight);
    socket.on('chat_message', onChatMessage);
    socket.on('presence_event', onPresenceEvent);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session_displaced', onSessionDisplaced);
      socket.off('room_updated', onRoomUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_ended', onRoundEnded);
      socket.off('player_updated', onPlayerUpdated);
      socket.off('word_insight', onWordInsight);
      socket.off('chat_message', onChatMessage);
      socket.off('presence_event', onPresenceEvent);
      socket.disconnect();
    };
  }, []);

  return { isConnected, socket };
}
