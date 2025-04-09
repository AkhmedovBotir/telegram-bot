const mongoose = require('mongoose');
const config = require('../config');

const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('MongoDB connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected. Attempting to reconnect...');
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    // Don't exit the process, allow for retry
    return null;
  }
};

module.exports = { connectDB };
