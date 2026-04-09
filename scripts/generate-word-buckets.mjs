import fs from 'fs';
import path from 'path';

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'words_alpha.txt');
const web2Path = '/usr/share/dict/web2';
const commonEnglishPath = path.join(root, 'data', 'common_english_4_6.txt');
const csvPaths = {
  4: path.join(root, 'data', 'words_4_letters.csv'),
  5: path.join(root, 'data', 'words_5_letters.csv'),
  6: path.join(root, 'data', 'words_6_letters.csv'),
};
const outputPath = path.join(root, 'server', 'src', 'game', 'wordBuckets.json');

const alphaRaw = fs.readFileSync(sourcePath, 'utf8');
const alphaLines = alphaRaw.split(/\r?\n/);

const lengths = [4, 5, 6];
const alphaBuckets = Object.fromEntries(lengths.map((len) => [len, new Set()]));

function parseCsvWordCell(line) {
  const trimmed = line.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('"')) {
    const closingQuote = trimmed.indexOf('"', 1);
    if (closingQuote > 1) {
      return trimmed.slice(1, closingQuote);
    }
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) return trimmed;
  return trimmed.slice(0, commaIndex);
}

function readCsvWords(csvPath, expectedLength) {
  if (!fs.existsSync(csvPath)) return [];

  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
  const seen = new Set();
  const ordered = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const rawWord = parseCsvWordCell(line);
    const word = rawWord.trim().toUpperCase();
    if (word === 'WORD') continue;
    if (!/^[A-Z]+$/.test(word)) continue;
    if (word.length !== expectedLength) continue;
    if (seen.has(word)) continue;

    seen.add(word);
    ordered.push(word);
  }

  return ordered;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : fallback;
}

function getThresholdForLength(len, keyPrefix, defaultValue) {
  const specific = process.env[`${keyPrefix}_${len}`];
  if (specific !== undefined) return toPositiveInt(specific, defaultValue);
  const global = process.env[keyPrefix];
  if (global !== undefined) return toPositiveInt(global, defaultValue);
  return defaultValue;
}

const DEFAULT_TARGET_THRESHOLDS = {
  4: 1500,
  5: 1500,
  6: 1500,
};

// Validation thresholds are tuned from each CSV's frequency curve.
const DEFAULT_VALIDATION_THRESHOLDS = {
  4: 9000,
  5: 12000,
  6: 14000,
};

const BLOCKLIST = new Set([
  'NIGGA',
  'NIGGER',
  'SEXXX',
  'CUNTS',
  'CLITS',
  'RAPED',
  'RAPER',
  'RAPES',
]);

function isLikelyJunkWord(word) {
  if (BLOCKLIST.has(word)) return true;
  if (!/[AEIOUY]/.test(word)) return true;
  if (/([A-Z])\1\1/.test(word)) return true;
  return false;
}

for (const line of alphaLines) {
  const word = line.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(word)) continue;
  if (!alphaBuckets[word.length]) continue;
  alphaBuckets[word.length].add(word);
}

const finalBuckets = Object.fromEntries(lengths.map((len) => [len, new Set(alphaBuckets[len])]));
const csvValidationOrdered = Object.fromEntries(lengths.map((len) => [len, []]));
const targetBuckets = Object.fromEntries(lengths.map((len) => [len, []]));
const activeSources = ['data/words_alpha.txt'];

// If the local macOS web2 dictionary is available, use intersection for stricter English-only quality.
if (fs.existsSync(web2Path)) {
  const web2Raw = fs.readFileSync(web2Path, 'utf8');
  const web2Lines = web2Raw.split(/\r?\n/);
  const web2Buckets = Object.fromEntries(lengths.map((len) => [len, new Set()]));

  for (const line of web2Lines) {
    const word = line.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(word)) continue;
    if (!web2Buckets[word.length]) continue;
    web2Buckets[word.length].add(word);
  }

  for (const len of lengths) {
    finalBuckets[len] = new Set([...alphaBuckets[len]].filter((word) => web2Buckets[len].has(word)));
  }

  activeSources.push('/usr/share/dict/web2');
}

