const crypto = require('crypto');
const { WordReport, REPORT_CATEGORIES } = require('../models/WordReport');
const { isMongoReady } = require('../db/mongo');

const REPORT_REASON_MAX_LENGTH = Number(process.env.WORD_REPORT_REASON_MAX_LENGTH || 300);
const HASH_SALT = process.env.WORD_REPORT_HASH_SALT || 'wordclash-default-salt';

function sha256(value) {
  return crypto.createHash('sha256').update(`${HASH_SALT}:${value}`).digest('hex');
}

function sanitizeCategory(category) {
  if (typeof category !== 'string') return 'other';
  const normalized = category.trim().toLowerCase();
  return REPORT_CATEGORIES.includes(normalized) ? normalized : 'other';
}

function sanitizeReasonText(reasonText) {
  if (typeof reasonText !== 'string') return '';
  return reasonText.replace(/\s+/g, ' ').trim().slice(0, REPORT_REASON_MAX_LENGTH);
}

async function saveWordReport(input) {
  if (!isMongoReady()) {
    return { ok: false, unavailable: true, message: 'Reporting service is temporarily unavailable.' };
  }

  try {
    const doc = await WordReport.create({
      reportedWord: input.reportedWord,
      category: sanitizeCategory(input.category),
      reasonText: sanitizeReasonText(input.reasonText),
      reporter: {
        playerPublicId: input.playerPublicId,
        playerName: input.playerName,
        playerKeyHash: sha256(input.playerKey),
        ipHash: sha256(input.ipAddress || 'unknown-ip'),
      },
      match: {
        roomId: input.roomId,
        currentRound: input.currentRound,
        numRounds: input.numRounds,
        wordLength: input.wordLength,
        matchStateAtReport: input.matchStateAtReport,
      },
      metadata: {
        clientVersion: typeof input.clientVersion === 'string' ? input.clientVersion.slice(0, 40) : '',
        source: 'in-game',
        userAgent: typeof input.userAgent === 'string' ? input.userAgent.slice(0, 200) : '',
      },
      status: 'pending',
    });

    return { ok: true, reportId: doc._id.toString() };
  } catch (error) {
    if (error?.code === 11000) {
      return { ok: false, duplicate: true, message: 'You have already reported this word for this round.' };
    }

    console.error('[word-report] save failed:', error.message);
    return { ok: false, message: 'Unable to save your report right now.' };
  }
}

module.exports = {
  REPORT_REASON_MAX_LENGTH,
  REPORT_CATEGORIES,
  sanitizeCategory,
  sanitizeReasonText,
  saveWordReport,
};
