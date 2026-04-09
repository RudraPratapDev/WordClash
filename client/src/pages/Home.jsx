import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../hooks/useSocket';
import useGameStore from '../store/useGameStore';
import { Sparkles, Zap } from 'lucide-react';
import { getSuggestedUsername } from '../utils/usernameSuggestions';

const PRESETS = {
  quick: { maxPlayers: 4, wordLength: 4, numRounds: 3, timeLimit: 45 },
  standard: { maxPlayers: 4, wordLength: 5, numRounds: 4, timeLimit: 60 },
  marathon: { maxPlayers: 6, wordLength: 6, numRounds: 6, timeLimit: 90 },
};

export default function Home() {
  const initialSuggestion = useMemo(() => getSuggestedUsername(), []);
  const [suggestedName, setSuggestedName] = useState(initialSuggestion);
  const [name, setName] = useState(initialSuggestion);
  const [joinCode, setJoinCode] = useState('');
  const [settings, setSettings] = useState(PRESETS.standard);
  const [preset, setPreset] = useState('standard');
  const [showCreateSettings, setShowCreateSettings] = useState(false);
  const [formError, setFormError] = useState('');
  const navigate = useNavigate();
  const { setPlayerName, setRoom } = useGameStore();

  const resolvedName = (name || suggestedName).trim();

  const regenerateSuggestion = () => {
    const nextName = getSuggestedUsername();
    setSuggestedName(nextName);
    setName(nextName);
  };

  const updateSetting = (key, value) => {
    setPreset('custom');
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (key) => {
    setPreset(key);
    setSettings(PRESETS[key]);
  };

  const handleCreate = () => {
    if (!resolvedName) {
      setFormError('Please enter a player name.');
      return;
    }

    setFormError('');
    setPlayerName(resolvedName);

    socket.emit('create_room', { playerName: resolvedName, settings }, (room) => {
      if (!room || room.error) {
        setFormError(room?.error || 'Unable to create room right now.');
        return;
      }
      setRoom(room);
      navigate(`/room/${room.id}`);
    });
  };

  const handleJoin = () => {
    if (!resolvedName || !joinCode.trim()) {
      setFormError('Add your name and room code to join.');
      return;
    }

    setFormError('');
    setPlayerName(resolvedName);
    
    socket.emit('join_room', { roomId: joinCode.toUpperCase(), playerName: resolvedName }, (response) => {
      if (response.error) {
        setFormError(response.error);
        return;
      }
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

          {!showCreateSettings ? (
            <button className="btn" onClick={() => setShowCreateSettings(true)}>Create Room</button>
          ) : (
            <div className="create-panel">
              <div className="create-head">
                <p className="label">Customize your room</p>
                <button type="button" className="ghost-btn" onClick={() => setShowCreateSettings(false)}>Hide</button>
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
                  <select className="input" value={settings.timeLimit} onChange={(e) => updateSetting('timeLimit', Number(e.target.value))}>
                    {[30, 45, 60, 75, 90, 120].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              </div>

              <p className="settings-note">
                Estimated match length: about {Math.max(1, Math.round((settings.numRounds * settings.timeLimit) / 60))} min
              </p>

              <button className="btn" onClick={handleCreate}>Host Custom Match</button>
            </div>
          )}

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
    </section>
  );
}
