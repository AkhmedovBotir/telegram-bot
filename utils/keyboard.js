const { Markup } = require('telegraf');

// Keyboard for admin main menu
const adminMainKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Kutilayotganlar', 'waiting_list')],
    [Markup.button.callback('Foydalanuvchilar', 'users_list')],
    [Markup.button.callback('Tugayotgan azoliklar', 'expiring_memberships')],
    [Markup.button.callback('Matnlarni tahrirlash', 'edit_texts')],
    [Markup.button.callback('Statistika', 'statistics')]
  ]);
};

// Keyboard for contact sharing
const phoneKeyboard = () => {
  return Markup.keyboard([
    [Markup.button.contactRequest('Telefon raqamni yuborish')]
  ]).resize();
};

// Keyboard for user with expired access
const expiredUserKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Ruxsat so\'rash', 'request_access')]
  ]);
};

// Keyboard for active user
const activeUserKeyboard = (groupLink) => {
  return Markup.inlineKeyboard([
    [Markup.button.url('Guruhga o\'tish', groupLink)],
    [Markup.button.callback('Muddat holatini tekshirish', 'check_expiry')]
  ]);
};

// Keyboard for back buttons
const backButtonsKeyboard = (showEdit = false) => {
  let buttons = [];
  
  if (showEdit) {
    buttons.push([Markup.button.callback('Yana matn tahrirlash', 'edit_texts')]);
  }
  
  buttons.push([Markup.button.callback('Asosiy menyuga qaytish', 'back_to_main')]);
  
  return Markup.inlineKeyboard(buttons);
};

module.exports = {
  adminMainKeyboard,
  phoneKeyboard,
  expiredUserKeyboard,
  activeUserKeyboard,
  backButtonsKeyboard
};
