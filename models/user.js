
import mongoose from 'mongoose';

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
    enum: ['new', 'waiting_name', 'waiting_phone', 'waiting_payment', 'waiting_approval', 'active', 'expired'],
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
  },
  paymentImage: {
    type: String,
    default: null
  },
  paymentDate: {
    type: Date,
    default: null
  },
  lastNotification: {
    type: Date,
    default: null
  },
  notificationCount: {
    type: Number,
    default: 0
  }
});

userSchema.index({ state: 1 });
userSchema.index({ accessExpiryDate: 1 });

const User = mongoose.model('User', userSchema);
export default User;
