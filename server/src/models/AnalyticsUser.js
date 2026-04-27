const mongoose = require('mongoose');

const analyticsUserSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    firstVisit: { type: Date, default: Date.now },
    lastVisit: { type: Date, default: Date.now },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 }
});

module.exports = mongoose.model('AnalyticsUser', analyticsUserSchema);
