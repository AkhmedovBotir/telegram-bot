
import dotenv from 'dotenv';
dotenv.config();

export default {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/telegram_bot",
  ADMIN_USER_ID: 1543822491,
  GROUP_ID: process.env.GROUP_ID || "", // This should be a chat ID number like -1001234567890
  GROUP_INVITE_LINK: process.env.GROUP_INVITE_LINK || "",
  FREE_ACCESS_DAYS: 10,
  // Whether to generate a new invite link for each user
  GENERATE_NEW_INVITE_LINKS: true,
};
