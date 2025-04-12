const mongoose = require('mongoose');

const driverInviteSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  inviteLink: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isExpired: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 864000 // 10 days in seconds
  },
  expiresAt: {
    type: Date,
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  hasPaid: {
    type: Boolean,
    default: false
  },
  paymentPhotoId: {
    type: String,
    default: null
  },
  paymentApproved: {
    type: Boolean,
    default: false
  },
  paymentDate: {
    type: Date,
    default: null
  },
  // Guruh a'zoligini tekshirish uchun
  isInGroup: {
    type: Boolean,
    default: false
  },
  joinedGroupAt: {
    type: Date,
    default: null
  },
  // Ogohlantirish darajasi saqlash uchun
  lastWarningLevel: {
    type: Number,
    default: 0
  }
});

const DriverInvite = mongoose.model('DriverInvite', driverInviteSchema);

module.exports = DriverInvite;
