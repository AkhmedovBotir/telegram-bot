import User from '../models/user.js';
import { bot } from '../index.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkExpiringMemberships() {
  try {
    console.log('Checking expiring memberships...');
    const now = new Date();
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 24 soat ichida tugaydigan a'zoliklar
    const expiringUsers = await User.find({
      accessExpiryDate: { $gt: now, $lt: oneDayLater },
      state: 'active',
      notificationCount: { $lt: 2 }
    });

    for (const user of expiringUsers) {
      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          `⚠️ Ogohlantirish!\n\nSizning obunangiz ${user.accessExpiryDate.toLocaleDateString()} kuni tugaydi.\n\nIltimos, yangi to'lov chekini yuborishni unutmang!`
        );

        user.lastNotification = now;
        user.notificationCount += 1;
        await user.save();
      } catch (error) {
        console.error(`Error notifying user ${user.telegramId}:`, error);
      }
    }

    // Muddati tugagan foydalanuvchilarni tekshirish
    const expiredUsers = await User.find({
      accessExpiryDate: { $lt: now },
      state: 'active'
    });

    for (const user of expiredUsers) {
      if (['waiting_payment', 'waiting_approval', 'expired'].includes(user.state) || !user.accessGranted) {
        user.state = 'expired';
        user.accessGranted = false;
        user.isInGroup = false;
        user.inviteLink = null; // Eski linkni o'chirish
        await user.save();

      try {
        // Guruhdan chiqarish
        if (config.GROUP_ID) {
          await bot.telegram.banChatMember(config.GROUP_ID, user.telegramId, {
            until_date: Math.floor(Date.now() / 1000) + 35  // 35 soniya keyin ban olib tashlanadi
          });
          
          // 40 soniyadan keyin banni olib tashlash
          setTimeout(async () => {
            try {
              await bot.telegram.unbanChatMember(config.GROUP_ID, user.telegramId);
            } catch (unbanError) {
              console.error(`Error unbanning user ${user.telegramId}:`, unbanError);
            }
          }, 40000);
        }

        // Foydalanuvchiga xabar yuborish
        await bot.telegram.sendMessage(
          user.telegramId,
          `❌ Obuna muddati tugadi!\n\nSiz guruhdan avtomatik chiqarildinigiz. Iltimos, yangi to'lov chekini yuborishingiz kerak.`
        );
      } catch (error) {
        console.error(`Error handling expired user ${user.telegramId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking expiring memberships:', error);
  }
}

export { checkExpiringMemberships };