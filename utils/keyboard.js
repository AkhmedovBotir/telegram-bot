import { Markup } from 'telegraf';

export const adminMainKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Kutish ro\'yxati', 'waiting_list')],
    [Markup.button.callback('Foydalanuvchilar ro\'yxati', 'users_list')],
    [Markup.button.callback('Muddati tugayotgan a\'zoliklar', 'expiring_memberships')],
    [Markup.button.callback('Matnlarni tahrirlash', 'edit_texts')],
    [Markup.button.callback('Statistika', 'statistics')]
  ]);
};

export const phoneKeyboard = Markup.keyboard([
  [Markup.button.contactRequest('Telefon raqamni yuborish')]
]).resize();

export const expiredUserKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Yangi ruxsat so\'rash', 'request_access')]
]);

export const activeUserKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Muddat holatini tekshirish', 'check_expiry')]
]);

export const backButtonsKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('Kutish ro\'yxatiga qaytish', 'waiting_list'),
    Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')
  ]
]);