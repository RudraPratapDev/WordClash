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
    <article className="opponent-card">
      <div className="opponent-head">
        <span className="player-tag" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
          <span className="avatar-dot small">{player.avatar || '🙂'}</span>
          {player.name}
        </span>
        {player.hasGuessedCorrectly && <span title="Solved!">✅</span>}
      </div>
      <div className="opponent-grid">
        {rows}
      </div>
    </article>
  );
}
