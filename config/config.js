require("dotenv").config();

module.exports = {
  telegramBotToken:
    process.env.TELEGRAM_BOT_TOKEN ||
    "8032030648:AAGIy-6oJ0Nh1GvplFV2iAOr5u_sf92S_2E",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "-2008944577", // Supergroup ID, oldingi 100 prefiksini olib tashladim
  telegramGroupLink: process.env.TELEGRAM_GROUP_LINK || "https://t.me/+7qrLcBI7yM84YzJi",
  mongodbUri:
    "mongodb://Botir:%293K6SB%3E%3F_j4%2CcS_%24@45.120.178.65:27017/akiftaxi?authSource=admin&directConnection=true",
  appDeepLink: process.env.APP_DEEP_LINK || "https://v0-akiftaxi.vercel.app/",
};
