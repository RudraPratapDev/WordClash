const express = require('express');
const crypto = require('crypto');
const Feedback = require('../models/Feedback');
const { isMongoReady } = require('../db/mongo');

const router = express.Router();

const FEEDBACK_WINDOW_MS = Number(process.env.FEEDBACK_WINDOW_MS || 10 * 60 * 1000);
const FEEDBACK_MAX_PER_WINDOW = Number(process.env.FEEDBACK_MAX_PER_WINDOW || 5);
const FEEDBACK_HASH_SALT = process.env.FEEDBACK_HASH_SALT || 'wordclash-feedback-default-salt';

const feedbackRateLimit = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of feedbackRateLimit.entries()) {
    if (value.resetAt <= now) feedbackRateLimit.delete(key);
  }
}, Math.max(60_000, Math.floor(FEEDBACK_WINDOW_MS / 2))).unref();

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function hashValue(value) {
  return crypto.createHash('sha256').update(`${FEEDBACK_HASH_SALT}:${value}`).digest('hex');
}

function consumeRateLimit(key) {
  const now = Date.now();
  const current = feedbackRateLimit.get(key) || { count: 0, resetAt: now + FEEDBACK_WINDOW_MS };

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + FEEDBACK_WINDOW_MS;
  }

  current.count += 1;
  feedbackRateLimit.set(key, current);

  return {
    allowed: current.count <= FEEDBACK_MAX_PER_WINDOW,
    resetAt: current.resetAt,
  };
}

router.post('/', async (req, res) => {
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, message: 'Feedback service unavailable.' });
  }

  const type = typeof req.body?.type === 'string' ? req.body.type.trim().toLowerCase() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  const contactEmail = typeof req.body?.contactEmail === 'string' ? req.body.contactEmail.trim().slice(0, 120) : '';
  const page = typeof req.body?.page === 'string' ? req.body.page.trim().slice(0, 80) : 'panda-den';

  if (!['issue', 'suggestion'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid feedback type.' });
  }

  if (title.length < 5 || message.length < 10) {
    return res.status(400).json({ success: false, message: 'Please add more details.' });
  }

  const ip = getClientIp(req);
  const limiter = consumeRateLimit(ip);
  if (!limiter.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ success: false, message: 'Too many submissions. Try later.' });
  }

  try {
    await Feedback.create({
      type,
      title,
      message,
      contactEmail,
      page,
      metadata: {
        ipHash: hashValue(ip),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 240) : '',
      },
    });

    return res.json({ success: true });
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Failed to submit feedback.' });
  }
});

module.exports = router;
