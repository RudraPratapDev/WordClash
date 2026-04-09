import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import { socket } from '../hooks/useSocket';
import { Users, Clock, Hash, Dices, Copy } from 'lucide-react';
import { useState } from 'react';

export default function Lobby() {
  const { room, roundState } = useGameStore();
  const [copyStatus, setCopyStatus] = useState('');
  const [copyInviteStatus, setCopyInviteStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!room) {
      navigate('/');
    } else if (roundState === 'IN_ROUND' || roundState === 'ROUND_ENDED') {
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

  const inviteUrl = `${window.location.origin}/join/${room.id}`;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyInviteStatus('Invite copied');
      setTimeout(() => setCopyInviteStatus(''), 1200);
    } catch {
      setCopyInviteStatus('Copy failed');
      setTimeout(() => setCopyInviteStatus(''), 1200);
    }
  };

  return (
    <section className="page-center">
      <div className="panel lobby-card" style={{ width: 'min(900px, 100%)' }}>
        <div>
          <h2 className="hero-title">Lobby</h2>
          <p className="hero-subtitle">Drop the code or share your invite link so everyone joins in one tap.</p>
          <div className="room-code-row">
            <div className="room-code">{room.id}</div>
            <button type="button" className="ghost-btn" onClick={handleCopyCode}>
              <Copy size={14} /> {copyStatus || 'Copy'}
            </button>
            <button type="button" className="ghost-btn" onClick={handleCopyInvite}>
              <Copy size={14} /> {copyInviteStatus || 'Copy Invite URL'}
            </button>
          </div>
          <p className="invite-url">{inviteUrl}</p>
        </div>

        <div className="lobby-grid" style={{ marginTop: '20px', marginBottom: '20px' }}>
          <div>
            <h3 className="side-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} /> Players ({room.players.length}/{room.settings.maxPlayers})
            </h3>
            <ul className="info-list">
              {room.players.map(p => (
                <li key={p.publicId || p.id} className="meta-row">
                  <span className="player-tag">
                    <span className="avatar-dot">{p.avatar || 'PL'}</span>
                    {p.name}
                    {p.id === room.ownerId && <span className="role-badge">Leader</span>}
                    {!p.isOnline && <span className="presence-chip offline">Offline</span>}
                  </span>
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
          {roundState === 'GAME_OVER' && (
            <div className="status-banner" style={{ marginBottom: '14px' }}>
              <strong>Previous match is over.</strong>
              <p style={{ marginTop: '6px' }}>Waiting room is open. The owner can start a new match when everyone is ready.</p>
            </div>
          )}

          {isOwner ? (
            <>
              <p className="empty-note" style={{ marginBottom: '10px' }}>
                Your squad is ready. Launch the countdown when you want the race to begin.
              </p>
              <button className="btn" onClick={handleStartGame} disabled={room.players.length < 1}>
              {roundState === 'GAME_OVER' ? 'Start New Match' : 'Start Match'}
              </button>
            </>
          ) : (
            <p className="empty-note">
              {roundState === 'GAME_OVER'
                ? 'Match has ended. Stay sharp while the leader spins up the next one.'
                : 'Warm up your fingers. The leader will trigger the round any second.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
