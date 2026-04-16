const mongoose = require('mongoose');

const REPORT_CATEGORIES = ['offensive', 'invalid', 'proper_noun', 'misspelled', 'other'];

const wordReportSchema = new mongoose.Schema(
  {
    reportedWord: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 4,
      maxlength: 6,
    },
    category: {
      type: String,
      required: true,
      enum: REPORT_CATEGORIES,
      default: 'other',
    },
    reasonText: {
      type: String,
      default: '',
      maxlength: 300,
      trim: true,
    },
    reporter: {
      playerPublicId: { type: String, required: true },
      playerName: { type: String, required: true },
      playerKeyHash: { type: String, required: true },
      ipHash: { type: String, required: true },
    },
    match: {
      roomId: { type: String, required: true },
      currentRound: { type: Number, required: true, min: 1 },
      numRounds: { type: Number, required: true, min: 1 },
      wordLength: { type: Number, required: true, min: 4, max: 6 },
      matchStateAtReport: { type: String, required: true },
    },
    metadata: {
      clientVersion: { type: String, default: '' },
      source: { type: String, default: 'in-game' },
      userAgent: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

wordReportSchema.index(
  {
    'reporter.playerKeyHash': 1,
    'match.roomId': 1,
    'match.currentRound': 1,
    reportedWord: 1,
  },
  {
    unique: true,
    name: 'uniq_report_per_player_per_round',
  }
);

wordReportSchema.index({ createdAt: -1 });
wordReportSchema.index({ status: 1, createdAt: -1 });

module.exports = {
  WordReport: mongoose.model('WordReport', wordReportSchema),
  REPORT_CATEGORIES,
};
