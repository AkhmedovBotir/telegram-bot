const config = require('../config/config');
const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');
const membershipUtils = require('../utils/membershipUtils');

/**
 * Guruh uchun sinov muddati havolasini yaratish
 * @param {Object} bot Bot obyekti
 * @param {Number} userId Foydalanuvchi ID
 * @param {String} fullName Foydalanuvchi to'liq ismi
 * @returns {Promise<String|null>} Yaratilgan havola yoki null
 */
const createTrialInviteLink = async (bot, userId, fullName) => {
  try {
    // Avval foydalanuvchi uchun faol havolani tekshiramiz
    const existingInvite = await DriverInvite.findOne({
      telegramId: userId,
      isActive: true,
    });
    
    if (existingInvite) {
      // Mavjud havolani qaytaramiz
      return existingInvite.inviteLink;
    }
    
    // Sinov muddati holatini tekshiramiz
    const trialStatus = await membershipUtils.checkTrialPeriod(userId);
    
    // Agar to'langan bo'lsa yoki sinov muddati tugagan bo'lsa
    if (trialStatus.isPaid) {
      // To'lov bazali havolani yaratamiz
      return await createPaymentInviteLink(bot, userId);
    }
    
    // Yangi havola yaratamiz
    console.log(`Attempting to create invite link for user ${userId} in chat ${config.telegramChatId}`);
    
    // Guruh ma'lumotlarini olishga urinib ko'ramiz
    try {
      const chatInfo = await bot.getChat(config.telegramChatId);
      console.log("Chat info:", chatInfo.type, chatInfo.title);
      if (chatInfo.type !== 'supergroup' && chatInfo.type !== 'group') {
        console.error(`Chat type is not a group: ${chatInfo.type}`);
        return null;
      }
    } catch (chatError) {
      console.error("Error getting chat info:", chatError.message);
      // ID raqamini tekshiramiz
      console.log("Using chat ID:", config.telegramChatId, "Original in config:", process.env.TELEGRAM_CHAT_ID);
      return null;
    }
    
    // Botning guruhda admin ekanligini tekshiramiz
    try {
      const botMember = await bot.getChatMember(config.telegramChatId, bot.botId);
      console.log("Bot status in group:", botMember.status);
      console.log("Bot can invite users:", botMember.can_invite_users);
      
      if (botMember.status !== 'administrator') {
        console.error("Bot is not admin in the group");
        return null;
      }
      
      if (!botMember.can_invite_users) {
        console.error("Bot does not have permission to invite users");
        return null;
      }
    } catch (error) {
      console.error("Error checking bot permissions:", error.message);
      return null;
    }
    
    // Havola yaratamiz
    let createdInvite;
    try {
      createdInvite = await bot.createChatInviteLink(config.telegramChatId, {
        name: `Trial for ${fullName}`,
        creates_join_request: false,
        expire_date: Math.floor(Date.now() / 1000) + 10, // Test uchun 10 sekund
        member_limit: 1, // Faqat 1 kishi uchun
      });
      console.log("Invite link created successfully:", createdInvite.invite_link);
    } catch (error) {
      console.error("Error creating chat invite link:", error.message);
      return null;
    }
    
    // Yangi invite qo'shamiz
    if (createdInvite && createdInvite.invite_link) {
      const newInvite = new DriverInvite({
        telegramId: userId,
        fullName,
        inviteLink: createdInvite.invite_link,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 1000), // Test uchun 10 sekund
        isActive: true,
        isExpired: false,
        isInGroup: false,
        hasPaid: false,
      });
      
      await newInvite.save();
      console.log("New invite link created successfully");
      
      return createdInvite.invite_link;
    }
    
    console.error("Failed to create invite link");
    return null;
  } catch (error) {
    console.error("Error creating trial invite link:", error);
    return null;
  }
};

/**
 * Havolani tekshirish
 * @param {String} inviteLink Havola 
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<Object>} Tekshirish natijasi
 */
