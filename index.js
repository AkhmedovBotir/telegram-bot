
import { Telegraf, session } from 'telegraf';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from './config.js';
import { connectDB } from './database/db.js';
import User from './models/user.js';
import Setting from './models/setting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize the bot first so it can be exported
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Import handlers after bot has been initialized
import * as helpers from './utils/helpers.js';
import { adminHandler } from './handlers/adminHandler.js';
import userHandler from './handlers/userHandler.js';

// Connect to MongoDB
connectDB();

// Initialize default settings if they don't exist
helpers.initializeSettings();

// Use session middleware
bot.use(session());

// Import and start notification system
import { checkExpiringMemberships } from './utils/notifications.js';
// Check every 45 seconds to avoid rate limiting
setInterval(checkExpiringMemberships, 45000);

// Initial check on startup
setTimeout(checkExpiringMemberships, 5000);

// Set up middleware to check user status
bot.use(async (ctx, next) => {
  if (ctx.from) {
    // Initialize session object if it doesn't exist
    ctx.session = ctx.session || {};
    
    // Check if the user exists in the database
    let user = await User.findOne({ telegramId: ctx.from.id });
    
    // Save context information
    ctx.session.isAdmin = ctx.from.id === config.ADMIN_USER_ID;
    ctx.session.user = user;
    
    // Log the interaction for debugging
    const messageType = ctx.updateType || 'unknown';
    const callbackData = ctx.callbackQuery ? ctx.callbackQuery.data : '';
    
    if (callbackData) {
      console.log(`User ${ctx.from.id} (Admin: ${ctx.session.isAdmin}) sent callback: ${callbackData}`);
    } else {
      console.log(`User ${ctx.from.id} (Admin: ${ctx.session.isAdmin}) interacted with the bot`);
    }
  }
  
  return next();
});

// Register command handlers
bot.start(async (ctx) => {
  if (ctx.session.isAdmin) {
    return adminHandler.handleStart(ctx);
  } else {
    return userHandler.handleStart(ctx);
  }
});

// Handle callback queries from inline keyboards
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  
  // Acknowledge the callback query
  await ctx.answerCbQuery();
  
  if (ctx.session.isAdmin) {
    return adminHandler.handleCallbackQuery(ctx, callbackData);
  } else {
    return userHandler.handleCallbackQuery(ctx, callbackData);
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  if (ctx.session.isAdmin) {
    return adminHandler.handleTextMessage(ctx);
  } else {
    return userHandler.handleTextMessage(ctx);
  }
});

// Handle contact sharing
bot.on('contact', async (ctx) => {
  if (!ctx.session.isAdmin) {
    return userHandler.handleContact(ctx);
  }
});

// Error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred while processing your request. Please try again later.');
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully!');
    
    // Check if new invite links feature is active
    if (process.env.GENERATE_NEW_INVITE_LINKS) {
      if (process.env.GROUP_ID) {
        console.log(`New invite link generation active for group: ${process.env.GROUP_ID}`);
      } else {
        console.warn('GENERATE_NEW_INVITE_LINKS is enabled but GROUP_ID is not set. New links will not be generated.');
      }
    }
  })
  .catch((err) => {
    console.error('Error starting the bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export { bot };
