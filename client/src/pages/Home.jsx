import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { socket } from '../hooks/useSocket';
import useGameStore from '../store/useGameStore';
import { Sparkles, Zap } from 'lucide-react';
import { getSuggestedUsername } from '../utils/usernameSuggestions';
import { clearSession, getPlayerKey, saveSession } from '../utils/session';

const PRESETS = {
  quick: { maxPlayers: 4, wordLength: 4, numRounds: 3, timeLimit: 120 },
  standard: { maxPlayers: 4, wordLength: 5, numRounds: 4, timeLimit: 120 },
  marathon: { maxPlayers: 6, wordLength: 6, numRounds: 6, timeLimit: 180 },
};

export default function Home() {
  const { roomId: roomIdFromPath } = useParams();
  const location = useLocation();
  const initialSuggestion = useMemo(() => getSuggestedUsername(), []);
  const [suggestedName, setSuggestedName] = useState(initialSuggestion);
  const [name, setName] = useState(initialSuggestion);
  const [joinCode, setJoinCode] = useState('');
  const [settings, setSettings] = useState(PRESETS.standard);
  const [preset, setPreset] = useState('standard');
  const [soloSettings, setSoloSettings] = useState(PRESETS.standard);
  const [soloPreset, setSoloPreset] = useState('standard');
  const [showCreateSettings, setShowCreateSettings] = useState(false);
  const [showSoloSettings, setShowSoloSettings] = useState(false);
  const [formError, setFormError] = useState('');
  const navigate = useNavigate();
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const setMatchMode = useGameStore((state) => state.setMatchMode);
  const setRoom = useGameStore((state) => state.setRoom);
  const roomId = useGameStore((state) => state.roomId);
  const clearRoom = useGameStore((state) => state.clearRoom);
  const clearToasts = useGameStore((state) => state.clearToasts);

  const resolvedName = (name || suggestedName).trim();
  const isSettingsModalOpen = showCreateSettings || showSoloSettings;

  const openCreateSettings = () => {
    setShowSoloSettings(false);
    setShowCreateSettings(true);
  };

  const openSoloSettings = () => {
    setShowCreateSettings(false);
    setShowSoloSettings(true);
  };

  const closeSettingsModal = () => {
    setShowCreateSettings(false);
    setShowSoloSettings(false);
  };

  useEffect(() => {
    const queryRoom = new URLSearchParams(location.search).get('room') || '';
    const incomingRoom = (roomIdFromPath || queryRoom || '').trim().toUpperCase();
    if (!incomingRoom) return;
    setJoinCode(incomingRoom);
  }, [roomIdFromPath, location.search]);

  useEffect(() => {
    let cancelled = false;

    clearSession();
    clearToasts();

    const finalizeLeave = () => {
      if (cancelled) return;
      clearRoom();
    };

    if (!roomId) {
      finalizeLeave();
      return () => {
        cancelled = true;
      };
    }

    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      finalizeLeave();
    }, 900);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('leave_room', {}, () => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      finalizeLeave();
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!isSettingsModalOpen) return;

    const handleEscClose = (event) => {
      if (event.key === 'Escape') {
        closeSettingsModal();
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [isSettingsModalOpen]);

  const regenerateSuggestion = () => {
    const nextName = getSuggestedUsername();
    setSuggestedName(nextName);
    setName(nextName);
  };

  const updateSetting = (key, value) => {
    setPreset('custom');
    if (key === 'timeLimit') {
      const clamped = Math.min(Math.max(Number(value || 120), 15), 600);
      setSettings(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateSoloSetting = (key, value) => {
    setSoloPreset('custom');
    if (key === 'timeLimit') {
      const clamped = Math.min(Math.max(Number(value || 120), 15), 600);
      setSoloSettings(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    setSoloSettings(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (key) => {
    setPreset(key);
    setSettings(PRESETS[key]);
  };

  const applySoloPreset = (key) => {
    setSoloPreset(key);
    setSoloSettings(PRESETS[key]);
  };

  const handleCreate = () => {
    if (!resolvedName) {
      setFormError('Please enter a player name.');
      return;
    }

    setFormError('');
    setPlayerName(resolvedName);
    setMatchMode('multiplayer');
    const playerKey = getPlayerKey();

    socket.emit('create_room', { playerName: resolvedName, settings, playerKey }, (room) => {
      if (!room || room.error) {
        setFormError(room?.error || 'Unable to create room right now.');
        return;
      }
      saveSession({ roomId: room.id, playerName: resolvedName, playerKey, matchMode: 'multiplayer' });
      setRoom(room);
      navigate(`/room/${room.id}`);
    });
  };

  const handleSoloStart = () => {
    if (!resolvedName) {
      setFormError('Please enter a player name.');
      return;
    }

    setFormError('');
    setPlayerName(resolvedName);
    setMatchMode('solo');
    const playerKey = getPlayerKey();

    // Solo mode still uses the multiplayer room pipeline for consistency.
    const soloMatchSettings = { ...soloSettings, maxPlayers: 2 };

    socket.emit('create_room', { playerName: resolvedName, settings: soloMatchSettings, playerKey }, (room) => {
      if (!room || room.error) {
        setFormError(room?.error || 'Unable to start solo match right now.');
        return;
      }

      saveSession({ roomId: room.id, playerName: resolvedName, playerKey, matchMode: 'solo' });
      setRoom(room);
      socket.emit('start_game', (startResponse) => {
        if (startResponse?.error) {
          setFormError(startResponse.error);
          return;
        }
        navigate('/game');
      });
    });
  };

  const handleJoin = () => {
    if (!resolvedName || !joinCode.trim()) {
      setFormError('Add your name and room code to join.');
      return;
    }

    setFormError('');
    setPlayerName(resolvedName);
    setMatchMode('multiplayer');
    const playerKey = getPlayerKey();
    
    socket.emit('join_room', { roomId: joinCode.toUpperCase(), playerName: resolvedName, playerKey }, (response) => {
      if (response.error) {
        setFormError(response.error);
        return;
      }
      saveSession({ roomId: response.room.id, playerName: resolvedName, playerKey, matchMode: 'multiplayer' });
      setRoom(response.room);
      navigate(`/room/${response.room.id}`);
    });
  };

  return (
    <section className="page-center">
      <div className="panel hero-card">
        <h2 className="hero-title">Beat the board, beat the room.</h2>
        <p className="hero-subtitle">Create a private lobby or join with a room code and race every round in real time.</p>

        <div className="stack">
          <div>
            <p className="label">Player name</p>
            <div className="suggestion-row">
              <span className="suggestion-pill">Suggested: {suggestedName}</span>
              <button className="ghost-btn" onClick={regenerateSuggestion} type="button" aria-label="Generate another suggested username">
                <Sparkles size={14} /> New
              </button>
            </div>
            <input
              type="text"
              className="input"
              placeholder="Pick a name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="row">
            <button className="btn" onClick={openCreateSettings}>Create Room</button>
            <button className="btn btn-secondary" onClick={openSoloSettings}>Solo Blitz</button>
          </div>

          <div className="divider">or join existing</div>

          <div className="row">
            <input
              type="text"
              className="input"
              placeholder="ROOM CODE"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="btn btn-secondary" onClick={handleJoin}>Join Room</button>
          </div>

          {formError && <p className="form-error">{formError}</p>}
        </div>
      </div>

      {isSettingsModalOpen && (
        <div className="settings-modal-overlay" onClick={closeSettingsModal} role="dialog" aria-modal="true" aria-label="Game customization">
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            {showCreateSettings && (
              <div className="create-panel settings-modal-panel">
                <div className="create-head">
                  <p className="label">Customize your room</p>
                  <button type="button" className="ghost-btn" onClick={closeSettingsModal}>Close</button>
                </div>

                <div className="preset-row">
                  <button type="button" className={`ghost-btn ${preset === 'quick' ? 'active' : ''}`} onClick={() => applyPreset('quick')}>
                    <Zap size={14} /> Quick
                  </button>
                  <button type="button" className={`ghost-btn ${preset === 'standard' ? 'active' : ''}`} onClick={() => applyPreset('standard')}>
                    <Zap size={14} /> Standard
                  </button>
                  <button type="button" className={`ghost-btn ${preset === 'marathon' ? 'active' : ''}`} onClick={() => applyPreset('marathon')}>
                    <Zap size={14} /> Marathon
                  </button>
                </div>

                <div className="settings-grid">
                  <label className="setting-field">
                    <span className="label">Players</span>
                    <select className="input" value={settings.maxPlayers} onChange={(e) => updateSetting('maxPlayers', Number(e.target.value))}>
                      {[2, 3, 4, 5, 6, 7, 8].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>

                  <label className="setting-field">
                    <span className="label">Word length</span>
                    <select className="input" value={settings.wordLength} onChange={(e) => updateSetting('wordLength', Number(e.target.value))}>
                      {[4, 5, 6].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>

                  <label className="setting-field">
                    <span className="label">Rounds</span>
                    <select className="input" value={settings.numRounds} onChange={(e) => updateSetting('numRounds', Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>

                  <label className="setting-field">
                    <span className="label">Seconds / round</span>
                    <input
                      type="number"
                      className="input"
                      min={15}
                      max={600}
                      step={5}
                      value={settings.timeLimit}
                      onChange={(e) => updateSetting('timeLimit', Number(e.target.value))}
                    />
                  </label>
                </div>

                <p className="settings-note">
                  Estimated match length: about {Math.max(1, Math.round((settings.numRounds * settings.timeLimit) / 60))} min
                </p>

                <button className="btn" onClick={handleCreate}>Host Custom Match</button>
              </div>
            )}

            {showSoloSettings && (
              <div className="create-panel settings-modal-panel">
                <div className="create-head">
                  <p className="label">Customize solo match</p>
                  <button type="button" className="ghost-btn" onClick={closeSettingsModal}>Close</button>
                </div>

                <div className="preset-row">
                  <button type="button" className={`ghost-btn ${soloPreset === 'quick' ? 'active' : ''}`} onClick={() => applySoloPreset('quick')}>
                    <Zap size={14} /> Quick
                  </button>
                  <button type="button" className={`ghost-btn ${soloPreset === 'standard' ? 'active' : ''}`} onClick={() => applySoloPreset('standard')}>
                    <Zap size={14} /> Standard
                  </button>
                  <button type="button" className={`ghost-btn ${soloPreset === 'marathon' ? 'active' : ''}`} onClick={() => applySoloPreset('marathon')}>
                    <Zap size={14} /> Marathon
                  </button>
                </div>

                <div className="settings-grid">
                  <label className="setting-field">
                    <span className="label">Word length</span>
                    <select className="input" value={soloSettings.wordLength} onChange={(e) => updateSoloSetting('wordLength', Number(e.target.value))}>
                      {[4, 5, 6].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>

                  <label className="setting-field">
                    <span className="label">Rounds</span>
                    <select className="input" value={soloSettings.numRounds} onChange={(e) => updateSoloSetting('numRounds', Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>

                  <label className="setting-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="label">Seconds / round</span>
                    <input
                      type="number"
                      className="input"
                      min={15}
                      max={600}
                      step={5}
                      value={soloSettings.timeLimit}
                      onChange={(e) => updateSoloSetting('timeLimit', Number(e.target.value))}
                    />
                  </label>
                </div>

                <p className="settings-note">
                  Estimated match length: about {Math.max(1, Math.round((soloSettings.numRounds * soloSettings.timeLimit) / 60))} min
                </p>

                <button className="btn" onClick={handleSoloStart}>Start Solo Game</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
