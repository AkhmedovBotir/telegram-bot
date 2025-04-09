const { Markup } = require('telegraf');
const User = require('../models/user');
const Setting = require('../models/setting');
const config = require('../config');
const keyboards = require('../utils/keyboard');
const helpers = require('../utils/helpers');

// User command handlers
const userHandler = {
  // Handle start command for regular users
  handleStart: async (ctx) => {
    try {
      // Check if the user is already in our database
      const telegramId = ctx.from.id;
      let user = await User.findOne({ telegramId });
      
      if (!user) {
        // Create a new user record
        user = new User({
          telegramId,
          username: ctx.from.username,
          state: 'waiting_name'
        });
        await user.save();
      }
      
      // Get welcome text from settings
      const welcomeSetting = await Setting.findOne({ key: 'text_welcome' });
      const welcomeText = welcomeSetting ? welcomeSetting.value : 
        'Xush kelibsiz! Guruhimizga kirish uchun, iltimos to\'liq ismingizni kiriting.';
      
      await ctx.reply(welcomeText);
      
      // If the user hasn't provided their full name yet, ask for it
      if (user.state === 'waiting_name' || !user.fullName) {
        user.state = 'waiting_name';
        await user.save();
        await askForName(ctx);
      } 
      // If name is provided but not phone, ask for phone
      else if (user.state === 'waiting_phone' || !user.phoneNumber) {
        user.state = 'waiting_phone';
        await user.save();
        await askForPhone(ctx);
      }
      // If the user is active and has access, send them the group link
      else if (user.state === 'active' && user.accessGranted) {
        await sendGroupInvite(ctx, user);
      }
      // If the user's access has expired
      else if (user.state === 'expired' || 
              (user.accessExpiryDate && user.accessExpiryDate < new Date())) {
        await handleExpiredAccess(ctx, user);
      }
    } catch (error) {
      console.error('Error in user start handler:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, /start komandasini yuborib qayta urinib ko\'ring.');
    }
  },

  // Handle callback queries from users
  handleCallbackQuery: async (ctx, callbackData) => {
    try {
      switch (callbackData) {
        case 'request_access':
          return requestAccess(ctx);
        case 'check_expiry':
          return checkExpiryStatus(ctx);
        default:
          await ctx.reply('Iltimos, mavjud variantlardan foydalaning.');
      }
    } catch (error) {
      console.error('Error in user callback handler:', error);
      await ctx.reply('So\'rovingizni qayta ishlashda xatolik yuz berdi.');
    }
  },

  // Handle text messages from users
  handleTextMessage: async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const user = await User.findOne({ telegramId });
      
      if (!user) {
        // If user is not in the database, restart the process
        return userHandler.handleStart(ctx);
      }
      
      // Handle text input based on the user's current state
      if (user.state === 'waiting_name') {
        return processName(ctx, user);
      } else if (user.state === 'waiting_phone') {
        return processPhoneText(ctx, user);
      } else {
        // For any other state, give them information
        if (user.accessGranted && user.state === 'active') {
          await sendGroupInvite(ctx, user);
        } else if (user.state === 'expired') {
          await handleExpiredAccess(ctx, user);
        } else {
          await ctx.reply('Iltimos, guruhga kirish uchun administrator tasdiqlashini kuting.');
        }
      }
    } catch (error) {
      console.error('Error in user text handler:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring yoki /start orqali qayta boshlang.');
    }
  },

  // Handle contact sharing
  handleContact: async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const user = await User.findOne({ telegramId });
      
      if (!user || user.state !== 'waiting_phone') {
        return userHandler.handleStart(ctx);
      }
      
      const contact = ctx.message.contact;
      
      // Verify that the shared contact belongs to the user
      if (contact.user_id !== telegramId) {
        return ctx.reply('Iltimos, boshqa foydalanuvchining emas, o\'zingizning kontakt ma\'lumotingizni yuboring.');
      }
      
      user.phoneNumber = contact.phone_number;
      user.state = 'active';
      await user.save();
      
      return processRegistrationComplete(ctx, user);
      
    } catch (error) {
      console.error('Error in contact handler:', error);
      await ctx.reply('Kontakt ma\'lumotlaringizni qayta ishlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
  }
};

// Ask the user for their full name
async function askForName(ctx) {
  const nameSetting = await Setting.findOne({ key: 'text_ask_name' });
  const nameText = nameSetting ? nameSetting.value : 
    'Iltimos, to\'liq ismingizni kiriting:';
  
  await ctx.reply(nameText);
}

// Process the provided name
async function processName(ctx, user) {
  const fullName = ctx.message.text.trim();
  
  if (fullName.length < 3) {
    return ctx.reply('Iltimos, kamida 3 ta belgidan iborat to\'g\'ri to\'liq ismingizni kiriting.');
  }
  
  user.fullName = fullName;
  user.state = 'waiting_phone';
  await user.save();
  
  await askForPhone(ctx);
}

// Ask the user for their phone number
async function askForPhone(ctx) {
  const phoneSetting = await Setting.findOne({ key: 'text_ask_phone' });
  const phoneText = phoneSetting ? phoneSetting.value : 
    'Iltimos, quyidagi tugma orqali telefon raqamingizni yuboring:';
  
  await ctx.reply(
    phoneText,
    Markup.keyboard([
      [Markup.button.contactRequest('Telefon raqamni yuborish')]
    ]).resize()
  );
}

