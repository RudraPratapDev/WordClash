const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const AnalyticsUser = require('../models/AnalyticsUser');
const AnalyticsGame = require('../models/AnalyticsGame');
const Feedback = require('../models/Feedback');
const { WordReport } = require('../models/WordReport');

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
const JWT_ISSUER = 'wordclash-admin';
const JWT_AUDIENCE = 'wordclash-admin-ui';
const TOKEN_COOKIE = 'admin_token';
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of loginAttempts.entries()) {
    if (value.resetAt <= now) loginAttempts.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();

function securityConfigured() {
  return Boolean(ADMIN_PASSWORD && JWT_SECRET && ADMIN_PASSWORD.length >= 12 && JWT_SECRET.length >= 24);
}

function clearCookie(res) {
  res.clearCookie(TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
  });
}

function signToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '8h',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function consumeLoginAttempt(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const current = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + LOGIN_WINDOW_MS;
  }

  current.count += 1;
  loginAttempts.set(key, current);

  if (current.count > LOGIN_MAX_ATTEMPTS) {
    return { blocked: true, retryAfterMs: current.resetAt - now };
  }

  return { blocked: false, retryAfterMs: 0 };
}

function verifyAdmin(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return next();
  } catch (_err) {
    clearCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function toInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

router.post('/login', (req, res) => {
  if (!securityConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication is not configured correctly on server.',
    });
  }

  const attempt = consumeLoginAttempt(req.ip);
  if (attempt.blocked) {
    res.setHeader('Retry-After', String(Math.ceil(attempt.retryAfterMs / 1000)));
    return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
  }

  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8 || password.length > 128) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!safeEqualString(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = signToken();
  res.cookie(TOKEN_COOKIE, token, cookieOptions());
  return res.json({ success: true });
});

router.post('/logout', (_req, res) => {
  clearCookie(res);
  res.json({ success: true });
});

router.get('/session', verifyAdmin, (_req, res) => {
  res.json({ authenticated: true });
});

