/**
 * seed-dev.js — populate local MongoDB with realistic fake data for development.
 *
 * Usage:
 *   npm run seed           (from server/)
 *   node scripts/seed-dev.js
 *
 * Safe to run multiple times — uses upsert where possible.
 * Requires MONGODB_URI in environment (or reads from .env automatically).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wordclash';

// ── Inline mini-schemas (avoid polluting app models) ─────────────────────────
const AnalyticsUser = mongoose.model(
  'AnalyticsUser',
  new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    firstVisit: { type: Date, default: Date.now },
    lastVisit: { type: Date, default: Date.now },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
  })
);

const AnalyticsGame = mongoose.model(
  'AnalyticsGame',
  new mongoose.Schema({
    roomId: { type: String, required: true },
    mode: { type: String, enum: ['solo', 'multiplayer'], required: true },
    durationSeconds: { type: Number, required: true },
    winnerId: { type: String, default: null },
    targetWordLength: { type: Number, required: true },
    guessesTaken: { type: Number, required: true },
    guessDistribution: { type: [Number], default: () => [0, 0, 0, 0, 0, 0] },
    playerCount: { type: Number, required: true },
    solvedCount: { type: Number, required: true },
    solved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  })
);

const WordReport = mongoose.model(
  'WordReport',
  new mongoose.Schema(
    {
      reportedWord: { type: String, required: true, uppercase: true },
      category: { type: String, default: 'other' },
      reasonText: { type: String, default: '' },
      reporter: {
        playerPublicId: { type: String, required: true },
        playerName: { type: String, required: true },
        playerKeyHash: { type: String, required: true },
        ipHash: { type: String, required: true },
      },
      match: {
        roomId: { type: String, required: true },
        currentRound: { type: Number, required: true },
        numRounds: { type: Number, required: true },
        wordLength: { type: Number, required: true },
        matchStateAtReport: { type: String, required: true },
      },
      metadata: { clientVersion: { type: String, default: '' }, source: { type: String, default: 'in-game' }, userAgent: { type: String, default: '' } },
      status: { type: String, enum: ['pending', 'reviewed', 'rejected'], default: 'pending' },
    },
    { timestamps: true }
  )
);

const Feedback = mongoose.model(
  'Feedback',
  new mongoose.Schema(
    {
      type: { type: String, enum: ['issue', 'suggestion'], required: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      contactEmail: { type: String, default: '' },
      page: { type: String, default: 'panda-den' },
      status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
      metadata: { ipHash: { type: String, default: '' }, userAgent: { type: String, default: '' } },
    },
    { timestamps: true }
  )
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000); }

const NAMES = ['Panda', 'Tiger', 'Falcon', 'Wolf', 'Lynx', 'Hawk', 'Bear', 'Fox', 'Orca', 'Crane', 'Viper', 'Raven'];
const WORDS = ['CRANE', 'BLAZE', 'STOUT', 'QUIRK', 'FROST', 'GRASP', 'PLUMB', 'STOMP', 'FLINT', 'GROAN'];
const CATEGORIES = ['offensive', 'invalid', 'proper_noun', 'misspelled', 'other'];

async function seed() {
  console.log(`\n🌱 Connecting to ${MONGODB_URI} …`);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 6000 });
  console.log('✅ Connected\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log('⏳ Seeding AnalyticsUser …');
  const userCount = 60;
  for (let i = 0; i < userCount; i++) {
    const firstVisit = daysAgo(rnd(1, 30));
    const lastVisit = new Date(firstVisit.getTime() + rnd(0, 8) * 24 * 60 * 60 * 1000);
    const gamesPlayed = rnd(1, 20);
    const gamesWon = rnd(0, gamesPlayed);
    await AnalyticsUser.updateOne(
      { deviceId: `dev-device-${i}` },
      { deviceId: `dev-device-${i}`, firstVisit, lastVisit: lastVisit > new Date() ? new Date() : lastVisit, gamesPlayed, gamesWon },
      { upsert: true }
    );
  }
  console.log(`   ✓ ${userCount} users upserted`);

  // ── Games ──────────────────────────────────────────────────────────────────
  console.log('⏳ Seeding AnalyticsGame …');
  await AnalyticsGame.deleteMany({ roomId: /^dev-room-/ });
  const gameDocs = [];
  for (let i = 0; i < 220; i++) {
    const wordLength = choice([4, 5, 6]);
    const playerCount = choice([1, 1, 2, 2, 3, 4, 5]);
    const mode = playerCount === 1 ? 'solo' : 'multiplayer';
    const solved = Math.random() > 0.35;
    const guessesTaken = solved ? rnd(1, 6) : 6;
    const dist = [0, 0, 0, 0, 0, 0];
    if (solved) dist[guessesTaken - 1] = rnd(1, 3);
    gameDocs.push({
      roomId: `dev-room-${i}`,
      mode,
      durationSeconds: rnd(45, 420),
      winnerId: solved ? `dev-device-${rnd(0, 59)}` : null,
      targetWordLength: wordLength,
      guessesTaken,
      guessDistribution: dist,
      playerCount,
      solvedCount: solved ? rnd(1, playerCount) : 0,
      solved,
      createdAt: daysAgo(rnd(0, 30)),
    });
  }
  await AnalyticsGame.insertMany(gameDocs);
  console.log(`   ✓ ${gameDocs.length} games inserted`);

  // ── Word Reports ───────────────────────────────────────────────────────────
  console.log('⏳ Seeding WordReport …');
  await WordReport.deleteMany({ 'metadata.source': 'seed' });
  const reportDocs = [];
  const reportWords = ['CRANE', 'CRANE', 'CRANE', 'QUIRK', 'BLAZE', 'BLAZE', 'STOMP', 'PLUMB'];
  for (let i = 0; i < reportWords.length; i++) {
    reportDocs.push({
      reportedWord: reportWords[i],
      category: choice(CATEGORIES),
      reasonText: 'Seeded test report — not a real report.',
      reporter: {
        playerPublicId: `pub-${i}`,
        playerName: choice(NAMES),
        playerKeyHash: `keyhash-${i}`,
        ipHash: `iphash-${i}`,
      },
      match: {
        roomId: `dev-room-report-${i}`,
        currentRound: rnd(1, 3),
        numRounds: 3,
        wordLength: reportWords[i].length,
        matchStateAtReport: 'active',
      },
      metadata: { source: 'seed' },
      status: i < 5 ? 'pending' : 'reviewed',
    });
  }
  await WordReport.insertMany(reportDocs);
  console.log(`   ✓ ${reportDocs.length} word reports inserted`);

  // ── Feedback ───────────────────────────────────────────────────────────────
  console.log('⏳ Seeding Feedback …');
  await Feedback.deleteMany({ page: 'seed' });
  const feedbackDocs = [
    { type: 'suggestion', title: 'Add solo leaderboard', message: 'Would love a global leaderboard for solo mode.', status: 'open', page: 'seed' },
    { type: 'issue', title: 'Dark mode flicker on load', message: 'Brief flash of light mode before dark mode kicks in.', status: 'open', page: 'seed' },
    { type: 'suggestion', title: 'Custom word length per round', message: 'Let room host switch word length mid-game.', status: 'open', page: 'seed' },
    { type: 'issue', title: 'Keyboard shortcuts not working', message: 'Enter key sometimes ignored on mobile.', status: 'reviewed', page: 'seed' },
    { type: 'suggestion', title: 'Replay last game', message: 'Button to see the full board replay after a match ends.', status: 'open', page: 'seed' },
  ];
  await Feedback.insertMany(feedbackDocs);
  console.log(`   ✓ ${feedbackDocs.length} feedback items inserted`);

  await mongoose.disconnect();
  console.log('\n🎉 Seed complete! Start the server and visit /admin/analytics');
  console.log('   Credentials: ADMIN_PASSWORD from your .env (dev-admin-password123 if using .env.local.example)\n');
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
