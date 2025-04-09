const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  fullName: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  username: {
    type: String,
    trim: true
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  accessGranted: {
    type: Boolean,
    default: false
  },
  accessExpiryDate: {
    type: Date,
    default: null
  },
  state: {
    type: String,
    enum: ['new', 'waiting_name', 'waiting_phone', 'active', 'expired'],
    default: 'new'
  },
  isInGroup: {
    type: Boolean,
    default: false
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  inviteLink: {
    type: String,
    default: null
  }
});

// Add index for improving query performance - removed duplicate telegramId index
userSchema.index({ state: 1 });
userSchema.index({ accessExpiryDate: 1 });

module.exports = mongoose.model('User', userSchema);
