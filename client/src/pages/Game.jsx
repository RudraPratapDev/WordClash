import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import Board from '../components/Board';
import Keyboard from '../components/Keyboard';
import ChatPanel from '../components/ChatPanel';
import Leaderboard from '../components/Leaderboard';
import OpponentPanel from '../components/OpponentPanel';
import { getPlayerBadge } from '../utils/playerIdentity';

export default function Game() {
  const room = useGameStore((state) => state.room);
  const matchMode = useGameStore((state) => state.matchMode);
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
  const [invalidPulseKey, setInvalidPulseKey] = useState(0);
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
      setInvalidPulseKey(0);
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
    if (lastTargetWord && roundState === 'ROUND_ENDED') {
      setIsWordModalOpen(true);
    }
  }, [lastTargetWord, roundState]);

  useEffect(() => {
    if (roundState === 'IN_ROUND' || roundState === 'GAME_OVER') {
      setIsWordModalOpen(false);
    }
  }, [roundState]);

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
  const isSoloMatch = room.players.length <= 1;
  const showChat = !isSoloMatch;
  const showLeaderboard = !isSoloMatch;
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === me?.id) + 1;
  const winnerScore = sortedPlayers[0]?.score ?? 0;
  const isSoloMode = matchMode === 'solo';
  const iAmWinner = !isSoloMode && roundState === 'GAME_OVER' && me && me.score === winnerScore;
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

  const soloLines = [
    'Solid run. You vs the clock, and you held up.',
    'Nice finish. Solo mode complete.',
    'Clean run. Ready for another round?',
    'Good pace and focus. Solo session done.',
  ];

  const endLine = isSoloMode
    ? soloLines[room.currentRound % soloLines.length]
    : iAmWinner
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
      setFeedback('');

      // Send guess to server for validation
      socket.emit('submit_guess', { guess: currentGuess }, (response) => {
        setIsSubmittingGuess(false);

        if (response.error) {
          if (response.error === 'Word does not exist') {
            setInvalidPulseKey((prev) => prev + 1);
            setFeedback('');
            return;
          }

          if (response.error === 'Invalid word length') {
            setFeedback(`Word must be ${wordLength} letters`);
            return;
          }

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

  const handlePlayAgain = () => {
    if (!room || socket.id !== room.ownerId) return;
    socket.emit('start_game', () => {});
  };

  return (
    <section className={`game-layout ${isSoloMatch ? 'solo-match' : ''}`}>
      {!isSoloMatch && (
        <aside className={`panel side-card has-opponents ${opponentCountClass}`}>
          <h3 className="side-title">Opponents</h3>
          <div className="side-hud">
            <p className={`timer-pill compact ${isUrgent ? 'urgent' : ''} ${isCritical ? 'critical' : ''}`}>
              {roundState === 'IN_ROUND' ? `Time left: ${secondsLeft ?? room.settings.timeLimit}s` : 'Round paused'}
            </p>
            <button type="button" className="ghost-btn" onClick={() => setSoundEnabled(prev => !prev)}>
              SFX: {soundEnabled ? 'On' : 'Off'}
            </button>
          </div>
          {opponents.length > 0 && (
            <div className={`opponents-grid ${opponentCountClass}`}>
              {opponents.map(p => (
                <OpponentPanel key={p.publicId || p.id} player={p} wordLength={wordLength} />
              ))}
            </div>
          )}
        </aside>
      )}

      <div className="center-stage">
        <div className="round-banner">
          {me && (
            <p className="player-inline">
              <span className="avatar-dot">{getPlayerBadge(me)}</span>
              Playing as {me.name}
            </p>
          )}
          <h2>Round {room.currentRound} / {room.settings.numRounds}</h2>
          {isSoloMatch && (
            <div className="solo-head-tools">
              <p className={`timer-pill ${isUrgent ? 'urgent' : ''} ${isCritical ? 'critical' : ''}`}>
                {roundState === 'IN_ROUND' ? `Time left: ${secondsLeft ?? room.settings.timeLimit}s` : 'Round paused'}
              </p>
              <button type="button" className="ghost-btn" onClick={() => setSoundEnabled(prev => !prev)}>
                SFX: {soundEnabled ? 'On' : 'Off'}
              </button>
            </div>
          )}
          {roundState === 'ROUND_ENDED' && (
            <div className="status-banner">
              Round finished. Next round starts in a few seconds.
            </div>
          )}
        </div>

        <Board
          guesses={myGuesses}
          currentGuess={currentGuess}
          wordLength={wordLength}
          isActive={isActive}
          isSubmittingGuess={isSubmittingGuess}
          invalidPulseKey={invalidPulseKey}
        />

        {feedback && <p className="feedback-text">{feedback}</p>}

        <Keyboard onKeyPress={handleKeyPress} usedKeys={usedKeys} disabled={isSubmittingGuess} />
      </div>

      {(showLeaderboard || showChat) && (
        <aside className={`right-stack ${showChat ? '' : 'solo-right'}`}>
          {showLeaderboard && <Leaderboard />}
          {showChat && <ChatPanel />}
        </aside>
      )}

      {roundState === 'GAME_OVER' && (
        <div className="game-over-overlay" role="dialog" aria-modal="true" aria-label="Match result">
          {iAmWinner && (
            <div className="screen-fireworks" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="firework-particle"></span>
              ))}
            </div>
          )}
          <div className={`game-over-modal ${iAmWinner ? 'winner' : 'loser'}`}>
            <strong>{isSoloMode ? 'Solo Run Complete' : iAmWinner ? 'You Win!' : `You placed #${myRank}`}</strong>
            <p>{endLine}</p>
            <p>Final word was <strong>{lastTargetWord}</strong></p>
            <div className="end-actions">
              {isSoloMode ? (
                <>
                  <button className="btn" onClick={handlePlayAgain}>Play Again</button>
                  <button className="btn btn-secondary" onClick={() => navigate('/')}>Back Home</button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={() => navigate(`/room/${room.id}`)}>
                    Back To Lobby
                  </button>
                  <button className="btn" onClick={() => navigate('/')}>Back Home</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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

    if (isWinner) {
      const fanfare = [523.25, 659.25, 783.99, 1046.5];
      fanfare.forEach((frequency, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = frequency;

        const start = now + i * 0.12;
        const end = start + 0.18;

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end);
      });

      for (let i = 0; i < 6; i++) {
        const pop = ctx.createOscillator();
        const popGain = ctx.createGain();
        const start = now + 0.2 + i * 0.09;
        const end = start + 0.06;

        pop.type = 'square';
        pop.frequency.setValueAtTime(420 + Math.random() * 520, start);

        popGain.gain.setValueAtTime(0.0001, start);
        popGain.gain.exponentialRampToValueAtTime(0.05, start + 0.008);
        popGain.gain.exponentialRampToValueAtTime(0.0001, end);

        pop.connect(popGain);
        popGain.connect(ctx.destination);
        pop.start(start);
        pop.stop(end);
      }
    } else {
      const wah = ctx.createOscillator();
      const wahGain = ctx.createGain();

      wah.type = 'sawtooth';
      wah.frequency.setValueAtTime(360, now);
      wah.frequency.exponentialRampToValueAtTime(120, now + 0.45);

      wahGain.gain.setValueAtTime(0.0001, now);
      wahGain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
      wahGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

      wah.connect(wahGain);
      wahGain.connect(ctx.destination);
      wah.start(now);
      wah.stop(now + 0.5);

      const boing = ctx.createOscillator();
      const boingGain = ctx.createGain();
      const boingStart = now + 0.52;

      boing.type = 'triangle';
      boing.frequency.setValueAtTime(190, boingStart);
      boing.frequency.exponentialRampToValueAtTime(130, boingStart + 0.2);

      boingGain.gain.setValueAtTime(0.0001, boingStart);
      boingGain.gain.exponentialRampToValueAtTime(0.05, boingStart + 0.02);
      boingGain.gain.exponentialRampToValueAtTime(0.0001, boingStart + 0.22);

      boing.connect(boingGain);
      boingGain.connect(ctx.destination);
      boing.start(boingStart);
      boing.stop(boingStart + 0.24);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1400);
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
