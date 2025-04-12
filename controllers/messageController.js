const config = require('../config/config');
const User = require('../models/User');
const botUtils = require('../utils/botUtils');
const membershipUtils = require('../utils/membershipUtils');
const inviteController = require('./inviteController');
const userController = require('./userController');

/**
 * Foydalanuvchi uchun xabar yuborish
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {String} text Xabar matni
 * @param {Object} options Qo'shimcha opsiyalar
 * @returns {Promise} Yuborilgan xabar
 */
const sendUserMessage = async (bot, chatId, text, options = {}) => {
  try {
    return await botUtils.sendTelegramMessage(bot, chatId, text, options);
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

/**
 * Foydalanuvchi ro'yxatdan o'tganlik holatiga qarab xabar yuborish
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {Object} user Foydalanuvchi
 * @param {String} firstName Ism
 * @returns {Promise<Object>} Yuborilgan xabar
 */
const sendWelcomeByRole = async (bot, chatId, user, firstName) => {
  try {
    // Agar foydalanuvchi ro'yxatdan o'tmagan bo'lsa
    if (!user || !user.role) {
      // Ro'yxatdan o'tish xabarini yuboramiz
      const options = {
        reply_markup: {
          keyboard: [[{ text: "Foydalanuvchi" }, { text: "Haydovchi" }]],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      };
      
      return await sendUserMessage(
        bot,
        chatId,
        `Salom, ${firstName}! Akif Taxi botiga xush kelibsiz. Iltimos, o'zingizga mos rolni tanlang:`,
        options
      );
    }
    
    // Foydalanuvchi ro'yxatdan o'tgan bo'lsa, rolga qarab xabar yuboramiz
    return await sendRegistrationMessage(bot, chatId, user, firstName);
  } catch (error) {
    console.error("Error sending welcome message:", error);
    
    // Xatolik xabari
    return await sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

/**
 * Foydalanuvchi ro'yxatdan o'tish bosqichida xabar yuborish
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {Object} user Foydalanuvchi
 * @param {String} firstName Ism
 * @returns {Promise<Object>} Yangilanish natijasi
 */
const sendRegistrationMessage = async (bot, chatId, user, firstName) => {
  try {
    // Foydalanuvchi rolini tekshiramiz
    if (user.role === "user") {
      // Mini App uchun havolani URL parselab olamiz
      const appUrl = config.appDeepLink || "https://v0-akiftaxi.vercel.app/";
      
      // Inline button yaratamiz - Mini App uchun web_app parametrini ishlatamiz
      const inlineKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{
              text: "Mini Appni ochish",
              web_app: { url: appUrl } // Mini App uchun web_app parametrini ishlatamiz
            }]
          ],
          resize_keyboard: true,
        },
      };
      
      // Foydalanuvchi uchun botni boshqarish buttonlarini qo'shamiz
      const replyMarkup = {
        reply_markup: {
          keyboard: [
            [{ text: "Bot haqida" }, { text: "Aloqa" }],
          ],
          resize_keyboard: true,
        },
      };
      
      // Avval bot buttonlarini yuboramiz
      await sendUserMessage(
        bot,
        chatId,
        `Salom, ${firstName}! Siz foydalanuvchi sifatida ro'yxatdan o'tdingiz.`,
        replyMarkup
      );
      
      // Keyin Mini App buttonini alohida xabar sifatida yuboramiz
      return await sendUserMessage(
        bot,
        chatId,
        "Taksi chaqirish uchun quyidagi tugmani bosing:",
        inlineKeyboard
      );
    } else if (user.role === "driver") {
      // Haydovchi uchun ma'lumotlarni yig'ishni boshlaymiz
      if (!user.fullName) {
        // Foydalanuvchi holatini yangilaymiz
        await userController.updateUserState(user.telegramId, "waiting_fullname");
        
        // Bekor qilish tugmasini qo'shamiz
        const options = {
          reply_markup: {
            keyboard: [
              [{ text: "Bekor qilish" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        };
        
        // Ism-familiya so'raymiz
        return await sendUserMessage(
          bot,
          chatId,
          `Salom, ${firstName}! Siz haydovchi sifatida ro'yxatdan o'tmoqdasiz. Iltimos, to'liq ism familiyangizni kiriting:`,
          options
        );
      }
      
      // Sinov muddati holatini tekshiramiz
      const trialStatus = await membershipUtils.checkTrialPeriod(user.telegramId);
      
      // Haydovchi uchun klaviatura
      const driverOptions = botUtils.getDriverKeyboard(trialStatus);
      
      // Haydovchi uchun xabar yuboramiz
      return await sendUserMessage(
        bot,
        chatId,
        `Salom, ${user.fullName || firstName}! Siz haydovchi sifatida ro'yxatdan o'tgansiz.`,
        driverOptions
      );
    }
    
    // Noma'lum rol
    return await sendUserMessage(
      bot,
      chatId,
      `Xatolik yuz berdi. Noma'lum rol: ${user.role}`
    );
  } catch (error) {
    console.error("Error sending registration message:", error);
    
    // Xatolik xabari
    return await sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

/**
 * Guruhga qo'shilish havolasini yuborish
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {Number} userId User ID
 * @param {String} fullName To'liq ism
 * @returns {Promise<Object>} Havola natijasi
 */
const sendGroupInviteLink = async (bot, chatId, userId, fullName) => {
  try {
    // Foydalanuvchini topamiz va tekshiramiz
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || user.role !== "driver") {
      return await sendUserMessage(
        bot,
        chatId,
        "Bu funksiya faqat haydovchilar uchun mavjud."
      );
    }
    
    // Guruhda ekanligini tekshiramiz
    const isMember = await botUtils.isUserChatMember(bot, userId);
    
    if (isMember) {
      return await sendUserMessage(
        bot,
        chatId,
        "Siz allaqachon guruh a'zosisiz."
      );
    }
    
    // Sinov muddati havolasini yaratamiz
    // Guruhda bo'lishini tekshiramiz
    try {
      const chatInfo = await bot.getChat(config.telegramChatId);
      console.log("Successfully connected to group:", chatInfo.title);
    } catch (error) {
      console.error("Cannot get group info:", error.message);
      return await sendUserMessage(
        bot,
        chatId,
        "Guruh ma'lumotlarini olishda xatolik yuz berdi. Administrator bilan bog'laning."
      );
    }
    
    const inviteLink = await inviteController.createTrialInviteLink(bot, userId, fullName);
    
    if (!inviteLink) {
      return await sendUserMessage(
        bot,
        chatId,
        "Havola yaratishda xatolik yuz berdi. Bot guruhda admin bo'lishi kerak. Administrator bilan bog'laning."
      );
    }
    
    // Havolani yuboramiz
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Guruhga qo'shilish", url: inviteLink }],
        ],
      },
    };
    
    return await sendUserMessage(
      bot,
      chatId,
      "Guruhga qo'shilish uchun quyidagi havolani bosing:",
      keyboard
    );
  } catch (error) {
    console.error("Error sending group invite link:", error);
    
    // Xatolik xabari
    return await sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

/**
 * To'lov tugmasi bosilgandagi amal
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {Number} userId User ID
 * @returns {Promise<Object>} To'lov natijasi
 */
const handlePaymentButton = async (bot, chatId, userId) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || user.role !== "driver") {
      return await sendUserMessage(
        bot,
        chatId,
        "Bu funksiya faqat haydovchilar uchun mavjud."
      );
    }
    
    // Sinov muddati holatini tekshiramiz
    const trialStatus = await membershipUtils.checkTrialPeriod(userId);
    
    if (trialStatus.inTrial) {
      return await sendUserMessage(
        bot,
        chatId,
        `Sizda hali sinov muddati tugamagan. ${trialStatus.message}`
      );
    }
    
    // To'lov uchun xabar yuboramiz
    return await sendUserMessage(
      bot,
      chatId,
      "Guruhda qolish uchun 50,000 so'm to'lovni amalga oshiring.\n\n" +
      "To'lov usullari:\n" +
      "- 8600 1234 5678 9101 (MasterCard)\n" +
      "- 9860 1234 5678 9101 (Visa)\n\n" +
      "To'lovni amalga oshirgach, to'lov cheki yoki screenshot rasmini yuboring."
    );
  } catch (error) {
    console.error("Error handling payment button:", error);
    
    // Xatolik xabari
    return await sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

/**
 * Foydalanuvchi to'lov chekini yuborishi
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {Number} userId User ID
 * @param {String} photoId Rasm ID
 * @returns {Promise<Object>} To'lov natijasi
 */
const processPaymentPhotoMessage = async (bot, chatId, userId, photoId) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || user.role !== "driver") {
      return await sendUserMessage(
        bot,
        chatId,
        "Bu funksiya faqat haydovchilar uchun mavjud."
      );
    }
    
    // To'lov chekini qayta ishlaymiz
    const paymentResult = await userController.processUserPayment(userId, photoId);
    
    if (paymentResult.status === 'success') {
      // To'lov muvaffaqiyatli bo'lsa, yangi havola beramiz
      const inviteLink = await inviteController.createPaymentInviteLink(bot, userId, paymentResult.inviteId);
      
      if (inviteLink) {
        // To'lov muvaffaqiyatli va yangi havola yaratildi
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Guruhga qo'shilish", url: inviteLink }],
            ],
          },
        };
        
        return await sendUserMessage(
          bot,
          chatId,
          "To'lov muvaffaqiyatli qabul qilindi. Guruhga qo'shilish uchun quyidagi havolani bosing:",
          keyboard
        );
      } else {
        // Havola yaratilmadi
        return await sendUserMessage(
          bot,
          chatId,
          "To'lov muvaffaqiyatli qabul qilindi, lekin guruh havolasini yaratishda xatolik yuz berdi. Iltimos, administratorga murojaat qiling."
        );
      }
    } else if (paymentResult.status === 'already_paid') {
      // Allaqachon to'langan
      return await sendUserMessage(
        bot,
        chatId,
        "Siz allaqachon to'lovni amalga oshirgansiz."
      );
    } else {
      // To'lovni qayta ishlashda xatolik
      return await sendUserMessage(
        bot,
        chatId,
        paymentResult.message || "To'lovni qayta ishlashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
      );
    }
  } catch (error) {
    console.error("Error processing payment photo:", error);
    
    // Xatolik xabari
    return await sendUserMessage(
      bot,
      chatId,
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
};

module.exports = {
  sendUserMessage,
  sendWelcomeByRole,
  sendRegistrationMessage,
  sendGroupInviteLink,
  handlePaymentButton,
  processPaymentPhotoMessage,
};