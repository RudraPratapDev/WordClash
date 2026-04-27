const mongoose = require('mongoose');

const analyticsGameSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    mode: { type: String, enum: ['solo', 'multiplayer'], required: true },
    durationSeconds: { type: Number, required: true },
    winnerId: { type: String, default: null }, // deviceId of the winner, or null if no winner
    targetWordLength: { type: Number, required: true },
    guessesTaken: { type: Number, required: true },
    guessDistribution: {
        type: [Number],
        default: () => [0, 0, 0, 0, 0, 0], // solved in 1..6 guesses
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length === 6,
            message: 'guessDistribution must be an array of 6 numbers'
        }
    },
    playerCount: { type: Number, required: true, min: 1 },
    solvedCount: { type: Number, required: true, min: 0 },
    solved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AnalyticsGame', analyticsGameSchema);