router.get('/dashboard', verifyAdmin, async (_req, res) => {
  try {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersToday,
      userTotals,
      totalGames,
      avgGame,
      avgGuesses,
      modeBreakdown,
      dauRaw,
      dau30Raw,
      wordLengths,
      roomSizes,
      d7CohortUsers,
      hasReturnedUsers,
      peakHours,
      guessBuckets,
      pendingReports,
      openFeedback,
      topReportedWords,
      feedbackByType,
    ] = await Promise.all([
      AnalyticsUser.countDocuments(),
      AnalyticsUser.countDocuments({ firstVisit: { $gte: dayAgo } }),
      AnalyticsUser.aggregate([
        {
          $group: {
            _id: null,
            gamesPlayed: { $sum: '$gamesPlayed' },
            gamesWon: { $sum: '$gamesWon' },
            oneGame: { $sum: { $cond: [{ $eq: ['$gamesPlayed', 1] }, 1, 0] } },
            twoToFive: {
              $sum: {
                $cond: [{ $and: [{ $gte: ['$gamesPlayed', 2] }, { $lte: ['$gamesPlayed', 5] }] }, 1, 0],
              },
            },
            sixToTen: {
              $sum: {
                $cond: [{ $and: [{ $gte: ['$gamesPlayed', 6] }, { $lte: ['$gamesPlayed', 10] }] }, 1, 0],
              },
            },
            tenPlus: { $sum: { $cond: [{ $gte: ['$gamesPlayed', 11] }, 1, 0] } },
          },
        },
      ]),
      AnalyticsGame.countDocuments(),
      AnalyticsGame.aggregate([{ $group: { _id: null, avg: { $avg: '$durationSeconds' } } }]),
      AnalyticsGame.aggregate([{ $group: { _id: null, avg: { $avg: '$guessesTaken' } } }]),
      AnalyticsGame.aggregate([{ $group: { _id: '$mode', count: { $sum: 1 } } }]),
      // 7-day DAU
      AnalyticsUser.aggregate([
        { $match: { lastVisit: { $gte: weekAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastVisit' } },
            users: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // 30-day DAU
      AnalyticsUser.aggregate([
        { $match: { lastVisit: { $gte: monthAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastVisit' } },
            users: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AnalyticsGame.aggregate([
        {
          $group: {
            _id: '$targetWordLength',
            games: { $sum: 1 },
            solvedRounds: { $sum: { $cond: ['$solved', 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AnalyticsGame.aggregate([
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $eq: ['$playerCount', 1] }, then: 'solo(1)' },
                  { case: { $eq: ['$playerCount', 2] }, then: '2 players' },
                  {
                    case: { $and: [{ $gte: ['$playerCount', 3] }, { $lte: ['$playerCount', 4] }] },
                    then: '3-4 players',
                  },
                ],
                default: '5+ players',
              },
            },
            games: { $sum: 1 },
          },
        },
      ]),
      // D7 cohort: users who returned within 7 days of their FIRST visit (lifetime metric)
      AnalyticsUser.countDocuments({
        $expr: {
          $and: [
            { $gt: ['$lastVisit', '$firstVisit'] },
            { $lte: [{ $subtract: ['$lastVisit', '$firstVisit'] }, 7 * 24 * 60 * 60 * 1000] },
          ],
        },
      }),
      // hasReturned: users who visited at least twice (lastVisit strictly after firstVisit)
      AnalyticsUser.countDocuments({
        $expr: { $gt: ['$lastVisit', '$firstVisit'] },
      }),
      AnalyticsUser.aggregate([
        {
          $group: {
            _id: { $hour: '$lastVisit' },
            users: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AnalyticsGame.aggregate([
        {
          $group: {
            _id: null,
            g1: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 0] }, 0] } },
            g2: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 1] }, 0] } },
            g3: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 2] }, 0] } },
            g4: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 3] }, 0] } },
            g5: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 4] }, 0] } },
            g6: { $sum: { $ifNull: [{ $arrayElemAt: ['$guessDistribution', 5] }, 0] } },
          },
        },
      ]),
      WordReport.countDocuments({ status: 'pending' }),
      Feedback.countDocuments({ status: 'open' }),
      // Top reported words (all time)
      WordReport.aggregate([
        { $group: { _id: '$reportedWord', count: { $sum: 1 }, category: { $first: '$category' } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      // Feedback breakdown by type
      Feedback.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    const modeMap = modeBreakdown.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});

    const totals = userTotals[0] || {
      gamesPlayed: 0,
      gamesWon: 0,
      oneGame: 0,
      twoToFive: 0,
      sixToTen: 0,
      tenPlus: 0,
    };

    // hasReturnedRate: % of ALL users who came back at least once (lastVisit > firstVisit)
    const hasReturnedRate = totalUsers > 0 ? Math.round((hasReturnedUsers / totalUsers) * 100) : 0;

    // roundSolveRate: rounds solved / rounds played (gamesPlayed counts rounds per player, not matches)
    const roundSolveRate = totals.gamesPlayed > 0 ? Math.round((totals.gamesWon / totals.gamesPlayed) * 100) : 0;

    // d7RetentionRate: % of ALL users who returned within 7 days of their FIRST visit (lifetime D7 cohort)
    const d7RetentionRate = totalUsers > 0 ? Math.round((d7CohortUsers / totalUsers) * 100) : 0;

    const guess = guessBuckets[0] || { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0 };

    const feedbackTypeMap = feedbackByType.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});

    res.json({
      stats: {
        totalUsers,
        newUsersToday,
        hasReturnedRate,
        totalRounds: totalGames,          // rounds, not matches
        soloRounds: modeMap.solo || 0,
        multiRounds: modeMap.multiplayer || 0,
        avgDuration: Math.round(avgGame[0]?.avg || 0),
        avgGuesses: Number((avgGuesses[0]?.avg || 0).toFixed(1)),
        roundSolveRate,                   // round-level solve %, not match win %
        d7RetentionRate,                  // lifetime D7 cohort, see comment above
        pendingReports,
        openFeedback,
      },
      charts: {
        // NOTE: dau / dau30 group by lastVisit date per user — not true session-level DAU.
        // A player active Mon+Tue only appears on Tue. Label reflects this.
        dau: dauRaw.map((row) => ({ date: row._id, users: row.users })),
        dau30: dau30Raw.map((row) => ({ date: row._id, users: row.users })),
        gameModes: [
          { mode: 'Solo', games: modeMap.solo || 0 },
          { mode: 'Multi', games: modeMap.multiplayer || 0 },
        ],
        // solveRate per word length (rounds that were solved / total rounds)
        wordLengthSolveRate: wordLengths.map((row) => ({
          length: `${row._id}-letter`,
          solveRate: row.games > 0 ? Math.round((row.solvedRounds / row.games) * 100) : 0,
          rounds: row.games,
        })),
        roomSizeDistribution: roomSizes.map((row) => ({ size: row._id, rounds: row.games })),
        // peakHours groups by lastVisit hour per user — skewed toward most recent session
        peakHours: peakHours.map((row) => ({ hour: `${String(row._id).padStart(2, '0')}:00`, users: row.users })),
        // gamesPlayed on AnalyticsUser counts rounds, not matches
        roundsPerPlayerDistribution: [
          { bucket: '1', players: totals.oneGame },
          { bucket: '2–5', players: totals.twoToFive },
          { bucket: '6–10', players: totals.sixToTen },
          { bucket: '11+', players: totals.tenPlus },
        ],
        guessDistribution: [
          { guess: '1', solves: guess.g1 },
          { guess: '2', solves: guess.g2 },
          { guess: '3', solves: guess.g3 },
          { guess: '4', solves: guess.g4 },
          { guess: '5', solves: guess.g5 },
          { guess: '6', solves: guess.g6 },
        ],
        topReportedWords: topReportedWords.map((row) => ({
          word: row._id,
          count: row.count,
          category: row.category,
        })),
        feedbackByType: [
          { type: 'Issues', count: feedbackTypeMap.issue || 0 },
          { type: 'Suggestions', count: feedbackTypeMap.suggestion || 0 },
        ],
      },
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to load admin analytics.' });
  }
});

