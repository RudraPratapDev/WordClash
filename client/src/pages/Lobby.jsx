import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import { Users, Clock, Hash, Dices, Copy } from 'lucide-react';
import { useState } from 'react';

export default function Lobby() {
  const { room, roundState } = useGameStore();
  const [copyStatus, setCopyStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!room) {
      navigate('/');
    } else if (roundState === 'IN_ROUND' || roundState === 'ROUND_ENDED' || roundState === 'GAME_OVER') {
      navigate('/game');
    }
  }, [room, roundState, navigate]);

  if (!room) return null;

  const isOwner = socket.id === room.ownerId;

  const handleStartGame = () => {
    socket.emit('start_game');
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(''), 1200);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(''), 1200);
    }
  };

  return (
    <section className="page-center">
      <div className="panel lobby-card" style={{ width: 'min(900px, 100%)' }}>
        <div>
          <h2 className="hero-title">Lobby</h2>
          <p className="hero-subtitle">Share this code and wait for everyone to lock in.</p>
          <div className="room-code-row">
            <div className="room-code">{room.id}</div>
            <button type="button" className="ghost-btn" onClick={handleCopyCode}>
              <Copy size={14} /> {copyStatus || 'Copy'}
            </button>
          </div>
        </div>

        <div className="lobby-grid" style={{ marginTop: '20px', marginBottom: '20px' }}>
          <div>
            <h3 className="side-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} /> Players ({room.players.length}/{room.settings.maxPlayers})
            </h3>
            <ul className="info-list">
              {room.players.map(p => (
                <li key={p.id} className="meta-row">
                  <span className="player-tag"><span className="avatar-dot">{p.avatar || '🙂'}</span>{p.name} {p.id === room.ownerId && '👑'}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="side-title">Match Settings</h3>
            <ul className="info-list">
              <li className="meta-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Hash size={16} /> Word Length</span>
                <strong>{room.settings.wordLength}</strong>
              </li>
              <li className="meta-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Dices size={16} /> Rounds</span>
                <strong>{room.settings.numRounds}</strong>
              </li>
              <li className="meta-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={16} /> Time Limit</span>
                <strong>{room.settings.timeLimit}s</strong>
              </li>
            </ul>
          </div>
        </div>

        <div>
          {isOwner ? (
            <button className="btn" onClick={handleStartGame} disabled={room.players.length < 1}>
              Start Match
            </button>
          ) : (
            <p className="empty-note">Waiting for the room owner to start the match.</p>
          )}
        </div>
      </div>
    </section>
  );
}
