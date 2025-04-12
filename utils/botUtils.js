const config = require('../config/config');
const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');

/**
 * Foydalanuvchi ma'lumotlarini saqlash
 * @param {Object} user Foydalanuvchi obyekti
 * @param {Object} data O'zgartiriladigan ma'lumotlar
 * @returns {Promise} Promise obyekti
 */
const saveUserData = async (user, data) => {
  try {
    // Ma'lumotlarni o'zgartiramiz
    Object.keys(data).forEach((key) => {
      user[key] = data[key];
    });
    
    // So'nggi yangilanish vaqtini o'rnatamiz
    user.updatedAt = new Date();
    
    // Ma'lumotlarni saqlaymiz
    await user.save();
    return { status: 'success', user };
  } catch (error) {
    console.error("Error saving user data:", error);
    return { status: 'error', message: "Ma'lumotlarni saqlashda xatolik", error };
  }
};

/**
 * Telegram orqali xabar yuborish
 * @param {Object} bot Bot obyekti
 * @param {Number} chatId Chat ID
 * @param {String} text Xabar matni
 * @param {Object} options Qo'shimcha opsiyalar
 * @returns {Promise} Promise obyekti
 */
const sendTelegramMessage = async (bot, chatId, text, options = {}) => {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error("Error sending telegram message:", error);
    throw error;
  }
};

/**
 * Klaviatura tugmalarini sinov muddati holatiga qarab yaratish
 * @param {Object} trialStatus Sinov muddati holati
 * @returns {Object} Klaviatura opsiyalari
 */
const getDriverKeyboard = (trialStatus) => {
  // Asosiy tugmalar
  const buttonRows = [
    [{ text: "Bot haqida" }, { text: "Aloqa" }],
    [{ text: "Sinov muddati holati" }]
  ];
  
  // Agar guruhda bo'lmasa, guruhga qo'shilish tugmasini ko'rsatamiz
  if (!trialStatus.isInGroup) {
    buttonRows.push([{ text: "Guruhga qo'shilish" }]);
  }
  
  // Agar sinov muddati tugagan bo'lsa va to'lanmagan bo'lsa, to'lov tugmasini ko'rsatamiz
  if (!trialStatus.inTrial && !trialStatus.isPaid) {
    buttonRows.push([{ text: "To'lov qilish" }]);
  }
  
  // Klaviatura opsiyalarini qaytaramiz
  return {
    reply_markup: {
      keyboard: buttonRows,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
};

/**
 * Foydalanuvchi uchun klaviatura
 */
const getUserKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Bot haqida" }, { text: "Aloqa" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
};

/**
 * Guruhda foydalanuvchi a'zoligini tekshirish
 * @param {Object} bot Bot obyekti
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<boolean>} Guruhda a'zo bo'lsa true, bo'lmasa false
 */
const isUserChatMember = async (bot, userId) => {
  try {
    const chatMember = await bot.getChatMember(config.telegramChatId, userId);
    return ["member", "administrator", "creator"].includes(chatMember.status);
  } catch (error) {
    console.error("Error checking if user is chat member:", error);
    return false;
  }
};

/**
 * To'lov cheki rasmini qayta ishlash
 * @param {Number} userId Foydalanuvchi ID
 * @param {String} photoId Rasm ID
 * @returns {Promise<Object>} To'lov natijasi
 */
const processPaymentPhoto = async (userId, photoId) => {
  try {
    // Faol trial havolani topamiz
    const invite = await DriverInvite.findOne({
      telegramId: userId,
      isActive: true,
    });
    
    if (!invite) {
      // Agar faol havola bo'lmasa yangi havola yaratish kerak
      return {
        status: 'success',
        message: "To'lov qabul qilindi. Guruhga qo'shilish uchun yangi havola yaratilmoqda.",
      };
    }
    
    // Havolani to'langan deb belgilaymiz
    invite.hasPaid = true;
    await invite.save();
    
    return {
      status: 'success',
      message: "To'lov qabul qilindi.",
      inviteId: invite._id
    };
  } catch (error) {
    console.error("Error processing payment photo:", error);
    return { status: 'error', message: "To'lovni qayta ishlashda xatolik" };
  }
};

module.exports = {
  saveUserData,
  sendTelegramMessage,
  getDriverKeyboard,
  getUserKeyboard,
  isUserChatMember,
  processPaymentPhoto,
};