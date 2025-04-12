const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: false
  },
  firstName: {
    type: String,
    required: false
  },
  lastName: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['user', 'driver', 'undefined'],
    default: 'undefined'
  },
  // Haydovchi uchun qo'shimcha ma'lumotlar
  fullName: {
    type: String,
    required: false
  },
  phoneNumber: {
    type: String,
    required: false
  },
  // User statusi - keyingi xabar bilan nima qilish kerakligini ko'rsatadi
  state: {
    type: String,
    enum: ['normal', 'waiting_fullname', 'waiting_phone', 'waiting_payment_photo'],
    default: 'normal'
  },
  // To'lov holati
  paymentStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  }
});

// Update the last interaction time
userSchema.methods.updateLastInteraction = function() {
  this.lastInteraction = Date.now();
  return this.save();
};

// Set user role
userSchema.methods.setRole = function(role) {
  this.role = role;
  return this.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
