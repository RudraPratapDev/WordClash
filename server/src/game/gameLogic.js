function validateGuess(guess, targetWord) {
  // Returns an array of statuses: 'correct' (green), 'present' (yellow), 'absent' (gray)
  const guessArr = guess.toUpperCase().split('');
  const targetArr = targetWord.toUpperCase().split('');
  const result = new Array(guessArr.length).fill('absent');
  
  // Create a frequency map of the target word
  const letterCount = {};
  for (let i = 0; i < targetArr.length; i++) {
    const char = targetArr[i];
    letterCount[char] = (letterCount[char] || 0) + 1;
  }
  
  // First pass: check for correct matches (green)
  for (let i = 0; i < guessArr.length; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct';
      letterCount[guessArr[i]] -= 1;
    }
  }
  
  // Second pass: check for present matches (yellow)
  for (let i = 0; i < guessArr.length; i++) {
    if (result[i] !== 'correct' && letterCount[guessArr[i]] > 0) {
      result[i] = 'present';
      letterCount[guessArr[i]] -= 1;
    }
  }
  
  return result;
}

function calculateScore(timeRemaining, guessesUsed, solved, isFirst, timeLimit = 120, wordLength = 5) {
  if (!solved) return 0;

  const safeTimeLimit = Math.max(1, Number(timeLimit) || 120);
  const safeTimeRemaining = Math.max(0, Number(timeRemaining) || 0);
  const safeGuessesUsed = Math.min(6, Math.max(1, Math.floor(Number(guessesUsed) || 6)));
  const safeWordLength = Math.min(6, Math.max(4, Math.floor(Number(wordLength) || 5)));

  // Accuracy is king: better rewards for solving in fewer attempts.
  const accuracyBonusTable = {
    1: 240,
    2: 185,
    3: 145,
    4: 105,
    5: 70,
    6: 40,
  };

  const basePoints = 120;
  const accuracyBonus = accuracyBonusTable[safeGuessesUsed] || 40;
  const speedRatio = Math.min(1, safeTimeRemaining / safeTimeLimit);
  const speedBonus = Math.round(speedRatio * 220);
  const firstSolveBonus = isFirst ? 90 : 0;
  const difficultyBonus = (safeWordLength - 4) * 35;

  return Math.max(0, Math.round(basePoints + accuracyBonus + speedBonus + firstSolveBonus + difficultyBonus));
}

module.exports = { validateGuess, calculateScore };
