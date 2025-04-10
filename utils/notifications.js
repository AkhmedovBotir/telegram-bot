import User from "../models/user.js";
import { bot } from "../index.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import fetch from "node-fetch";
import config from "../config.js";
import { generateNewInviteLink } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkExpiringMemberships() {
  try {
    console.log("Checking expiring memberships...");
    const now = new Date();
    const threeSecondsLater = new Date(now.getTime() + 3 * 1000); // 3 seconds ahead

    // Tugash vaqtiga 1-3 sekund qolganda xabar berish
    const expiringUsers = await User.find({
      accessExpiryDate: { $gt: now, $lt: threeSecondsLater },
      state: "active",
      notificationCount: { $lt: 2 },
    });

    for (const user of expiringUsers) {
      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          `⚠️ Ogohlantirish!\n\nSizning obunangiz ${user.accessExpiryDate.toLocaleDateString()} kuni tugaydi.\n\nIltimos, yangi to'lov chekini yuborishni unutmang!`,
        );

        user.lastNotification = now;
        user.notificationCount += 1;
        await user.save();
      } catch (error) {
        console.error(`Error notifying user ${user.telegramId}:`, error);
      }
    }

    // Guruhda bo'lmagan faol foydalanuvchilarni tekshirish
    const activeUsers = await User.find({
      state: "active",
      accessGranted: true,
    });

    // Eski bekor qilingan linklarni tozalash
    try {
      if (config.GROUP_ID) {
        const chat = await bot.telegram.getChat(config.GROUP_ID);
        if (chat.invite_link) {
          // Eski linkni bekor qilib, yangi link yaratish
          await bot.telegram.revokeChatInviteLink(config.GROUP_ID, chat.invite_link);
          const newLink = await bot.telegram.exportChatInviteLink(config.GROUP_ID);
          config.GROUP_INVITE_LINK = newLink;
        }
      }
    } catch (error) {
      console.error("Error cleaning up invite link:", error);
    }

    // Har bir foydalanuvchi uchun guruh a'zoligini tekshirish
    for (const user of activeUsers) {
      try {
        const chatMember = await bot.telegram.getChatMember(
          config.GROUP_ID,
          user.telegramId,
        );
        const isMember = ["member", "administrator", "creator"].includes(
          chatMember.status,
        );

        if (isMember) {
          // Agar guruhga qo'shilgan bo'lsa
          if (!user.isInGroup || user.inviteLink) {
            user.isInGroup = true;
            // Link bor bo'lsa o'chirish
            if (user.inviteLink) {
              try {
                // Eski linkni bekor qilish
                await bot.telegram.revokeChatInviteLink(
                  config.GROUP_ID,
                  user.inviteLink,
                );
              } catch (revokeError) {
                console.error(
                  `Error revoking invite link for user ${user.telegramId}:`,
                  revokeError,
                );
              }
              user.inviteLink = null;
            }
            await user.save();
          }
        } else if (!user.inviteLink && user.accessExpiryDate > now) {
          // Guruhda bo'lmagan va linki yo'q foydalanuvchilarga yangi link berish
          const newLink = await generateNewInviteLink(
            bot.telegram,
            config.GROUP_ID,
          );
          if (newLink) {
            user.inviteLink = newLink;
            await user.save();
            await bot.telegram.sendMessage(
              user.telegramId,
              `Guruhga qo'shilish havolasi. Obunangiz ${user.accessExpiryDate.toLocaleDateString()} gacha amal qiladi.`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "Guruhga qo'shilish", url: newLink }]]
                }
              }
            );
          }
        }
      } catch (error) {
        console.error(
          `Error checking member status for user ${user.telegramId}:`,
          error,
        );
      }
    }

    // Muddati tugagan foydalanuvchilarni tekshirish
    const expiredUsers = await User.find({
      accessExpiryDate: { $lt: now },
      state: "active",
    });

    for (const user of expiredUsers) {
      if (
        ["waiting_payment", "waiting_approval", "expired"].includes(
          user.state,
        ) ||
        !user.accessGranted
      ) {
        user.state = "expired";
        user.accessGranted = false;
        user.isInGroup = false;
        user.inviteLink = null; // Eski linkni o'chirish
        await user.save();

        try {
          // Guruhdan chiqarish
          if (config.GROUP_ID) {
            await bot.telegram.banChatMember(config.GROUP_ID, user.telegramId, {
              until_date: Math.floor(Date.now() / 1000) + 35, // 35 soniya keyin ban olib tashlanadi
            });

            // 40 soniyadan keyin banni olib tashlash
            setTimeout(async () => {
              try {
                await bot.telegram.unbanChatMember(
                  config.GROUP_ID,
                  user.telegramId,
                );
              } catch (unbanError) {
                console.error(
                  `Error unbanning user ${user.telegramId}:`,
                  unbanError,
                );
              }
            }, 40000);
          }

          // Foydalanuvchiga xabar yuborish
          await bot.telegram.sendMessage(
            user.telegramId,
            `❌ Obuna muddati tugadi!\n\nSiz guruhdan avtomatik chiqarildinigiz. Iltimos, yangi to'lov chekini yuborishingiz kerak.`,
          );
        } catch (error) {
          console.error(
            `Error handling expired user ${user.telegramId}:`,
            error,
          );
        }
      }
    }
  } catch (error) {
    console.error("Error checking expiring memberships:", error);
  }
}

export { checkExpiringMemberships };