// Optional strict filter: keep only common English words (precomputed allowlist).
if (fs.existsSync(commonEnglishPath)) {
  const commonRaw = fs.readFileSync(commonEnglishPath, 'utf8');
  const commonSet = new Set(
    commonRaw
      .split(/\r?\n/)
      .map((line) => line.trim().toUpperCase())
      .filter((word) => /^[A-Z]+$/.test(word))
  );

  for (const len of lengths) {
    finalBuckets[len] = new Set([...finalBuckets[len]].filter((word) => commonSet.has(word)));
  }

  activeSources.push('data/common_english_4_6.txt');
}

for (const len of lengths) {
  const csvWords = readCsvWords(csvPaths[len], len);
  if (!csvWords.length) continue;

  const validationThreshold = getThresholdForLength(len, 'WORD_VALIDATION_THRESHOLD', DEFAULT_VALIDATION_THRESHOLDS[len]);
  const validationCandidates = validationThreshold > 0 ? csvWords.slice(0, validationThreshold) : csvWords;
  const validationWords = validationCandidates.filter((word) => !isLikelyJunkWord(word));

  csvValidationOrdered[len] = validationWords;

  for (const word of validationWords) {
    finalBuckets[len].add(word);
  }

  const targetThreshold = getThresholdForLength(len, 'WORD_TARGET_THRESHOLD', DEFAULT_TARGET_THRESHOLDS[len]);
  const targetWords = targetThreshold > 0 ? validationWords.slice(0, targetThreshold) : validationWords;
  targetBuckets[len] = targetWords;
}

for (const len of lengths) {
  if (!targetBuckets[len].length) {
    // Fallback to the main validation pool if CSV file is missing or empty.
    targetBuckets[len] = [...finalBuckets[len]].sort();
  }
}

if (lengths.some((len) => csvValidationOrdered[len].length > 0)) {
  activeSources.push('data/words_4_letters.csv');
  activeSources.push('data/words_5_letters.csv');
  activeSources.push('data/words_6_letters.csv');
}

const output = {
  generatedAt: new Date().toISOString(),
  source: activeSources.join(' + '),
  words4: [...finalBuckets[4]].sort(),
  words5: [...finalBuckets[5]].sort(),
  words6: [...finalBuckets[6]].sort(),
  targetWords4: targetBuckets[4],
  targetWords5: targetBuckets[5],
  targetWords6: targetBuckets[6],
  thresholds: {
    target: {
      4: getThresholdForLength(4, 'WORD_TARGET_THRESHOLD', DEFAULT_TARGET_THRESHOLDS[4]),
      5: getThresholdForLength(5, 'WORD_TARGET_THRESHOLD', DEFAULT_TARGET_THRESHOLDS[5]),
      6: getThresholdForLength(6, 'WORD_TARGET_THRESHOLD', DEFAULT_TARGET_THRESHOLDS[6]),
    },
    validation: {
      4: getThresholdForLength(4, 'WORD_VALIDATION_THRESHOLD', DEFAULT_VALIDATION_THRESHOLDS[4]),
      5: getThresholdForLength(5, 'WORD_VALIDATION_THRESHOLD', DEFAULT_VALIDATION_THRESHOLDS[5]),
      6: getThresholdForLength(6, 'WORD_VALIDATION_THRESHOLD', DEFAULT_VALIDATION_THRESHOLDS[6]),
    },
  },
};

fs.writeFileSync(outputPath, JSON.stringify(output));

console.log('Word buckets generated (validated dictionaries)');
console.log(`4-letter: ${output.words4.length}`);
console.log(`5-letter: ${output.words5.length}`);
console.log(`6-letter: ${output.words6.length}`);
console.log(`Target 4-letter: ${output.targetWords4.length}`);
console.log(`Target 5-letter: ${output.targetWords5.length}`);
console.log(`Target 6-letter: ${output.targetWords6.length}`);
console.log(`Output: ${outputPath}`);
