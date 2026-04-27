const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['issue', 'suggestion'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: '',
    },
    page: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'panda-den',
    },
    status: {
      type: String,
      enum: ['open', 'reviewed', 'resolved'],
      default: 'open',
    },
    metadata: {
      ipHash: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
