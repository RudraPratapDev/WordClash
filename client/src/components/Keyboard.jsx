import { useEffect } from 'react';

const KEYS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
];

export default function Keyboard({ onKeyPress, usedKeys, disabled = false }) {
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target;
      const isTypingField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isTypingField) {
        return;
      }

      if (disabled) {
        return;
      }

      let key = e.key.toUpperCase();
      if (key === 'ENTER' || key === 'BACKSPACE') {
        onKeyPress(key);
      } else if (/^[A-Z]$/.test(key)) {
        onKeyPress(key);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKeyPress, disabled]);

  return (
    <div className="keyboard">
      {KEYS.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(key => {
            const status = usedKeys[key] || '';
            const isAction = key === 'ENTER' || key === 'BACKSPACE';
            const displayLabel = key === 'BACKSPACE' ? '⌫' : key;
            return (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className={`key-btn ${isAction ? 'action' : ''} ${status}`}
                disabled={disabled}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
