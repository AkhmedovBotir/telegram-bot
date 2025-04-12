const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');
const botUtils = require('../utils/botUtils');

/**
 * Foydalanuvchini ro'yxatdan o'tkazish yoki mavjud foydalanuvchini yangilash
 * @param {Object} userData Foydalanuvchi ma'lumotlari
 * @returns {Promise<Object>} Foydalanuvchi obyekti va holati
 */
const registerOrUpdateUser = async (userData) => {
  try {
    const { telegramId, username, firstName, lastName } = userData;
    
    // Foydalanuvchini ID bo'yicha topamiz
    let user = await User.findOne({ telegramId });
    
    // Agar topilmasa, yangi foydalanuvchi yaratamiz
    if (!user) {
      user = new User({
        telegramId,
        username,
        firstName,
        lastName,
        role: null, // Ro'yxatdan o'tmagan
        state: "normal",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      await user.save();
      console.log(`New user registered: ${telegramId}`);
      
      return { status: 'success', user, isNew: true };
    }
    
    // Agar mavjud bo'lsa, ma'lumotlarni yangilaymiz
    // Lekin role va state kabi muhim maydonlarni o'zgartirmaymiz
    user.username = username || user.username;
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.updatedAt = new Date();
    
    await user.save();
    console.log(`User updated: ${telegramId}`);
    
    return { status: 'success', user, isNew: false };
  } catch (error) {
    console.error("Error registering or updating user:", error);
    return { status: 'error', message: "Foydalanuvchini ro'yxatga olishda xatolik", error };
  }
};

/**
 * Foydalanuvchi rolini yangilash
 * @param {Number} telegramId Telegram ID
 * @param {String} role Rol ('user' yoki 'driver')
 * @returns {Promise<Object>} Yangilangan foydalanuvchi
 */
const updateUserRole = async (telegramId, role) => {
  try {
    // Foydalanuvchini topamiz
    let user = await User.findOne({ telegramId });
    
    if (!user) {
      // Foydalanuvchi topilmasa, uni ro'yxatdan o'tkazamiz
      user = new User({
        telegramId,
        role,
        state: "normal",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      // Foydalanuvchi rolini yangilaymiz
      user.role = role;
      user.updatedAt = new Date();
    }
    
    await user.save();
    console.log(`User role updated: ${telegramId} -> ${role}`);
    
    return { status: 'success', user };
  } catch (error) {
    console.error("Error updating user role:", error);
    return { status: 'error', message: "Rolni yangilashda xatolik", error };
  }
};

/**
 * Foydalanuvchi holatini yangilash
 * @param {Number} telegramId Telegram ID
 * @param {String} state Holat
 * @param {Object} additionalData Qo'shimcha ma'lumotlar
 * @returns {Promise<Object>} Yangilangan foydalanuvchi
 */
const updateUserState = async (telegramId, state, additionalData = {}) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      return { status: 'error', message: "Foydalanuvchi topilmadi" };
    }
    
    // Foydalanuvchi holatini yangilaymiz
    user.state = state;
    
    // Qo'shimcha ma'lumotlarni yangilaymiz
    if (additionalData.fullName) {
      user.fullName = additionalData.fullName;
    }
    
    if (additionalData.phoneNumber) {
      user.phoneNumber = additionalData.phoneNumber;
    }
    
    user.updatedAt = new Date();
    await user.save();
    
    console.log(`User state updated: ${telegramId} -> ${state}`);
    return { status: 'success', user };
  } catch (error) {
    console.error("Error updating user state:", error);
    return { status: 'error', message: "Holatni yangilashda xatolik", error };
  }
};

/**
 * Foydalanuvchi to'lovini qayta ishlash
 * @param {Number} telegramId Telegram ID
 * @param {String} photoId Foto ID
 * @returns {Promise<Object>} Natija
 */
const processUserPayment = async (telegramId, photoId) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      return { status: 'error', message: "Foydalanuvchi topilmadi" };
    }
    
    // Faqat haydovchilar to'lov qilishi mumkin
    if (user.role !== 'driver') {
      return { status: 'error', message: "Faqat haydovchilar to'lov qilishi mumkin" };
    }
    
    // To'lov chekini qayta ishlaymiz
    return await botUtils.processPaymentPhoto(telegramId, photoId);
  } catch (error) {
    console.error("Error processing user payment:", error);
    return { status: 'error', message: "To'lovni qayta ishlashda xatolik", error };
  }
};

module.exports = {
  registerOrUpdateUser,
  updateUserRole,
  updateUserState,
  processUserPayment,
};