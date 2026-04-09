import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import Board from '../components/Board';
import Keyboard from '../components/Keyboard';
import ChatPanel from '../components/ChatPanel';
import Leaderboard from '../components/Leaderboard';
import OpponentPanel from '../components/OpponentPanel';

export default function Game() {
  const { room, roundState, lastTargetWord } = useGameStore();
  const navigate = useNavigate();

  const [currentGuess, setCurrentGuess] = useState('');
  const [usedKeys, setUsedKeys] = useState({});
  const [myGuesses, setMyGuesses] = useState([]); // { word, statuses }[]
  const [feedback, setFeedback] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);
  const initializedRoundKeyRef = useRef('');

  useEffect(() => {
    if (!room) {
      navigate('/');
    } else if (roundState === 'LOBBY') {
      navigate(`/room/${room.id}`);
    }

    // Only reset per-round state once when a new round starts.
    const roundKey = room ? `${room.id}:${room.currentRound}` : '';
    if (roundState === 'IN_ROUND' && roundKey && initializedRoundKeyRef.current !== roundKey) {
      setCurrentGuess('');
      setUsedKeys({});
      setMyGuesses([]);
      setFeedback('');
      initializedRoundKeyRef.current = roundKey;
    }
  }, [room, roundState, navigate]);

  useEffect(() => {
    if (!room || roundState !== 'IN_ROUND' || !room.roundEndsAt) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const timerId = setInterval(tick, 250);

    return () => clearInterval(timerId);
  }, [room?.roundEndsAt, roundState, room]);

  if (!room) return null;

  const wordLength = room.settings.wordLength;
  const me = room.players.find(p => p.id === socket.id);
  const opponents = room.players.filter(p => p.id !== socket.id);

  // We are active if it's the round, and we haven't successfully guessed or exhausted 6 attempts.
  const isActive = roundState === 'IN_ROUND' && !myGuesses.some(g => g.statuses.every(s => s === 'correct')) && myGuesses.length < 6;

  const handleKeyPress = (key) => {
    if (!isActive) return;

    if (key === 'BACKSPACE') {
      setCurrentGuess(prev => prev.slice(0, -1));
    } else if (key === 'ENTER') {
      if (currentGuess.length !== wordLength) {
        setFeedback(`Word must be ${wordLength} letters`);
        return;
      }

      // Send guess to server for validation
      socket.emit('submit_guess', { guess: currentGuess }, (response) => {
        if (response.error) {
          setFeedback(response.error);
          return;
        }

        const statuses = response.statuses;
        setFeedback('');

        setMyGuesses(prev => [...prev, { word: currentGuess, statuses }]);

        const iterUsed = { ...usedKeys };
        currentGuess.split('').forEach((letter, i) => {
          const status = statuses[i];
          const currentStatus = iterUsed[letter];
          if (status === 'correct' || (status === 'present' && currentStatus !== 'correct') || (status === 'absent' && currentStatus !== 'correct' && currentStatus !== 'present')) {
            iterUsed[letter] = status;
          }
        });
        setUsedKeys(iterUsed);
        setCurrentGuess('');
      });
    } else {
      if (currentGuess.length < wordLength) {
        setCurrentGuess(prev => prev + key);
      }
    }
  };

  return (
    <section className="game-layout">
      <aside className="panel side-card">
        <h3 className="side-title">Opponents</h3>
        {opponents.length === 0 && <p className="empty-note">You are currently playing solo.</p>}
        {opponents.map(p => (
          <OpponentPanel key={p.id} player={p} wordLength={wordLength} />
        ))}
      </aside>

      <div className="center-stage">
        <div className="round-banner">
          {me && (
            <p className="player-inline">
              <span className="avatar-dot">{me.avatar || '🙂'}</span>
              Playing as {me.name}
            </p>
          )}
          <h2>Round {room.currentRound} / {room.settings.numRounds}</h2>
          <p className="timer-pill">
            {roundState === 'IN_ROUND' ? `Time left: ${secondsLeft ?? room.settings.timeLimit}s` : 'Timer paused'}
          </p>
          {roundState === 'ROUND_ENDED' && (
            <div className="status-banner">
              Round finished. Next round starts in a few seconds. Word was <strong>{lastTargetWord}</strong>
            </div>
          )}
          {roundState === 'GAME_OVER' && (
            <div className="status-banner">
              Game over. Final word was <strong>{lastTargetWord}</strong>
              <div style={{ marginTop: '10px' }}>
                <button className="btn" onClick={() => navigate('/')}>Back Home</button>
              </div>
            </div>
          )}
        </div>

        <Board guesses={myGuesses} currentGuess={currentGuess} wordLength={wordLength} isActive={isActive} />

        {feedback && <p className="feedback-text">{feedback}</p>}

        <Keyboard onKeyPress={handleKeyPress} usedKeys={usedKeys} />
      </div>

      <aside className="right-stack">
        <Leaderboard />
        <ChatPanel />
      </aside>
    </section>
  );
}
