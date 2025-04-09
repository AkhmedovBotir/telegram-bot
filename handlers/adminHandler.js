const { Markup } = require('telegraf');
const User = require('../models/user');
const Setting = require('../models/setting');
const config = require('../config');
const keyboards = require('../utils/keyboard');
const helpers = require('../utils/helpers');

// Admin command handlers
const adminHandler = {
  // Handle start command for admin
  handleStart: async (ctx) => {
    try {
      await ctx.reply(
        `Assalomu alaykum, Admin!\nBugun nimalarni boshqarmoqchisiz?`,
        keyboards.adminMainKeyboard()
      );
    } catch (error) {
      console.error('Error in admin start handler:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
  },

  // Handle callback queries from admin
  handleCallbackQuery: async (ctx, callbackData) => {
    try {
      switch (callbackData) {
        case 'waiting_list':
          return handleWaitingList(ctx);
        case 'users_list':
          return handleUsersList(ctx);
        case 'expiring_memberships':
          return handleExpiringMemberships(ctx);
        case 'edit_texts':
          return handleEditTexts(ctx);
        case 'statistics':
          return handleStatistics(ctx);
        case 'back_to_main':
          return adminHandler.handleStart(ctx);
        default:
          // Handle other specific callbacks
          if (callbackData.startsWith('approve_user_')) {
            const userId = callbackData.split('_')[2];
            return approveUser(ctx, userId);
          } else if (callbackData.startsWith('reject_user_')) {
            const userId = callbackData.split('_')[2];
            return rejectUser(ctx, userId);
          } else if (callbackData.startsWith('extend_user_')) {
            const userId = callbackData.split('_')[2];
            return extendUser(ctx, userId);
          } else if (callbackData.startsWith('edit_text_')) {
            const textKey = callbackData.split('_')[2];
            return startEditText(ctx, textKey);
          }
      }
    } catch (error) {
      console.error('Error in admin callback handler:', error);
      await ctx.reply('An error occurred while processing your request.');
    }
  },

  // Handle text messages from admin
  handleTextMessage: async (ctx) => {
    try {
      // Check if admin is in edit mode
      if (ctx.session.editingText) {
        return saveEditedText(ctx);
      }
      
      await ctx.reply('Iltimos, navigatsiya uchun tugmalardan foydalaning.', keyboards.adminMainKeyboard());
    } catch (error) {
      console.error('Error in admin text handler:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
  }
};

// Handle waiting list
async function handleWaitingList(ctx) {
  try {
    const waitingUsers = await User.find({ 
      state: 'waiting_name',
      accessGranted: false 
    }).sort({ registrationDate: 1 });

    if (waitingUsers.length === 0) {
      return ctx.reply(
        'Kutish ro\'yxatida hech kim yo\'q.',
        Markup.inlineKeyboard([
          Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')
        ])
      );
    }

    let message = 'Kutish Ro\'yxati:\n\n';
    
    for (const user of waitingUsers) {
      message += `Foydalanuvchi ID: ${user.telegramId}\n`;
      message += `Ism: ${user.fullName || 'Kiritilmagan'}\n`;
      message += `Foydalanuvchi nomi: ${user.username ? '@' + user.username : 'Mavjud emas'}\n`;
      message += `Ro\'yxatdan o\'tgan sana: ${user.registrationDate.toLocaleDateString()}\n\n`;
    }

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error handling waiting list:', error);
    await ctx.reply('Kutish ro\'yxatini olishda xatolik yuz berdi.');
  }
}

// Handle users list
async function handleUsersList(ctx) {
  try {
    const activeUsers = await User.find({ 
      state: 'active',
      accessGranted: true 
    }).sort({ accessExpiryDate: 1 }).limit(10);

    if (activeUsers.length === 0) {
      return ctx.reply(
        'No active users found.',
        Markup.inlineKeyboard([
          Markup.button.callback('Back to Main Menu', 'back_to_main')
        ])
      );
    }

    let message = 'Active Users:\n\n';
    
    for (const user of activeUsers) {
      message += `User ID: ${user.telegramId}\n`;
      message += `Name: ${user.fullName || 'Not provided'}\n`;
      message += `Phone: ${user.phoneNumber || 'Not provided'}\n`;
      message += `Access Expires: ${user.accessExpiryDate ? user.accessExpiryDate.toLocaleDateString() : 'N/A'}\n\n`;
    }

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback('Back to Main Menu', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error handling users list:', error);
    await ctx.reply('An error occurred while fetching the users list.');
  }
}

// Handle expiring memberships
async function handleExpiringMemberships(ctx) {
  try {
    const today = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const expiringUsers = await User.find({
      accessExpiryDate: { $gte: today, $lte: sevenDaysLater },
      state: 'active'
    }).sort({ accessExpiryDate: 1 });

    if (expiringUsers.length === 0) {
      return ctx.reply(
        'No memberships expiring in the next 7 days.',
        Markup.inlineKeyboard([
          Markup.button.callback('Back to Main Menu', 'back_to_main')
        ])
      );
    }

    let message = 'Memberships Expiring in the Next 7 Days:\n\n';
    let buttons = [];
    
    for (const user of expiringUsers) {
      message += `User ID: ${user.telegramId}\n`;
      message += `Name: ${user.fullName || 'Not provided'}\n`;
      message += `Access Expires: ${user.accessExpiryDate.toLocaleDateString()}\n\n`;
      
      buttons.push([
        Markup.button.callback(`Extend ${user.fullName || user.telegramId}`, `extend_user_${user.telegramId}`)
      ]);
    }
    
    buttons.push([Markup.button.callback('Back to Main Menu', 'back_to_main')]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Error handling expiring memberships:', error);
    await ctx.reply('An error occurred while fetching expiring memberships.');
  }
}

// Extend user membership
async function extendUser(ctx, userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return ctx.reply('User not found.');
    }

    // Extend user's access by the free access days
    const newExpiryDate = user.accessExpiryDate ? new Date(user.accessExpiryDate) : new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + config.FREE_ACCESS_DAYS);
    
    user.accessExpiryDate = newExpiryDate;
    user.accessGranted = true;
    user.state = 'active';
    await user.save();

    // Notify the user about their extended membership
    try {
      await ctx.telegram.sendMessage(
        userId,
        `Good news! Your membership has been extended for ${config.FREE_ACCESS_DAYS} more days. Your new expiry date is ${newExpiryDate.toLocaleDateString()}.`
      );
    } catch (notifyError) {
      console.error('Error notifying user about extension:', notifyError);
    }

    await ctx.reply(
      `Membership for ${user.fullName || userId} has been extended until ${newExpiryDate.toLocaleDateString()}.`,
      Markup.inlineKeyboard([
        Markup.button.callback('Back to Expiring Memberships', 'expiring_memberships'),
        Markup.button.callback('Back to Main Menu', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error extending user membership:', error);
    await ctx.reply('An error occurred while extending the membership.');
  }
}

// Handle text editing
async function handleEditTexts(ctx) {
  try {
    const settings = await Setting.find({ 
      key: { $regex: /^text_/ }
    }).sort({ key: 1 });

    if (settings.length === 0) {
      return ctx.reply(
        'No editable texts found.',
        Markup.inlineKeyboard([
          Markup.button.callback('Back to Main Menu', 'back_to_main')
        ])
      );
    }

    let message = 'Select a text to edit:\n\n';
    let buttons = [];
    
    for (const setting of settings) {
      const displayName = setting.description || setting.key.replace('text_', '');
      buttons.push([
        Markup.button.callback(displayName, `edit_text_${setting.key}`)
      ]);
    }
    
    buttons.push([Markup.button.callback('Back to Main Menu', 'back_to_main')]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Error handling text editing:', error);
    await ctx.reply('An error occurred while fetching editable texts.');
  }
}

// Start text editing
async function startEditText(ctx, textKey) {
  try {
    const setting = await Setting.findOne({ key: textKey });
    
    if (!setting) {
      return ctx.reply('Text setting not found.');
    }

    ctx.session.editingText = textKey;
    
    await ctx.reply(
      `Current text for "${setting.description || textKey}":\n\n${setting.value}\n\nPlease send the new text:`
    );
  } catch (error) {
    console.error('Error starting text edit:', error);
    await ctx.reply('An error occurred while preparing text editing.');
  }
}

// Save edited text
async function saveEditedText(ctx) {
  try {
    const textKey = ctx.session.editingText;
    const newText = ctx.message.text;
    
    await Setting.updateOne(
      { key: textKey },
      { $set: { value: newText, updatedAt: new Date() } }
    );
    
    // Clear editing state
    delete ctx.session.editingText;
    
    await ctx.reply(
      'Text updated successfully!',
      Markup.inlineKeyboard([
        Markup.button.callback('Edit Another Text', 'edit_texts'),
        Markup.button.callback('Back to Main Menu', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error saving edited text:', error);
    await ctx.reply('An error occurred while saving the text.');
    
    // Clear editing state
    delete ctx.session.editingText;
  }
}

// Handle statistics display
async function handleStatistics(ctx) {
  try {
    // Collect various statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ state: 'active', accessGranted: true });
    const waitingUsers = await User.countDocuments({ state: 'waiting_name' });
    const expiredUsers = await User.countDocuments({ state: 'expired' });
    
    // Get users registered today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const registeredToday = await User.countDocuments({ 
      registrationDate: { $gte: today }
    });
    
    // Memberships expiring soon
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);
    const expiringThisWeek = await User.countDocuments({
      accessExpiryDate: { $gte: today, $lte: sevenDaysLater },
      state: 'active'
    });

    const message = `📊 Bot Statistics 📊\n\n` +
      `Total Users: ${totalUsers}\n` +
      `Active Members: ${activeUsers}\n` +
      `Waiting for Approval: ${waitingUsers}\n` +
      `Expired Memberships: ${expiredUsers}\n` +
      `New Registrations Today: ${registeredToday}\n` +
      `Memberships Expiring This Week: ${expiringThisWeek}\n`;

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback('Back to Main Menu', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error handling statistics:', error);
    await ctx.reply('An error occurred while fetching statistics.');
  }
}

// Approve a user's membership
async function approveUser(ctx, userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return ctx.reply('Foydalanuvchi topilmadi.');
    }

    // Set access expiry date (10 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + config.FREE_ACCESS_DAYS);
    
    user.accessGranted = true;
    user.accessExpiryDate = expiryDate;
    user.state = 'active';
    
    // Generate a new invite link if configured to do so
    let inviteLink = config.GROUP_INVITE_LINK;
    if (config.GENERATE_NEW_INVITE_LINKS && config.GROUP_ID) {
      try {
        const newLink = await helpers.generateNewInviteLink(ctx.telegram, config.GROUP_ID);
        if (newLink) {
          inviteLink = newLink;
          user.inviteLink = newLink;
          console.log(`Created new invite link for user ${userId} during approval`);
        }
      } catch (linkError) {
        console.error('Error generating invite link during approval:', linkError);
      }
    }
    
    await user.save();

    // Try to add user to the group
    try {
      await ctx.telegram.sendMessage(
        userId,
        `Tabriklaymiz! Sizning ${config.FREE_ACCESS_DAYS} kunlik bepul kirish huquqingiz tasdiqlandi. Guruhga qo'shilish havolasi: ${inviteLink}`
      );
    } catch (notifyError) {
      console.error('Error notifying user about approval:', notifyError);
    }

    await ctx.reply(
      `Foydalanuvchi ${user.fullName || userId} ning kirishi ${expiryDate.toLocaleDateString()} gacha tasdiqlandi.`,
      Markup.inlineKeyboard([
        Markup.button.callback('Kutish ro\'yxatiga qaytish', 'waiting_list'),
        Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error approving user:', error);
    await ctx.reply('Foydalanuvchini tasdiqlashda xatolik yuz berdi.');
  }
}

// Reject a user's request
async function rejectUser(ctx, userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return ctx.reply('Foydalanuvchi topilmadi.');
    }

    user.accessGranted = false;
    user.state = 'expired';
    await user.save();

    // Notify the user about rejection
    try {
      await ctx.telegram.sendMessage(
        userId,
        `Kechirasiz, sizning a'zolik so'rovingiz rad etildi. Qo'shimcha ma'lumot uchun administrator bilan bog'laning.`
      );
    } catch (notifyError) {
      console.error('Error notifying user about rejection:', notifyError);
    }

    await ctx.reply(
      `Foydalanuvchi ${user.fullName || userId} rad etildi.`,
      Markup.inlineKeyboard([
        Markup.button.callback('Kutish ro\'yxatiga qaytish', 'waiting_list'),
        Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error rejecting user:', error);
    await ctx.reply('Foydalanuvchini rad etishda xatolik yuz berdi.');
  }
}

module.exports = adminHandler;