// Process phone number provided as text
async function processPhoneText(ctx, user) {
  const phoneNumber = ctx.message.text.trim();
  
  // Simple phone validation - can be improved with regex
  if (phoneNumber.length < 7) {
    return ctx.reply('Iltimos, to\'g\'ri telefon raqamni kiriting yoki "Telefon raqamni yuborish" tugmasidan foydalaning.');
  }
  
  user.phoneNumber = phoneNumber;
  user.state = 'active';
  await user.save();
  
  await processRegistrationComplete(ctx, user);
}

// Handle the completion of registration
async function processRegistrationComplete(ctx, user) {
  // Set the access expiry date (10 days from now)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + config.FREE_ACCESS_DAYS);
  
  user.accessExpiryDate = expiryDate;
  user.accessGranted = true;
  await user.save();
  
  const completeSetting = await Setting.findOne({ key: 'text_registration_complete' });
  const completeText = completeSetting ? completeSetting.value : 
    `Ro'yxatdan o'tganingiz uchun rahmat! Sizga ${config.FREE_ACCESS_DAYS} kunlik bepul guruh a'zoligi berildi.`;
  
  await ctx.reply(
    completeText,
    Markup.removeKeyboard()
  );
  
  await sendGroupInvite(ctx, user);
}

// Send the group invite link to the user
async function sendGroupInvite(ctx, user) {
  try {
    const inviteSetting = await Setting.findOne({ key: 'text_group_invite' });
    const inviteText = inviteSetting ? inviteSetting.value : 
      `Guruhga taklif havolasi. Bu havola ${config.FREE_ACCESS_DAYS} kun davomida ${user.accessExpiryDate.toLocaleDateString()} gacha amal qiladi.`;
    
    let inviteLink = config.GROUP_INVITE_LINK;
    
    // Use existing invite link if the user already has one
    if (user.inviteLink) {
      inviteLink = user.inviteLink;
      console.log(`Using existing invite link for user ${user.telegramId}`);
    }
    // Generate a new invite link if configured to do so and user doesn't have one yet
    else if (config.GENERATE_NEW_INVITE_LINKS && config.GROUP_ID) {
      try {
        // Use the new helper function with the telegram instance
        const newLink = await helpers.generateNewInviteLink(ctx.telegram, config.GROUP_ID);
        if (newLink) {
          inviteLink = newLink;
          
          // Save the new link in the user's record for future reference
          user.inviteLink = newLink;
          await user.save();
          
          console.log(`Generated new invite link for user ${user.telegramId}`);
        } else {
          console.warn(`Failed to generate new invite link for user ${user.telegramId}, using default link`);
        }
      } catch (linkError) {
        console.error('Error generating new invite link:', linkError);
        // Continue with the default link if there was an error
      }
    }
    
    await ctx.reply(
      `${inviteText}\n\n${inviteLink}`,
      Markup.inlineKeyboard([
        Markup.button.callback('Muddat holatini tekshirish', 'check_expiry')
      ])
    );
  } catch (error) {
    console.error('Error sending group invite:', error);
    await ctx.reply('Guruh havola yaratishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
  }
}

// Handle expired access
async function handleExpiredAccess(ctx, user) {
  try {
    const expiredSetting = await Setting.findOne({ key: 'text_access_expired' });
    const expiredText = expiredSetting ? expiredSetting.value : 
      'Guruhga kirishingiz muddati tugadi. Agar a\'zoligingizni yangilamoqchi bo\'lsangiz, administrator bilan bog\'laning.';
    
    await ctx.reply(
      expiredText,
      Markup.inlineKeyboard([
        Markup.button.callback('Ruxsat so\'rash', 'request_access')
      ])
    );
  } catch (error) {
    console.error('Error handling expired access:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
  }
}

// Request new access after expiry
async function requestAccess(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      return userHandler.handleStart(ctx);
    }
    
    user.state = 'waiting_name';
    await user.save();
    
    const requestSetting = await Setting.findOne({ key: 'text_request_access' });
    const requestText = requestSetting ? requestSetting.value : 
      'Ruxsat so\'rovingiz qabul qilindi. Ma\'lumotlarni yangilash uchun iltimos to\'liq ismingizni qayta kiriting.';
    
    await ctx.reply(requestText);
    await askForName(ctx);
  } catch (error) {
    console.error('Error requesting access:', error);
    await ctx.reply('So\'rovni yuborishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
  }
}

// Check expiry status
async function checkExpiryStatus(ctx) {
  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    
    if (!user || !user.accessExpiryDate) {
      return ctx.reply('Sizda faol obuna mavjud emas.');
    }
    
    const now = new Date();
    const expiryDate = new Date(user.accessExpiryDate);
    
    if (expiryDate <= now) {
      user.state = 'expired';
      user.accessGranted = false;
      await user.save();
      
      return handleExpiredAccess(ctx, user);
    }
    
    // Calculate days remaining
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    // Use the user's personal invite link if available, otherwise use the default
    const inviteLink = user.inviteLink || config.GROUP_INVITE_LINK;
    
    await ctx.reply(
      `Guruhga kirish huquqingiz ${expiryDate.toLocaleDateString()} gacha amal qiladi.\nQolgan kunlar: ${daysRemaining}`,
      Markup.inlineKeyboard([
        Markup.button.url('Guruhga o\'tish', inviteLink)
      ])
    );
  } catch (error) {
    console.error('Error checking expiry status:', error);
    await ctx.reply('Holatni tekshirishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
  }
}

module.exports = userHandler;
