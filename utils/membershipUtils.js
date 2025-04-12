const DriverInvite = require('../models/DriverInvite');
const User = require('../models/User');

/**
 * Sinov muddati holatini tekshirish
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<Object>} Sinov muddati holati
 */
const checkTrialPeriod = async (userId) => {
  try {
    console.log(`[checkTrialPeriod] Checking trial period for user ${userId}`);
    
    // Foydalanuvchining guruh havolasini topamiz
    const latestInvite = await DriverInvite.findOne(
      { telegramId: userId },
      {},
      { sort: { createdAt: -1 } } // Eng so'nggi havolani olamiz
    );
    
    console.log(`[checkTrialPeriod] Latest invite for user ${userId}:`, 
      latestInvite 
        ? `found, isInGroup=${latestInvite.isInGroup}, hasPaid=${latestInvite.hasPaid}, joinedGroupAt=${latestInvite.joinedGroupAt}`
        : 'not found'
    );
    
    // Agar havola topilmasa
    if (!latestInvite) {
      console.log(`[checkTrialPeriod] No invite found for user ${userId}`);
      return {
        status: 'not_started',
        message: "Guruhga qo'shilish uchun havola yaratilmagan.",
        inTrial: false,
        isInGroup: false,
        isPaid: false,
        daysLeft: 0,
      };
    }
    
    // Agar havola to'langan bo'lsa
    if (latestInvite.hasPaid) {
      return {
        status: 'paid',
        message: "Siz to'lovni amalga oshirgansiz.",
        inTrial: false,
        isInGroup: latestInvite.isInGroup,
        isPaid: true,
        daysLeft: 0,
      };
    }
    
    // Agar guruhga qo'shilmagan bo'lsa
    if (!latestInvite.isInGroup) {
      return {
        status: 'invite_pending',
        message: "Siz guruhga hali qo'shilmagansiz.",
        inTrial: false,
        isInGroup: false,
        isPaid: false,
        daysLeft: 0,
      };
    }
    
    // Agar qo'shilgan bo'lsa, sinov muddatini hisoblaymiz
    const now = new Date();
    const joinedAt = new Date(latestInvite.joinedGroupAt);
    const trialSeconds = 10; // Test uchun 10 sekund (keyin 10 kun qilamiz)
    
    // Sinov muddati tugash sanasi
    const trialEndDate = new Date(joinedAt.getTime() + trialSeconds * 1000);
    
    // Qolgan vaqt (millisekundlarda)
    const timeLeftMs = trialEndDate - now;
    
    // Qolgan sekundlar
    const secondsLeft = Math.ceil(timeLeftMs / 1000);
    
    // Qolgan "kunlar" (test uchun sekundlar)
    const daysLeft = secondsLeft;
    
    // Sinov muddati tugaganmi?
    if (daysLeft <= 0) {
      return {
        status: 'trial_expired',
        message: "Sinov muddatingiz tugagan. Iltimos, to'lovni amalga oshiring.",
        inTrial: false,
        isInGroup: true,
        isPaid: false,
        daysLeft: 0,
      };
    }
    
    // Sinov muddati davom etmoqda
    // Har doim qancha vaqt qolgani haqida xabar qaytaramiz (har 1 sekundda)
    const warningLevel = daysLeft; // har bir sekund boshqa warning level
    
    return {
      status: 'trial_ending_soon',
      message: `OGOHLANTIRISH: Guruhda sinov muddatingiz tugashiga ${daysLeft} sekund qoldi! To'lovni amalga oshiring.`,
      inTrial: true,
      isInGroup: true,
      isPaid: false,
      daysLeft,
      warningLevel  // har bir sekund uchun alohida warning level
    };
  } catch (error) {
    console.error("Error checking trial period:", error);
    return {
      status: 'error',
      message: "Sinov muddatini tekshirishda xatolik yuz berdi.",
      inTrial: false,
      isInGroup: false,
      isPaid: false,
      daysLeft: 0,
    };
  }
};

/**
 * To'lov uchun chek rasmini qayta ishlash
 * @param {Number} userId Foydalanuvchi ID
 * @param {String} photoId Foto fayl ID
 * @returns {Promise<Object>} Natija
 */
