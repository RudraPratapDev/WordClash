import { memo, useEffect, useState } from 'react';

function Board({ guesses, currentGuess, wordLength, isActive, isSubmittingGuess = false, invalidPulseKey = 0 }) {
  const [showInvalidPulse, setShowInvalidPulse] = useState(false);

  useEffect(() => {
    if (invalidPulseKey <= 0) return;

    setShowInvalidPulse(true);
    const timeoutId = setTimeout(() => {
      setShowInvalidPulse(false);
    }, 360);

    return () => clearTimeout(timeoutId);
  }, [invalidPulseKey]);

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
    } else if (i === guesses.length && (isActive || currentGuess.length > 0)) {
      // Keep the pending guess visible while validation is in progress.
      const currentLetters = currentGuess.split('');
      const rowClasses = [
        'board-row',
        isSubmittingGuess ? 'is-submitting' : '',
        showInvalidPulse ? 'is-invalid' : '',
      ]
        .filter(Boolean)
        .join(' ');

      rows.push(
        <div key={i} className={rowClasses}>
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

export default memo(Board);
