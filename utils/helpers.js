const Setting = require('../models/setting');
const User = require('../models/user');
const config = require('../config');

// Initialize default bot settings
const initializeSettings = async () => {
  try {
    // Define default text settings
    const defaultSettings = [
      {
        key: 'text_welcome',
        value: 'Welcome to our bot! To get access to our exclusive group, please provide your information.',
        description: 'Welcome Message'
      },
      {
        key: 'text_ask_name',
        value: 'Please enter your full name:',
        description: 'Ask for Name'
      },
      {
        key: 'text_ask_phone',
        value: 'Please share your phone number using the button below:',
        description: 'Ask for Phone'
      },
      {
        key: 'text_registration_complete',
        value: `Thank you for registering! You have been granted ${config.FREE_ACCESS_DAYS} days of free access to our group.`,
        description: 'Registration Complete'
      },
      {
        key: 'text_group_invite',
        value: `Here's your invite link to the group. Your access is valid for ${config.FREE_ACCESS_DAYS} days.`,
        description: 'Group Invite'
      },
      {
        key: 'text_access_expired',
        value: 'Your access to the group has expired. Please contact the administrator if you wish to renew your membership.',
        description: 'Access Expired'
      },
      {
        key: 'text_request_access',
        value: 'Your access request has been submitted. Please provide your full name again to update your information.',
        description: 'Request Access'
      }
    ];

    // Check if settings exist, if not, create them
    for (const setting of defaultSettings) {
      const existingSetting = await Setting.findOne({ key: setting.key });
      if (!existingSetting) {
        await Setting.create(setting);
        console.log(`Created default setting: ${setting.key}`);
      }
    }

    console.log('Settings initialization complete');
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
};

// Check and update user membership status
const checkMembershipStatus = async (bot) => {
  try {
    const now = new Date();
    
    // Find users with expired memberships
    const expiredUsers = await User.find({
      accessExpiryDate: { $lt: now },
      state: 'active',
      accessGranted: true
    });
    
    console.log(`Found ${expiredUsers.length} expired memberships to update`);
    
    // Update each expired user
    for (const user of expiredUsers) {
      user.state = 'expired';
      user.accessGranted = false;
      await user.save();
      
      // Notify the user about their expired membership
      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          'Your membership has expired. Please contact the administrator or use /start to request a new membership.'
        );
      } catch (notifyError) {
        console.error(`Error notifying user ${user.telegramId} about expiry:`, notifyError);
      }
    }
  } catch (error) {
    console.error('Error checking membership status:', error);
  }
};

// Format date for display
const formatDate = (date) => {
  if (!date) return 'N/A';
  return date.toLocaleDateString();
};

// Generate a new invite link for the group
const generateNewInviteLink = async (telegram, chatId) => {
  try {
    // Make sure chatId is valid
    if (!chatId) {
      console.error('Invalid chatId for invite link generation');
      return null;
    }
    
    // Use direct access from Telegraf bot instance
    const { Telegraf } = require('telegraf');
    const config = require('../config');
    
    // Create a temporary bot instance for this operation to avoid circular dependencies
    const tempBot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
    
    // Use the bot's telegram instance to create a new invite link
    const newLink = await tempBot.telegram.exportChatInviteLink(chatId);
    return newLink;
  } catch (error) {
    console.error('Error generating new invite link:', error);
    // Return null if there was an error
    return null;
  }
};

module.exports = {
  initializeSettings,
  checkMembershipStatus,
  formatDate,
  generateNewInviteLink
};