const processPaymentReceipt = async (userId, photoId) => {
  try {
    // Foydalanuvchini topamiz
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || user.role !== 'driver') {
      return { status: 'error', message: "Faqat haydovchilar to'lov qilishi mumkin." };
    }
    
    // Foydalanuvchining faol havolasini topamiz
    const activeInvite = await DriverInvite.findOne({
      telegramId: userId,
      isActive: true,
    });
    
    // Faol havola topilmasa yoki havola to'langan bo'lsa
    if (!activeInvite) {
      // Foydalanuvchining oxirgi havolasini topamiz
      const latestInvite = await DriverInvite.findOne(
        { telegramId: userId },
        {},
        { sort: { createdAt: -1 } }
      );
      
      // Oxirgi havola ham topilmasa
      if (!latestInvite) {
        return { status: 'error', message: "Havola topilmadi." };
      }
      
      // Havola to'langan bo'lsa
      if (latestInvite.hasPaid) {
        return { status: 'already_paid', message: "Siz allaqachon to'lovni amalga oshirgansiz." };
      }
      
      // Havola to'lanmagan bo'lsa
      latestInvite.hasPaid = true;
      latestInvite.paymentPhotoId = photoId;
      latestInvite.paymentDate = new Date();
      await latestInvite.save();
      
      return { status: 'success', message: "To'lov qabul qilindi.", inviteId: latestInvite._id };
    }
    
    // Faol havola topilsa
    activeInvite.hasPaid = true;
    activeInvite.paymentPhotoId = photoId;
    activeInvite.paymentDate = new Date();
    await activeInvite.save();
    
    return { status: 'success', message: "To'lov qabul qilindi.", inviteId: activeInvite._id };
  } catch (error) {
    console.error("Error processing payment receipt:", error);
    return { status: 'error', message: "To'lovni qayta ishlashda xatolik yuz berdi." };
  }
};

/**
 * To'lovni tasdiqlash va yangi havola berish
 * @param {Number} userId Foydalanuvchi ID
 * @param {String} inviteId Taklif ID
 * @param {Function} createInviteLink Havola yaratish funksiyasi
 * @returns {Promise<Object>} Natija
 */
const confirmPaymentAndCreateInvite = async (userId, inviteId, createInviteLink) => {
  try {
    // Taklif havolasini topamiz
    const invite = await DriverInvite.findById(inviteId);
    
    if (!invite || invite.telegramId !== userId) {
      return { success: false, message: "Havola topilmadi." };
    }
    
    // Havola allaqachon to'langan bo'lsa
    if (invite.hasPaid) {
      return { success: true, message: "Havola allaqachon to'langan." };
    }
    
    // Havolani to'langan deb belgilaymiz
    invite.hasPaid = true;
    invite.paymentDate = new Date();
    await invite.save();
    
    return { success: true, message: "To'lov tasdiqlandi." };
  } catch (error) {
    console.error("Error confirming payment:", error);
    return { success: false, message: "To'lovni tasdiqlashda xatolik yuz berdi." };
  }
};

/**
 * Havolani tekshirish
 * @param {String} inviteLink Havola
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<Object>} Natija
 */
const checkInviteLink = async (inviteCode, userId) => {
  try {
    // Havolani topamiz
    const invite = await DriverInvite.findById(inviteCode);
    
    if (!invite) {
      return { status: 'invalid', message: "Havola topilmadi." };
    }
    
    // Agar havola boshqa foydalanuvchiga tegishli bo'lsa
    if (invite.telegramId !== userId) {
      return { status: 'invalid', message: "Bu havola sizga tegishli emas." };
    }
    
    // Agar havola faol bo'lmasa
    if (!invite.isActive) {
      return { status: 'invalid', message: "Havola faol emas." };
    }
    
    // Agar havola muddati tugagan bo'lsa
    if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
      return { status: 'invalid', message: "Havola muddati tugagan." };
    }
    
    return { status: 'valid', inviteId: invite._id };
  } catch (error) {
    console.error("Error checking invite link:", error);
    return { status: 'invalid', message: "Havolani tekshirishda xatolik yuz berdi." };
  }
};

/**
 * Havolani ishlatilgan deb belgilash
 * @param {String} inviteId Taklif ID
 * @returns {Promise<boolean>} Muvaffaqiyatli bo'lsa true, aks holda false
 */
const markInviteLinkAsUsed = async (inviteId) => {
  try {
    // Havolani topamiz
    const invite = await DriverInvite.findById(inviteId);
    
    if (!invite) {
      return false;
    }
    
    // Havolani yangilaymiz
    invite.isActive = false;
    invite.usedAt = new Date();
    invite.isExpired = true;
    await invite.save();
    
    return true;
  } catch (error) {
    console.error("Error marking invite link as used:", error);
    return false;
  }
};

module.exports = {
  checkTrialPeriod,
  processPaymentReceipt,
  confirmPaymentAndCreateInvite,
  checkInviteLink,
  markInviteLinkAsUsed,
};