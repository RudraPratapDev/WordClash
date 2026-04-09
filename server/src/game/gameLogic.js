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

function calculateScore(timeRemaining, guessesUsed, solved, isFirst) {
  if (!solved) return 0;
  
  let score = 100; // Base score
  // Bonus for time remaining
  if (timeRemaining > 0) {
    score += timeRemaining * 10;
  }
  // Bonus for efficiency (6 max guesses minus used guesses, 20 pts per unused guess)
  const unusedGuesses = 6 - guessesUsed;
  score += unusedGuesses * 20;
  
  if (isFirst) {
    score += 50;
  }
  
  return score;
}

module.exports = { validateGuess, calculateScore };