const checkInviteLinkValidity = async (inviteCode, userId) => {
  try {
    // Sinov mudati bazali havolalarni tekshirish imkoniyati yo'q
    // Faqat invite ID orqali havolalarni tekshira olamiz
    // Bu to'lov qilingan havolalar uchun ishlatiladi
    
    // Havolani tekshiramiz
    const inviteCheck = await membershipUtils.checkInviteLink(inviteCode, userId);
    
    if (inviteCheck.status === 'invalid') {
      return {
        valid: false,
        message: inviteCheck.message || "Havola yaroqsiz yoki muddati tugagan.",
      };
    }
    
    return {
      valid: true,
      inviteId: inviteCheck.inviteId,
    };
  } catch (error) {
    console.error("Error checking invite link validity:", error);
    
    return {
      valid: false,
      message: "Havolani tekshirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
    };
  }
};

/**
 * Havolani ishlatilgan deb belgilash
 * @param {String} inviteId Taklif ID 
 * @returns {Promise<boolean>} Muvaffaqiyatli bo'lsa true
 */
const markInviteLinkAsUsed = async (inviteId) => {
  try {
    // Havolani belgilaymiz
    return await membershipUtils.markInviteLinkAsUsed(inviteId);
  } catch (error) {
    console.error("Error marking invite link as used:", error);
    return false;
  }
};

/**
 * To'lov bo'yicha havola yaratish
 * @param {Object} bot Bot obyekti
 * @param {Number} userId Foydalanuvchi ID
 * @param {String} inviteId Taklif ID
 * @returns {Promise<Object>} To'lov natijasi
 */
const createPaymentInviteLink = async (bot, userId, inviteId = null) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      console.error("User not found for payment invite");
      return null;
    }
    
    // Guruh havolasini yaratamiz
    console.log(`Attempting to create payment invite link for user ${userId} in chat ${config.telegramChatId}`);
    let createdInvite;
    try {
      createdInvite = await bot.createChatInviteLink(config.telegramChatId, {
        name: `Paid invite for ${user.fullName || user.firstName}`,
        creates_join_request: false,
        member_limit: 1, // Faqat 1 kishi uchun
      });
      console.log("Payment invite link created successfully:", createdInvite.invite_link);
    } catch (error) {
      console.error("Error creating payment invite link:", error.message);
      // Botning guruhda admin ekanligini tekshirish
      try {
        const botMember = await bot.getChatMember(config.telegramChatId, bot.botId);
        console.log("Bot status in group:", botMember.status);
        console.log("Bot can invite users:", botMember.can_invite_users);
      } catch (chatError) {
        console.error("Error checking bot permissions:", chatError.message);
      }
      return null;
    }
    
    if (!createdInvite || !createdInvite.invite_link) {
      console.error("Failed to create payment invite link");
      return null;
    }
    
    // Agar inviteId berilgan bo'lsa, to'lov tasdiqlandi degan ma'noni anglatadi
    if (inviteId) {
      const confirmResult = await membershipUtils.confirmPaymentAndCreateInvite(
        userId, 
        inviteId, 
        createTrialInviteLink
      );
      
      if (!confirmResult.success) {
        console.error("Failed to confirm payment:", confirmResult.message);
        return null;
      }
    }
    
    // Yangi invite yaratamiz
    const newInvite = new DriverInvite({
      telegramId: userId,
      fullName: user.fullName || user.firstName,
      inviteLink: createdInvite.invite_link,
      createdAt: new Date(),
      expiresAt: null, // Muddatsiz
      isActive: true,
      isExpired: false,
      isInGroup: false,
      hasPaid: true, // To'langan
    });
    
    await newInvite.save();
    console.log("New payment invite link created successfully");
    
    return createdInvite.invite_link;
  } catch (error) {
    console.error("Error creating payment invite link:", error);
    return null;
  }
};

module.exports = {
  createTrialInviteLink,
  checkInviteLinkValidity,
  markInviteLinkAsUsed,
  createPaymentInviteLink,
};