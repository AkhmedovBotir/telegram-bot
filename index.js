const mongoose = require('mongoose');
const config = require('./config/config');
const { initBot } = require('./controllers/botController');

// Import models to ensure they are registered with mongoose
require('./models/User');
require('./models/DriverInvite');

// Connect to MongoDB with options
mongoose.connect(config.mongodbUri, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Initialize the Telegram bot
    initBot();
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    
    // We'll still initialize the bot even if MongoDB fails
    console.log('Starting bot without MongoDB...');
    initBot();
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  if (mongoose.connection.readyState !== 0) {
    mongoose.connection.close(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
