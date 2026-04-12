import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import { clearSession, saveSession } from '../utils/session';

/**
 * Renders session-related prompts:
 * 1. Resume prompt   — reload on /game or /room, asks to continue or go home
 * 2. Takeover prompt — new tab on /, asks to continue here (displacing old tab) or ignore
 * 3. Displaced prompt — old tab got kicked, informs user and sends them home
 *
 * Only one is ever visible at a time. Priority: displaced > resume > takeover.
 */
export default function SessionPrompts() {
  const resumePrompt = useGameStore((state) => state.resumePrompt);
  const displacedPrompt = useGameStore((state) => state.displacedPrompt);
  const takeoverPrompt = useGameStore((state) => state.takeoverPrompt);
  const clearResumePrompt = useGameStore((state) => state.clearResumePrompt);
  const clearDisplacedPrompt = useGameStore((state) => state.clearDisplacedPrompt);
  const clearTakeoverPrompt = useGameStore((state) => state.clearTakeoverPrompt);
  const setRoom = useGameStore((state) => state.setRoom);
  const setRoundState = useGameStore((state) => state.setRoundState);
  const setMatchMode = useGameStore((state) => state.setMatchMode);
  const clearRoom = useGameStore((state) => state.clearRoom);
  const navigate = useNavigate();

  // ── Resume (reload) ──────────────────────────────────────────────
  const handleResume = () => {
    const session = resumePrompt;
    clearResumePrompt();
    setMatchMode(session.matchMode === 'solo' ? 'solo' : 'multiplayer');

    socket.emit('resume_session', session, (response) => {
      if (response?.error) {
        clearSession();
        clearRoom();
        // Show a friendly message if the room expired rather than silently going home.
        useGameStore.getState().pushToast(
          response.error === 'Room not found' || response.error === 'Session expired'
            ? 'Your previous session has expired.'
            : response.error,
          'warn'
        );
        navigate('/');
        return;
      }
      if (response?.room) {
        setRoom(response.room);
        const me = response.room.players.find((p) => p.id === socket.id);
        // Restore full guesses (with letters) from session if available, else fall back to server statuses.
        const sessionGuesses = session.pendingGuesses;
        if (sessionGuesses?.length) {
          useGameStore.getState().setRestoredGuesses(sessionGuesses);
        } else if (me?.guessStatuses?.length) {
          // Server only has statuses — restore without letters (keyboard hints won't show).
          useGameStore.getState().setRestoredGuesses(
            me.guessStatuses.map((statuses) => ({ word: null, statuses }))
          );
        }
        setRoundState(response.room.state, '');
        const state = response.room.state;
        navigate(state === 'IN_ROUND' || state === 'ROUND_ENDED' ? '/game' : `/room/${response.room.id}`);
      }
    });
  };

  const handleResumeGoHome = () => {
    clearResumePrompt();
    clearSession();
    clearRoom();
    navigate('/');
  };

  // ── Takeover (new tab / closed tab return) ──────────────────────
  const handleTakeover = () => {
    const session = takeoverPrompt;
    clearTakeoverPrompt();
    setMatchMode(session.matchMode === 'solo' ? 'solo' : 'multiplayer');

    socket.emit('resume_session', session, (response) => {
      if (response?.error) {
        clearSession();
        clearRoom();
        useGameStore.getState().pushToast(
          response.error === 'Room not found' || response.error === 'Session expired'
            ? 'That session has expired.'
            : response.error,
          'warn'
        );
        return;
      }
      if (response?.room) {
        saveSession(session);
        setRoom(response.room);
        const me = response.room.players.find((p) => p.id === socket.id);
        const sessionGuesses = session.pendingGuesses;
        if (sessionGuesses?.length) {
          useGameStore.getState().setRestoredGuesses(sessionGuesses);
        } else if (me?.guessStatuses?.length) {
          useGameStore.getState().setRestoredGuesses(
            me.guessStatuses.map((statuses) => ({ word: null, statuses }))
          );
        }
        setRoundState(response.room.state, '');
        const state = response.room.state;
        navigate(state === 'IN_ROUND' || state === 'ROUND_ENDED' ? '/game' : `/room/${response.room.id}`);
      }
    });
  };

  const handleTakeoverDismiss = () => {
    // User explicitly chose to stay on Home, so clear persisted session
    // to avoid showing the same takeover prompt again after reload.
    clearSession();
    clearTakeoverPrompt();
  };

  // ── Displaced (old tab kicked) ───────────────────────────────────
  const handleDisplacedGoHome = () => {
    clearDisplacedPrompt();
    clearRoom();
    navigate('/');
  };

  // ── Render ───────────────────────────────────────────────────────
  if (displacedPrompt) {
    return (
      <div className="session-prompt-overlay" role="dialog" aria-modal="true" aria-label="Session taken over">
        <div className="session-prompt-card">
          <h3>Joined from another tab</h3>
          <p>Your session was taken over by another tab or window. This tab has been disconnected.</p>
          <div className="end-actions">
            <button className="btn" onClick={handleDisplacedGoHome}>Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  if (resumePrompt) {
    return (
      <div className="session-prompt-overlay" role="dialog" aria-modal="true" aria-label="Resume session">
        <div className="session-prompt-card">
          <h3>Resume your game?</h3>
          <p>You were in room <strong>{resumePrompt.roomId}</strong> as <strong>{resumePrompt.playerName}</strong>. Want to jump back in?</p>
          <div className="end-actions">
            <button className="btn" onClick={handleResume}>Continue Game</button>
            <button className="btn btn-secondary" onClick={handleResumeGoHome}>Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  if (takeoverPrompt) {
    return (
      <div className="session-prompt-overlay" role="dialog" aria-modal="true" aria-label="Active session detected">
        <div className="session-prompt-card">
          <h3>Rejoin your game?</h3>
          <p>You have an unfinished session in room <strong>{takeoverPrompt.roomId}</strong> as <strong>{takeoverPrompt.playerName}</strong>. Jump back in?</p>
          <div className="end-actions">
            <button className="btn" onClick={handleTakeover}>Rejoin Game</button>
            <button className="btn btn-secondary" onClick={handleTakeoverDismiss}>Stay on Home</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
