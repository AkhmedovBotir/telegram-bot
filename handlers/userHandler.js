import { Markup } from 'telegraf';
import User from '../models/user.js';
import Setting from '../models/setting.js';
import config from '../config.js';
import { phoneKeyboard, expiredUserKeyboard, activeUserKeyboard, backButtonsKeyboard } from '../utils/keyboard.js';
import { initializeSettings, checkMembershipStatus, formatDate, generateNewInviteLink } from '../utils/helpers.js';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Handle photo messages
  handlePhoto: async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      const user = await User.findOne({ telegramId });

      if (!user || user.state !== 'waiting_payment') {
        return ctx.reply('Iltimos, avval /start buyrug\'ini yuboring.');
      }

      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const date = new Date();
      const fileName = `image_${date.toISOString().split('T')[0]}_${user.telegramId}.jpg`;
      
      // Download and save photo
      const file = await ctx.telegram.getFile(photo.file_id);
      const filePath = path.join(__dirname, '..', 'uploads', fileName);
      
      // Create uploads directory if it doesn't exist
      if (!fs.existsSync(path.join(__dirname, '..', 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, '..', 'uploads'));
      }

      // Download and save the file
      const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = await response.buffer();
      fs.writeFileSync(filePath, buffer);
      
      // Save image info to user
      user.paymentImage = fileName;
      user.paymentDate = date;
      user.state = 'waiting_approval';
      await user.save();

      await ctx.reply('To\'lov cheki qabul qilindi. Administrator tekshirishi kutilmoqda.');

      // Notify admin about new payment
      if (config.ADMIN_USER_ID) {
        await ctx.telegram.sendMessage(
          config.ADMIN_USER_ID,
          `Yangi to'lov cheki:\nFoydalanuvchi: ${user.fullName}\nTelefon: ${user.phoneNumber}\nID: ${user.telegramId}`
        );
      }
    } catch (error) {
      console.error('Error handling photo:', error);
      await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
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
    // Faqat active holatdagi va ruxsati bor foydalanuvchilarga link beriladi
    if (user.state !== 'active' || !user.accessGranted) {
      return ctx.reply('Guruhga qo\'shilish uchun admin tasdiqini kutishingiz kerak.');
    }

    // Check if user is a member of the group
    let isMember = false;
    if (config.GROUP_ID) {
      try {
        const chatMember = await ctx.telegram.getChatMember(config.GROUP_ID, user.telegramId);
        isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
        user.isInGroup = isMember;
        await user.save();
      } catch (error) {
        console.error('Error checking group membership:', error);
        user.isInGroup = false;
        await user.save();
      }
    }

    if (isMember) {
      // If user is already in group, just show subscription status
      const daysLeft = Math.ceil((new Date(user.accessExpiryDate) - new Date()) / (1000 * 60 * 60 * 24));
      await ctx.reply(
        `Siz guruh a'zosisiz! Obunangiz ${user.accessExpiryDate.toLocaleDateString()} gacha amal qiladi.\nQolgan kunlar: ${daysLeft}`,
        Markup.inlineKeyboard([
          Markup.button.callback('Muddat holatini tekshirish', 'check_expiry')
        ])
      );
      return;
    }

    const inviteSetting = await Setting.findOne({ key: 'text_group_invite' });
    const inviteText = inviteSetting ? inviteSetting.value : 
      `Guruhga taklif havolasi. Bu havola ${config.FREE_ACCESS_DAYS} kun davomida ${user.accessExpiryDate.toLocaleDateString()} gacha amal qiladi.`;
    
    let inviteLink = config.GROUP_INVITE_LINK;
    
    // Har doim yangi link generatsiya qilish
    if (config.GENERATE_NEW_INVITE_LINKS && config.GROUP_ID) {
      try {
        // Use the new helper function with the telegram instance
        const newLink = await generateNewInviteLink(ctx.telegram, config.GROUP_ID);
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
      'Guruhga kirishingiz muddati tugadi. Yangilash uchun to\'lov chekini yuborishingiz kerak.';
    
    await ctx.reply("To'lov chekini rasm ko'rinishida yuboring.");

    // Set user state to waiting for payment
    user.state = 'waiting_payment';
    await user.save();
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

export default userHandler;