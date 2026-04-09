import { memo } from 'react';
import useGameStore from '../store/useGameStore';
import { Trophy } from 'lucide-react';
import { getPlayerBadge } from '../utils/playerIdentity';

function Leaderboard() {
  const room = useGameStore((state) => state.room);
  
  if (!room) return null;

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <div className="panel module">
      <div className="module-head" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Trophy size={18} /> Leaderboard
      </div>
      <div className="module-body" style={{ padding: 0 }}>
        <ul style={{ listStyle: 'none' }}>
          {sortedPlayers.map((p, i) => (
            <li key={p.publicId || p.id} className={`rank-item ${i === 0 ? 'top' : ''}`}>
              <span className="player-tag" style={{ fontWeight: i === 0 ? 700 : 500 }}>
                <span className="avatar-dot">{getPlayerBadge(p)}</span>
                {i + 1}. {p.name}
                {!p.isOnline && <span className="presence-chip offline">Offline</span>}
              </span>
              <span style={{ fontWeight: 800 }}>{p.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default memo(Leaderboard);
