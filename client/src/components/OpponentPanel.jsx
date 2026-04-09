export default function OpponentPanel({ player, wordLength }) {
  const maxGuesses = 6;
  const rows = [];

  for (let i = 0; i < maxGuesses; i++) {
    const statuses = player.guessStatuses ? player.guessStatuses[i] : null;

    if (statuses) {
      // Completed guess
      rows.push(
        <div key={i} className="opponent-row">
          {statuses.map((status, j) => (
            <div key={j} className={`mini-tile ${status}`}></div>
          ))}
        </div>
      );
    } else {
      // Empty row
      rows.push(
        <div key={i} className="opponent-row">
          {Array.from({ length: wordLength }).map((_, j) => (
            <div key={j} className="mini-tile"></div>
          ))}
        </div>
      );
    }
  }

  return (
    <article className={`opponent-card ${player.isOnline ? '' : 'is-offline'}`}>
      <div className="opponent-head">
        <span className="player-tag opponent-name">
          <span className="avatar-dot small">{player.avatar || 'PL'}</span>
          {player.name}
        </span>
        <span className="player-status-pack">
          {!player.isOnline && <span className="presence-chip offline">Offline</span>}
          {player.hasGuessedCorrectly && <span className="presence-chip solved">Solved</span>}
        </span>
      </div>
      <div className="opponent-grid">
        {rows}
      </div>
    </article>
  );
}