router.get('/reports', verifyAdmin, async (req, res) => {
  const limit = toInt(req.query.limit, 40, 1, 200);
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'pending';
  const allowedStatuses = ['pending', 'reviewed', 'rejected'];
  const effectiveStatus = allowedStatuses.includes(status) ? status : 'pending';

  const reports = await WordReport.find({ status: effectiveStatus })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ reports });
});

router.patch('/reports/:id', verifyAdmin, async (req, res) => {
  const objectId = toObjectId(req.params.id);
  if (!objectId) return res.status(400).json({ success: false, message: 'Invalid report id.' });

  const status = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!['pending', 'reviewed', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  const updated = await WordReport.findByIdAndUpdate(objectId, { $set: { status } }, { new: true }).lean();
  if (!updated) return res.status(404).json({ success: false, message: 'Report not found.' });

  res.json({ success: true, report: updated });
});

router.get('/feedback', verifyAdmin, async (req, res) => {
  const limit = toInt(req.query.limit, 40, 1, 200);
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'open';
  const allowedStatuses = ['open', 'reviewed', 'resolved'];
  const effectiveStatus = allowedStatuses.includes(status) ? status : 'open';

  const items = await Feedback.find({ status: effectiveStatus })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ items });
});

router.patch('/feedback/:id', verifyAdmin, async (req, res) => {
  const objectId = toObjectId(req.params.id);
  if (!objectId) return res.status(400).json({ success: false, message: 'Invalid feedback id.' });

  const status = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  if (!['open', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  const updated = await Feedback.findByIdAndUpdate(objectId, { $set: { status } }, { new: true }).lean();
  if (!updated) return res.status(404).json({ success: false, message: 'Feedback not found.' });

  res.json({ success: true, item: updated });
});

module.exports = router;
