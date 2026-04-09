const buckets = require('./wordBuckets.json');

const WORDS_4 = buckets.words4 || [];
const WORDS_5 = buckets.words5 || [];
const WORDS_6 = buckets.words6 || [];

const TARGET_WORDS_4 = buckets.targetWords4 || WORDS_4;
const TARGET_WORDS_5 = buckets.targetWords5 || WORDS_5;
const TARGET_WORDS_6 = buckets.targetWords6 || WORDS_6;

const WORD_SET_4 = new Set(WORDS_4);
const WORD_SET_5 = new Set(WORDS_5);
const WORD_SET_6 = new Set(WORDS_6);

const validityCache = new Map();
const insightCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const INSIGHT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function getWordPool(length) {
  if (length === 4) return TARGET_WORDS_4;
  if (length === 5) return TARGET_WORDS_5;
  if (length === 6) return TARGET_WORDS_6;
  return TARGET_WORDS_5;
}

function getWordSet(length) {
  if (length === 4) return WORD_SET_4;
  if (length === 5) return WORD_SET_5;
  if (length === 6) return WORD_SET_6;
  return WORD_SET_5;
}

function getRandomWord(length, excludedWords = []) {
  const pool = getWordPool(length);
  const excludedSet = new Set(excludedWords.map(w => w.toUpperCase()));
  const available = pool.filter(word => !excludedSet.has(word));

  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function readCache(word) {
  const cached = validityCache.get(word);
  if (!cached) return null;

  if (Date.now() - cached.ts > CACHE_TTL_MS) {
    validityCache.delete(word);
    return null;
  }

  return cached.value;
}

function writeCache(word, value) {
  validityCache.set(word, { value, ts: Date.now() });
}

function readInsightCache(word) {
  const cached = insightCache.get(word);
  if (!cached) return null;

  if (Date.now() - cached.ts > INSIGHT_CACHE_TTL_MS) {
    insightCache.delete(word);
    return null;
  }

  return cached.value;
}

function writeInsightCache(word, value) {
  insightCache.set(word, { value, ts: Date.now() });
}

async function fetchWithTimeout(url, timeoutMs = Number(process.env.WORD_VALIDATION_TIMEOUT_MS || 5000)) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function validateFreeDictionaryApi(word) {
  try {
    const response = await fetchWithTimeout(`https://freedictionaryapi.com/api/v1/entries/en/${word.toLowerCase()}`);
    if (!response.ok) return false;

    const data = await response.json();
    return Boolean(data && Array.isArray(data.entries) && data.entries.length > 0);
  } catch {
    return false;
  }
}

async function validateDictionaryApiDev(word) {
  try {
    const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    if (!response.ok) return false;

    const data = await response.json();
    return Array.isArray(data) && data.some(entry => entry && typeof entry.word === 'string');
  } catch {
    return false;
  }
}

function normalizeDefinitionInsight(word, partOfSpeech, meaning, example, source) {
  if (!meaning || typeof meaning !== 'string') return null;

  const cleanText = (value) => {
    if (typeof value !== 'string') return '';

    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const cleanedMeaning = cleanText(meaning);
  if (!cleanedMeaning) return null;

  const cleanedExample = cleanText(example);

  return {
    word,
    partOfSpeech: partOfSpeech || 'Unknown',
    meaning: cleanedMeaning,
    example: cleanedExample,
    source,
  };
}

async function fetchDictionaryApiDevInsight(word) {
  try {
    const response = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`,
      Number(process.env.WORD_INSIGHT_TIMEOUT_MS || 1800)
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;

    for (const entry of data) {
      const meanings = Array.isArray(entry?.meanings) ? entry.meanings : [];
      for (const meaningBlock of meanings) {
        const defs = Array.isArray(meaningBlock?.definitions) ? meaningBlock.definitions : [];
        for (const def of defs) {
          const insight = normalizeDefinitionInsight(
            word,
            meaningBlock?.partOfSpeech,
            def?.definition,
            def?.example,
            'dictionaryapi.dev'
          );
          if (insight) return insight;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchWiktionaryInsight(word) {
  try {
    const response = await fetchWithTimeout(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${word.toLowerCase()}`,
      Number(process.env.WORD_INSIGHT_TIMEOUT_MS || 1800)
    );
    if (!response.ok) return null;

    const data = await response.json();
    const entries = Array.isArray(data?.en) ? data.en : [];
    if (!entries.length) return null;

    for (const entry of entries) {
      const definitions = Array.isArray(entry?.definitions) ? entry.definitions : [];
      for (const def of definitions) {
        const insight = normalizeDefinitionInsight(
          word,
          entry?.partOfSpeech,
          def?.definition,
          def?.examples?.[0],
          'wiktionary'
        );
        if (insight) return insight;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function getWordInsight(word) {
  const upper = (word || '').toUpperCase().trim();
  if (!/^[A-Z]+$/.test(upper)) return null;

  const cached = readInsightCache(upper);
  if (cached !== null) return cached;

  const results = await Promise.allSettled([
    fetchDictionaryApiDevInsight(upper),
    fetchWiktionaryInsight(upper),
  ]);

  const insight = results.find((result) => result.status === 'fulfilled' && result.value)?.value || null;
  writeInsightCache(upper, insight);
  return insight;
}

async function validateDatamuse(word) {
  try {
    const response = await fetchWithTimeout(`https://api.datamuse.com/words?sp=${word.toLowerCase()}&max=1000`);
    if (!response.ok) return false;

    const data = await response.json();
    if (!Array.isArray(data)) return false;

    return data.some(entry => (entry.word || '').toUpperCase() === word);
  } catch {
    return false;
  }
}

async function validateWiktionary(word) {
  try {
    const response = await fetchWithTimeout(`https://en.wiktionary.org/api/rest_v1/page/definition/${word.toLowerCase()}`);
    if (!response.ok) return false;

    const data = await response.json();
    return Boolean(data && Array.isArray(data.en) && data.en.length > 0);
  } catch {
    return false;
  }
}

async function isValidWord(word, expectedLength) {
  const upper = (word || '').toUpperCase().trim();
  const len = upper.length;

  if (!/^[A-Z]+$/.test(upper)) return false;
  if (expectedLength && len !== expectedLength) return false;

  // Fast path: O(1) in-memory set lookup from pre-generated bucket list.
  const setForLength = getWordSet(len);
  if (setForLength.has(upper)) return true;

  const cached = readCache(upper);
  if (cached !== null) return cached;

  // Fallback path: validate against multiple free dictionary APIs in parallel.
  const checks = await Promise.allSettled([
    validateFreeDictionaryApi(upper),
    validateDictionaryApiDev(upper),
    validateDatamuse(upper),
    validateWiktionary(upper),
  ]);

  const valid = checks.some(result => result.status === 'fulfilled' && result.value === true);
  writeCache(upper, valid);

  return valid;
}

function isValidWordSync(word) {
  const upper = (word || '').toUpperCase().trim();
  const len = upper.length;
  const setForLength = getWordSet(len);
  return setForLength.has(upper);
}

module.exports = { getRandomWord, isValidWord, isValidWordSync, getWordPool, getWordInsight };
