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
  const room = useGameStore((state) => state.room);
  const roundState = useGameStore((state) => state.roundState);
  const lastTargetWord = useGameStore((state) => state.lastTargetWord);
  const lastWordInfo = useGameStore((state) => state.lastWordInfo);
  const navigate = useNavigate();

  const [currentGuess, setCurrentGuess] = useState('');
  const [usedKeys, setUsedKeys] = useState({});
  const [myGuesses, setMyGuesses] = useState([]); // { word, statuses }[]
  const [feedback, setFeedback] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = window.localStorage.getItem('wc_sound_enabled');
      return saved ? saved === '1' : true;
    } catch {
      return true;
    }
  });
  const initializedRoundKeyRef = useRef('');
  const lastSfxKeyRef = useRef('');
  const lastTickSecondRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('game-no-scroll');

    return () => {
      document.body.classList.remove('game-no-scroll');
    };
  }, []);

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
      setIsSubmittingGuess(false);
      initializedRoundKeyRef.current = roundKey;
    }
  }, [room, roundState, navigate]);

  useEffect(() => {
    const roundEndsAt = room?.roundEndsAt;

    if (!roundEndsAt || roundState !== 'IN_ROUND') {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const timerId = setInterval(tick, 1000);

    return () => clearInterval(timerId);
  }, [room?.roundEndsAt, roundState]);

  useEffect(() => {
    if (lastTargetWord && (roundState === 'ROUND_ENDED' || roundState === 'GAME_OVER')) {
      setIsWordModalOpen(true);
    }
  }, [lastTargetWord, roundState]);

  useEffect(() => {
    if (!soundEnabled || roundState !== 'IN_ROUND' || secondsLeft === null) return;
    if (secondsLeft > 10 || secondsLeft <= 0) return;
    if (lastTickSecondRef.current === secondsLeft) return;

    lastTickSecondRef.current = secondsLeft;
    playTickSfx(secondsLeft <= 5);
  }, [secondsLeft, soundEnabled, roundState]);

  if (!room) return null;

  const wordLength = room.settings.wordLength;
  const me = room.players.find(p => p.id === socket.id);
  const opponents = room.players.filter(p => p.id !== socket.id);
  const opponentCount = opponents.length;
  const opponentCountClass = `count-${Math.min(opponentCount, 4)}`;
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === me?.id) + 1;
  const winnerScore = sortedPlayers[0]?.score ?? 0;
  const iAmWinner = roundState === 'GAME_OVER' && me && me.score === winnerScore;
  const isUrgent = roundState === 'IN_ROUND' && secondsLeft !== null && secondsLeft <= 10;
  const isCritical = roundState === 'IN_ROUND' && secondsLeft !== null && secondsLeft <= 5;

  const loserLines = [
    'You got roasted by the dictionary this round.',
    'Close enough to scare them. Not enough to beat them.',
    'The keyboard fought bravely. The score did not.',
    'Certified menace. Uncertified winner.',
  ];

  const winnerLines = [
    'Cracked it! The room has a new legend.',
    'Word wizard unlocked. Respect collected.',
    'You did not just win, you styled on them.',
    'Champion mode activated. GG.',
  ];

  const endLine = iAmWinner
    ? winnerLines[room.currentRound % winnerLines.length]
    : loserLines[room.currentRound % loserLines.length];

  useEffect(() => {
    try {
      window.localStorage.setItem('wc_sound_enabled', soundEnabled ? '1' : '0');
    } catch {
      // Ignore storage errors in private browsing modes.
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!room || roundState !== 'GAME_OVER' || !soundEnabled) return;

    const sfxKey = `${room.id}:${room.currentRound}:${iAmWinner ? 'win' : 'lose'}`;
    if (lastSfxKeyRef.current === sfxKey) return;
    lastSfxKeyRef.current = sfxKey;

    playEndSfx(iAmWinner);
  }, [room?.id, room?.currentRound, roundState, soundEnabled, iAmWinner]);

  // We are active if it's the round, and we haven't successfully guessed or exhausted 6 attempts.
  const isActive =
    roundState === 'IN_ROUND' &&
    !isSubmittingGuess &&
    !myGuesses.some(g => g.statuses.every(s => s === 'correct')) &&
    myGuesses.length < 6;

  const handleKeyPress = (key) => {
    if (!isActive || isSubmittingGuess) return;

    if (key === 'BACKSPACE') {
      setCurrentGuess(prev => prev.slice(0, -1));
    } else if (key === 'ENTER') {
      if (currentGuess.length !== wordLength) {
        setFeedback(`Word must be ${wordLength} letters`);
        return;
      }

      setIsSubmittingGuess(true);
      setFeedback('Checking word...');

      // Send guess to server for validation
      socket.emit('submit_guess', { guess: currentGuess }, (response) => {
        setIsSubmittingGuess(false);

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
      <aside className={`panel side-card ${opponentCount === 0 ? 'solo' : 'has-opponents'} ${opponentCountClass}`}>
        <h3 className="side-title">Opponents</h3>
        <div className="side-hud">
          <p className={`timer-pill compact ${isUrgent ? 'urgent' : ''} ${isCritical ? 'critical' : ''}`}>
            {roundState === 'IN_ROUND' ? `Time left: ${secondsLeft ?? room.settings.timeLimit}s` : 'Round paused'}
          </p>
          <button type="button" className="ghost-btn" onClick={() => setSoundEnabled(prev => !prev)}>
            SFX: {soundEnabled ? 'On' : 'Off'}
          </button>
        </div>
        {opponents.length === 0 && <p className="empty-note">You are currently playing solo.</p>}
        {opponents.length > 0 && (
          <div className={`opponents-grid ${opponentCountClass}`}>
            {opponents.map(p => (
              <OpponentPanel key={p.publicId || p.id} player={p} wordLength={wordLength} />
            ))}
          </div>
        )}
      </aside>

      <div className="center-stage">
        <div className="round-banner">
          {me && (
            <p className="player-inline">
              <span className="avatar-dot">{me.avatar || 'PL'}</span>
              Playing as {me.name}
            </p>
          )}
          <h2>Round {room.currentRound} / {room.settings.numRounds}</h2>
          {roundState === 'ROUND_ENDED' && (
            <div className="status-banner">
              Round finished. Next round starts in a few seconds. Word was <strong>{lastTargetWord}</strong>
            </div>
          )}
          {roundState === 'GAME_OVER' && (
            <div className={`status-banner end-banner ${iAmWinner ? 'winner' : 'loser'}`}>
              {iAmWinner && (
                <div className="confetti-wrap" aria-hidden="true">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <span key={i} className="confetti-piece"></span>
                  ))}
                </div>
              )}
              <strong>{iAmWinner ? 'You Win!' : `You placed #${myRank}`}</strong>
              <p>{endLine}</p>
              <p>Final word was <strong>{lastTargetWord}</strong></p>
              <div style={{ marginTop: '10px' }}>
                <button className="btn" onClick={() => navigate('/')}>Back Home</button>
              </div>
            </div>
          )}
        </div>

        <Board guesses={myGuesses} currentGuess={currentGuess} wordLength={wordLength} isActive={isActive} />

        {feedback && <p className="feedback-text">{feedback}</p>}

        <Keyboard onKeyPress={handleKeyPress} usedKeys={usedKeys} disabled={isSubmittingGuess} />
      </div>

      <aside className="right-stack">
        <Leaderboard />
        <ChatPanel />
      </aside>

      {isWordModalOpen && lastTargetWord && (
        <div className="word-modal-overlay" role="dialog" aria-modal="true" aria-label="Word meaning">
          <div className="word-modal-card">
            <div className="word-modal-head">
              <h3>About {lastTargetWord}</h3>
              <button type="button" className="ghost-btn" onClick={() => setIsWordModalOpen(false)}>
                Close
              </button>
            </div>

            {!lastWordInfo && (
              <p className="word-modal-loading">Finding dictionary insight...</p>
            )}

            {lastWordInfo && (
              <div className="word-modal-content">
                <p><strong>Type:</strong> {lastWordInfo.partOfSpeech || 'Unknown'}</p>
                <p><strong>Meaning:</strong> {lastWordInfo.meaning || 'Definition unavailable.'}</p>
                {lastWordInfo.example && <p><strong>Example:</strong> {lastWordInfo.example}</p>}
                {lastWordInfo.source === 'fallback' && (
                  <p className="word-modal-fallback">Dictionary services did not return an entry for this word.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function playEndSfx(isWinner) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = isWinner
      ? [523.25, 659.25, 783.99, 1046.5]
      : [392.0, 329.63, 261.63];

    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isWinner ? 'triangle' : 'sine';
      osc.frequency.value = frequency;

      const start = now + i * 0.12;
      const end = start + 0.16;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // Ignore if autoplay/device policy blocks audio.
  }
}

function playTickSfx(isCritical = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = isCritical ? 980 : 720;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 200);
  } catch {
    // Ignore if browser policy blocks autoplay audio.
  }
}
