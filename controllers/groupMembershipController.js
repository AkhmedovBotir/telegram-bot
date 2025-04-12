const config = require('../config/config');
const DriverInvite = require('../models/DriverInvite');
const User = require('../models/User');
const membershipUtils = require('../utils/membershipUtils');
const messageController = require('./messageController');

/**
 * Guruhga yangi a'zo qo'shilganda ishlatiladigan funksiya
 * @param {Object} bot Bot obyekti
 * @param {Object} update Update obyekti
 * @returns {Promise<Object>} Natija
 */
const handleMemberJoin = async (bot, update) => {
  try {
    console.log("chat_member event received:", JSON.stringify(update));
    
    const chatId = update.chat.id;
    const userId = update.new_chat_member.user.id;
    const status = update.new_chat_member.status;
    
    console.log(`Chat member update: chatId=${chatId}, userId=${userId}, status=${status}`);
    console.log(`Target chatId in config: ${config.telegramChatId}`);
    
    // Faqat bizning guruh va member statusiga ega bo'lgan foydalanuvchilar uchun
    if (chatId.toString() === config.telegramChatId && status === "member") {
      console.log(`User ${userId} joined our target group!`);
      
      // Invite topamiz
      const invite = await DriverInvite.findOne({
        telegramId: userId,
        isActive: true,
      });
      
      console.log(`Found invite for user ${userId}:`, invite ? 'Yes' : 'No');
      
      if (invite) {
        console.log(`Updating invite for user ${userId}`);
        // Invite statusini yangilaymiz
        invite.isActive = false;
        invite.isInGroup = true;
        invite.joinedGroupAt = new Date();
        await invite.save();
        console.log(`Successfully updated invite for user ${userId}, joined at ${invite.joinedGroupAt}`);
        
        // Havolani o'chiramiz
        if (invite.inviteLink && invite.inviteLink.startsWith("https://t.me/+")) {
          const linkParts = invite.inviteLink.split("+");
          if (linkParts.length > 1) {
            const linkCode = linkParts[1];
            try {
              await bot.revokeChatInviteLink(config.telegramChatId, linkCode);
              console.log("Invite link revoked upon member join");
            } catch (revokeError) {
              console.error("Could not revoke invite link upon join:", revokeError);
            }
          }
        }
        
        // Foydalanuvchiga xabar yuboramiz
        await messageController.sendUserMessage(
          bot,
          userId,
          "Guruhga muvaffaqiyatli qo'shildingiz! Test uchun 10 sekundlik sinov muddati boshlandi."
        );
        
        return { status: 'success', joined: true };
      } else {
        console.log(`User ${userId} joined group but no active invite found`);
        return { status: 'success', joined: true, noInvite: true };
      }
    }
    
    return { status: 'success', notTargetGroup: true };
  } catch (error) {
    console.error("Error handling member join:", error);
    return { status: 'error', message: "A'zo qo'shilishini qayta ishlashda xatolik" };
  }
};

/**
 * Sinov muddati tugagan foydalanuvchilarni guruhdan chiqarish
 * @param {Object} bot Bot obyekti
 * @returns {Promise<Object>} Natija
 */
const removeExpiredTrialMembers = async (bot) => {
  try {
    const now = new Date();
    console.log("Current timestamp:", now);
    
    // Barcha driver invite larni tekshirib ko'ramiz (debug uchun)
    const allInvites = await DriverInvite.find({});
    console.log(`Total driver invites in database: ${allInvites.length}`);
    
    for (const invite of allInvites) {
      console.log(`Driver invite: id=${invite._id}, telegramId=${invite.telegramId}, isInGroup=${invite.isInGroup}, hasPaid=${invite.hasPaid}, joinedGroupAt=${invite.joinedGroupAt}`);
    }
    
    // Sinov muddati tugagan va to'lov qilinmagan a'zolarni topamiz
    const tenSecondsAgo = new Date(now - 10 * 1000); // Test uchun 10 sekund oldin qo'shilganlar
    console.log("Looking for users who joined before:", tenSecondsAgo);
    
    const expiredInvites = await DriverInvite.find({
      isInGroup: true,
      hasPaid: false,
      joinedGroupAt: { $lt: tenSecondsAgo },
    });
    
    console.log(`Found ${expiredInvites.length} expired trial invites`);
    
    let removedCount = 0;
    let errorCount = 0;
    
    // Har bir a'zoni guruhdan chiqaramiz
    for (const invite of expiredInvites) {
      try {
        console.log(`Attempting to remove user ${invite.telegramId} from group`);
        
        // Guruhdan chiqaramiz
        await bot.banChatMember(config.telegramChatId, invite.telegramId, {
          until_date: Math.floor(Date.now() / 1000) + 30, // 30 soniyadan keyin qayta qo'shila oladi
        });
        
        console.log(`User ${invite.telegramId} successfully banned from group`);
        
        // Foydalanuvchiga xabar yuboramiz
        await messageController.sendUserMessage(
          bot,
          invite.telegramId,
          "DIQQAT! Sinov muddatingiz tugadi va siz guruhdan chiqarib yuborildingiz. Davom etish uchun to'lovni amalga oshiring."
        );
        
        console.log(`Notification sent to user ${invite.telegramId}`);
        
        // Invite statusini yangilaymiz
        invite.isInGroup = false;
        await invite.save();
        console.log(`Updated invitation status for user ${invite.telegramId}`);
        
        removedCount++;
      } catch (error) {
        console.error(`Error removing user ${invite.telegramId} from group:`, error);
        errorCount++;
      }
    }
    
    return { 
      status: 'success', 
      removedCount, 
      errorCount, 
      totalProcessed: expiredInvites.length 
    };
  } catch (error) {
    console.error("Error checking and removing expired trial members:", error);
    return { status: 'error', message: "Sinov muddati tugagan a'zolarni tekshirishda xatolik" };
  }
};

/**
 * Foydalanuvchi guruhda borligini tekshirish
 * @param {Object} bot Bot obyekti
 * @param {Number} userId User ID
 * @returns {Promise<boolean>} Guruhda bo'lsa true
 */
const isUserInGroup = async (bot, userId) => {
  try {
    const chatMember = await bot.getChatMember(config.telegramChatId, userId);
    // Bu statuslar guruh a'zosi ekanligini bildiradi
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    console.error("Error checking if user is in group:", error);
    return false;
  }
};

module.exports = {
  handleMemberJoin,
  removeExpiredTrialMembers,
  isUserInGroup
};