const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');

// Import utilities and controllers
const botUtils = require('../utils/botUtils');
const membershipUtils = require('../utils/membershipUtils');
const userController = require('./userController');
const inviteController = require('./inviteController');
const messageController = require('./messageController');
const groupMembershipController = require('./groupMembershipController');

// Create Telegram bot
const bot = new TelegramBot(config.telegramBotToken, { polling: true });

// Initialize bot commands
const initBot = () => {
  // Save bot ID for future use
  bot.getMe().then((botInfo) => {
    bot.botId = botInfo.id;
    console.log(`Bot initialized as: ${botInfo.username} (${botInfo.id})`);
  });

  // Set commands that will be shown in the bot menu
  bot.setMyCommands([
    { command: "/start", description: "Start the bot" },
    { command: "/help", description: "Get help" },
  ]);

  // Handle /start command
  bot.onText(/\/start/, handleStart);

  // Handle start with deep link for checking group invites
  bot.onText(/\/start check_invite=(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const inviteCode = match[1];
    
    try {
      // Havolani tekshiramiz
      const checkResult = await inviteController.checkInviteLinkValidity(inviteCode, userId);
      
      if (checkResult.valid) {
        // Havolani ishlatilgan deb belgilaymiz
        await inviteController.markInviteLinkAsUsed(checkResult.inviteId);
        
        // Muvaffaqiyatli qo'shilish xabari
        await messageController.sendUserMessage(
          bot,
          chatId,
          "Guruhga qo'shilish havolasi faollashtirildi!"
        );
      } else {
        // Havola yaroqsiz xabari
        await messageController.sendUserMessage(
          bot,
          chatId,
          checkResult.message
        );
      }
    } catch (error) {
      console.error("Error in check_invite handler:", error);
      
      // Xatolik xabari
      await messageController.sendUserMessage(
        bot,
        chatId,
        "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
      );
    }
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    messageController.sendUserMessage(
      bot,
      msg.chat.id,
      "Botdan foydalanish uchun /start buyrug'ini ishlating."
    );
  });

  // Handle member join/leave events
  bot.on('chat_member', async (update) => {
    try {
      console.log("Received chat_member event:", JSON.stringify(update));
      
      // Qo'shimcha tekshirish - qo'shilgan a'zo holatini aniqlaymiz
      if (update.new_chat_member && update.new_chat_member.status === 'member' && 
          update.old_chat_member && update.old_chat_member.status !== 'member') {
        console.log(`User ${update.new_chat_member.user.id} joined group ${update.chat.id}`);
        
        // Guruh ID config.telegramChatId ga to'g'ri kelishini tekshiramiz
        if (update.chat.id.toString() === config.telegramChatId) {
          console.log("This is our target group!");
          
          // Foydalanuvchi havolasini tekshiramiz
          const userId = update.new_chat_member.user.id;
          const invite = await DriverInvite.findOne(
            { telegramId: userId },
            {},
            { sort: { createdAt: -1 } }
          );
          
          if (invite) {
            console.log(`Found invite for user ${userId}, updating to joined`);
            invite.isInGroup = true;
            invite.joinedGroupAt = new Date();
            await invite.save();
            console.log(`Invite updated. Now isInGroup=${invite.isInGroup}, joinedGroupAt=${invite.joinedGroupAt}`);
          } else {
            console.log(`No invite found for user ${userId}`);
          }
        }
      }
      
      // Standart ishlov beruvchi
      await groupMembershipController.handleMemberJoin(bot, update);
    } catch (error) {
      console.error("Error handling chat_member event:", error);
    }
  });

  // Handle callback query (button clicks)
  bot.on('callback_query', async (callbackQuery) => {
    try {
      await handleCallbackQuery(callbackQuery);
    } catch (error) {
      console.error("Error handling callback query:", error);
    }
  });

  // Handle all messages
  bot.on('message', async (msg) => {
    try {
      await handleMessage(msg);
    } catch (error) {
      console.error("Error in message handler:", error);
    }
  });

  // Sinov muddati ogohlantirishlari uchun handler
  const sendTrialWarnings = async () => {
    try {
      console.log("Checking for trial warnings...");
      // Barcha sinov muddatidagi haydovchilarni topamiz
      const drivers = await DriverInvite.find({
        isInGroup: true,
        hasPaid: false,
      });
      
      console.log(`Found ${drivers.length} active trial drivers`);
      
      // Har bir haydovchining sinov muddatini tekshiramiz
      for (const driver of drivers) {
        const userId = driver.telegramId;
        console.log(`Checking trial for user ${userId}, joined at ${driver.joinedGroupAt}`);
        const trialStatus = await membershipUtils.checkTrialPeriod(userId);
        console.log(`Trial status for user ${userId}:`, trialStatus);
        
        // Agar muddat tugashiga oz qolgan bo'lsa ogohlantirish yuboramiz
        if (trialStatus.status === 'trial_ending_soon') {
          // Har safar xabar yuboramiz (har sekund qancha vaqt qolgani haqida)
          console.log(`Sending trial warning to user ${userId}, warning level: ${trialStatus.warningLevel}, seconds left: ${trialStatus.daysLeft}`);
          
          try {
            // Xabar yuboramiz
            await messageController.sendUserMessage(
              bot,
              userId,
              `DIQQAT! Guruhda sinov muddatingiz tugashiga ${trialStatus.daysLeft} sekund qoldi! To'lovni amalga oshiring. (Test rejimida)`
            );
            
            // So'nggi ogohlantirish darajasini saqlaymiz
            driver.lastWarningLevel = trialStatus.warningLevel;
            await driver.save();
            
            console.log(`Successfully sent warning to user ${userId}`);
          } catch (err) {
            console.error(`Error sending warning to user ${userId}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("Error sending trial warnings:", error);
    }
  };
  
  // Test uchun har 1 sekundda ogohlantirish yuborish
  setInterval(sendTrialWarnings, 1000);
  
  // Set up periodic checks for expired trials 
  // Test uchun har 5 sekundda tekshirish (keyin 12 soatga o'zgartiriladi)
  setInterval(async () => {
    try {
      console.log("Checking for expired trials...");
      const result = await groupMembershipController.removeExpiredTrialMembers(bot);
      console.log("Expired trial check result:", result);
    } catch (error) {
      console.error("Error in periodic trial expiration check:", error);
    }
  }, 5000); // 5 sekundda bir tekshirishga o'zgartirdik

  console.log("Telegram bot initialized and listening...");
};

// Handle the /start command
const handleStart = async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || "";
    const username = msg.from.username || "";

    // Register or update user in database
    const userResult = await userController.registerOrUpdateUser({
      telegramId: userId,
      username,
      firstName,
      lastName
    });
    
    if (userResult.status === 'error') {
      // Database error, but we'll continue with limited functionality
      console.error("User registration failed:", userResult.message);
    }
    
    // Send welcome message based on role
    await messageController.sendWelcomeByRole(
      bot, 
      chatId, 
      userResult.user, 
      firstName
    );
  } catch (error) {
    console.error("Error in start handler:", error);
    
    // Send generic error message
    await messageController.sendUserMessage(
      bot,
      msg.chat.id,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

// Handle button clicks
const handleCallbackQuery = async (callbackQuery) => {
  try {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const userId = callbackQuery.from.id;
    
    // Guruh havolalari uchun handler
    if (action && action.startsWith('check_invite_')) {
      const inviteCode = action.replace('check_invite_', '');
      
      // Havolani tekshiramiz
      const checkResult = await inviteController.checkInviteLinkValidity(inviteCode, userId);
      
      if (checkResult.valid) {
        // Havolani ishlatilgan deb belgilaymiz
        await inviteController.markInviteLinkAsUsed(checkResult.inviteId);
        
        // Muvaffaqiyatli qo'shilish xabari
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "Guruhga qo'shilish havolasi faollashtirildi!",
          show_alert: true
        });
      } else {
        // Havola yaroqsiz xabari
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: checkResult.message,
          show_alert: true
        });
      }
      return;
    }
    
    // Rol tanlash uchun handler
    if (action === "role_user" || action === "role_driver" || 
        action.startsWith("role_user") || action.startsWith("role_driver")) {
      
      const role = action.startsWith("role_user") ? "user" : "driver";
      
      // User rolini yangilaymiz
      const updateResult = await userController.updateUserRole(userId, role);
      
      if (updateResult.status === 'success') {
        // Ro'yxatdan o'tish xabarlarini yuboramiz
        await messageController.sendRegistrationMessage(
          bot,
          msg.chat.id,
          updateResult.user,
          updateResult.user.firstName || "Foydalanuvchi"
        );
      } else {
        // Xatolik xabari
        await messageController.sendUserMessage(
          bot,
          msg.chat.id,
          "Rolni o'zgartirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
        );
      }
    } else {
      console.warn("Unknown callback data:", action);
    }
    
    // Callback so'roviga javob beramiz (UI hang bo'lmasligi uchun)
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error("Error in callback query handler:", error);
    
    try {
      // Callback so'roviga javob beramiz
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        show_alert: true
      });
      
      // Xabar yuboramiz
      if (callbackQuery.message && callbackQuery.message.chat) {
        await messageController.sendUserMessage(
          bot,
          callbackQuery.message.chat.id,
          "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
        );
      }
    } catch (msgError) {
      console.error("Failed to send error message:", msgError);
    }
  }
};

// Handle incoming messages
const handleMessage = async (msg) => {
  // Ignore commands, they're handled separately
  if (msg.text && msg.text.startsWith("/")) {
    return;
  }
  
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  
  try {
    // Kontakt orqali telefon raqam kelishini tekshiramiz
    if (msg.contact && msg.contact.phone_number) {
      console.log("Contact received separately:", msg.contact.phone_number);
      
      // Foydalanuvchini topamiz
      const user = await User.findOne({ telegramId: userId });
      
      // Agar foydalanuvchi telefon raqam kiritish holatida bo'lsa
      if (user && user.state === "waiting_phone") {
        const phoneNumber = msg.contact.phone_number;
        
        // Foydalanuvchi ma'lumotlarini yangilaymiz
        await userController.updateUserState(userId, "normal", { phoneNumber });
        
        // Sinov muddati holatini tekshiramiz
        const trialStatus = await membershipUtils.checkTrialPeriod(userId);
        
        // Haydovchi uchun klaviatura
        const driverOptions = botUtils.getDriverKeyboard(trialStatus);
        
        // Ro'yxatdan o'tganlik haqida xabar beramiz
        await messageController.sendUserMessage(
          bot,
          chatId,
          `Tabriklaymiz, ${user.fullName}! Siz haydovchi sifatida muvaffaqiyatli ro'yxatdan o'tdingiz.\n\nTelefon raqamingiz: ${phoneNumber}`,
          driverOptions
        );
        
        // Guruhga qo'shilish havolasini yuboramiz
        await messageController.sendGroupInviteLink(
          bot, 
          chatId, 
          userId, 
          user.fullName
        );
        
        return;
      }
    }
    
    // To'lov cheki rasmini tekshiramiz
    if (msg.photo && msg.photo.length > 0) {
      // En yuqori sifatli rasmni olamiz
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      
      // To'lov chekini qayta ishlaymiz
      await messageController.processPaymentPhotoMessage(bot, chatId, userId, photoId);
      return;
    }
    
    // Standart tugmalarni tekshiramiz
    if (msg.text) {
      // Bot haqida va Aloqa tugmalari
      if (msg.text === "Bot haqida") {
        await messageController.sendUserMessage(
          bot,
          chatId,
          "Bu bot Akif Taxi ilovasi uchun yaratilgan. Bot orqali siz Mini Appdan foydalanishingiz va taksi chaqirishingiz mumkin."
        );
        return;
      } else if (msg.text === "Aloqa") {
        await messageController.sendUserMessage(
          bot,
          chatId,
          "Savollaringiz bo'lsa, quyidagi manzilga murojaat qiling: support@akiftaxi.uz"
        );
        return;
      } else if (msg.text === "To'lov qilish") {
        // To'lov tugmasi bosilganda
        await messageController.handlePaymentButton(bot, chatId, userId);
        return;
      } else if (msg.text === "Guruhga qo'shilish") {
        // Foydalanuvchini topamiz
        const user = await User.findOne({ telegramId: userId });
        
        if (user && user.role === 'driver') {
          // Guruhga qo'shilish havolasini yuboramiz
          await messageController.sendGroupInviteLink(bot, chatId, userId, user.fullName || firstName);
        } else {
          await messageController.sendUserMessage(
            bot,
            chatId,
            "Bu funksiya faqat haydovchilar uchun mavjud."
          );
        }
        return;
      } else if (msg.text === "Sinov muddati holati") {
        // Sinov muddati holatini tekshiramiz
        const trialStatus = await membershipUtils.checkTrialPeriod(userId);
        
        await messageController.sendUserMessage(
          bot,
          chatId,
          trialStatus.message
        );
        return;
      } else if (msg.text === "Bekor qilish") {
        // Foydalanuvchi holatini va tugmalarini qayta tiklaymiz
        const updateResult = await userController.updateUserState(userId, "normal");
        
        // Tugmalarni qayta ko'rsatamiz
        const options = {
          reply_markup: {
            keyboard: [[{ text: "Foydalanuvchi" }, { text: "Haydovchi" }]],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        };
        
        await messageController.sendUserMessage(
          bot,
          chatId,
          "Ro'yxatdan o'tish bekor qilindi. Iltimos, rolni qayta tanlang:",
          options
        );
        return;
      }
      
      // Foydalanuvchi holatiga qarab xabarni qayta ishlaymiz
      const user = await User.findOne({ telegramId: userId });
      
      if (user) {
        // Ism-familiya kutilayotgan holat
        if (user.state === "waiting_fullname") {
          // Ism-familiyani saqlaymiz
          await userController.updateUserState(userId, "waiting_phone", { fullName: msg.text });
          
          // Telefon raqam yuborish uchun tugma qo'shamiz
          const phoneOptions = {
            reply_markup: {
              keyboard: [
                [{ text: "Telefon raqamni yuborish", request_contact: true }],
                [{ text: "Bekor qilish" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          };
          
          // Telefon raqam so'raymiz
          await messageController.sendUserMessage(
            bot,
            chatId,
            'Rahmat! Endi telefon raqamingizni kiriting. Raqamni +998XXXXXXXXX formatida kiriting yoki "Telefon raqamni yuborish" tugmasini bosing:',
            phoneOptions
          );
          return;
        }
        // Telefon raqam kutilayotgan holat
        else if (user.state === "waiting_phone") {
          let phoneNumber;
          
          // Kontakt orqali telefon raqam kelgan bo'lsa
          if (msg.contact && msg.contact.phone_number) {
            console.log("Contact phone received in text handler:", msg.contact.phone_number);
            phoneNumber = msg.contact.phone_number;
          }
          // Matn orqali telefon raqam kelgan bo'lsa
          else {
            // Telefon raqam formatini tekshiramiz
            const phoneRegex = /^\+?[0-9]{10,13}$/;
            console.log("Received phone number:", msg.text);
            if (!phoneRegex.test(msg.text.replace(/\s+/g, ''))) {
              console.log("Phone number validation failed, does not match regex");
              await messageController.sendUserMessage(
                bot,
                chatId,
                "Telefon raqamingiz noto'g'ri formatda. Iltimos, raqamni +998XXXXXXXXX formatida kiriting yoki \"Telefon raqamni yuborish\" tugmasini bosing:"
              );
              return;
            }
            
            phoneNumber = msg.text.replace(/\s+/g, '');
          }
          
          // Foydalanuvchi ma'lumotlarini yangilaymiz
          await userController.updateUserState(userId, "normal", { phoneNumber });
          
          // Sinov muddati holatini tekshiramiz
          const trialStatus = await membershipUtils.checkTrialPeriod(userId);
          
          // Haydovchi uchun klaviatura
          const driverOptions = botUtils.getDriverKeyboard(trialStatus);
          
          // Ro'yxatdan o'tganlik haqida xabar beramiz
          await messageController.sendUserMessage(
            bot,
            chatId,
            `Tabriklaymiz, ${user.fullName}! Siz haydovchi sifatida muvaffaqiyatli ro'yxatdan o'tdingiz.\n\nTelefon raqamingiz: ${phoneNumber}`,
            driverOptions
          );
          
          // Guruhga qo'shilish havolasini yuboramiz
          await messageController.sendGroupInviteLink(
            bot, 
            chatId, 
            userId, 
            user.fullName
          );
          
          return;
        }
      }
      
      // Ro'yxatdan o'tish tugmalarini tekshiramiz
      if (msg.text === "Foydalanuvchi" || msg.text === "Haydovchi") {
        const role = msg.text === "Foydalanuvchi" ? "user" : "driver";
        
        // User rolini yangilaymiz
        const updateResult = await userController.updateUserRole(userId, role);
        
        if (updateResult.status === 'success') {
          // Xabarni yuboramiz
          await messageController.sendRegistrationMessage(
            bot,
            chatId,
            updateResult.user,
            firstName
          );
        } else {
          // Xatolik xabari
          await messageController.sendUserMessage(
            bot,
            chatId,
            "Rolni o'zgartirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
          );
        }
        return;
      }
    }
  } catch (error) {
    console.error("Error in message handler:", error);
    
    // Xatolik xabari
    await messageController.sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

module.exports = {
  bot,
  initBot,
};