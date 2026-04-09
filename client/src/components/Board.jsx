export default function Board({ guesses, currentGuess, wordLength, isActive }) {
  // Pad with empty rows to make 6 total rows
  const maxGuesses = 6;
  const rows = [];

  for (let i = 0; i < maxGuesses; i++) {
    if (i < guesses.length) {
      // Completed guess (status array)
      rows.push(
        <div key={i} className="board-row">
          {guesses[i].statuses.map((status, j) => (
            <div key={j} className={`tile filled ${status}`}>
              {guesses[i].word[j]}
            </div>
          ))}
        </div>
      );
    } else if (i === guesses.length && isActive) {
      // Current active guess
      const currentLetters = currentGuess.split('');
      rows.push(
        <div key={i} className="board-row">
          {Array.from({ length: wordLength }).map((_, j) => (
            <div key={j} className={`tile ${currentLetters[j] ? 'filled' : ''}`}>
              {currentLetters[j] || ''}
            </div>
          ))}
        </div>
      );
    } else {
      // Empty row
      rows.push(
        <div key={i} className="board-row">
          {Array.from({ length: wordLength }).map((_, j) => (
            <div key={j} className="tile"></div>
          ))}
        </div>
      );
    }
  }

  return (
    <div className="board-wrap">
      <div className="board-grid">{rows}</div>
    </div>
  );
}
