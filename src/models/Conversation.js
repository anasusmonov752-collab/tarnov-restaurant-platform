const mongoose = require('mongoose');

// ── SUHBAT HOLATI ────────────────────────────────────────────
// Bot "HR odam kabi" gapirishi uchun oldingi gaplarni eslab turishi
// kerak: "ofitsiant kerak" -> "kechki smena" degan ikkinchi xabar
// birinchisiga QO'SHILISHI kerak, yangi qidiruv emas.
//
// Alohida kolleksiya: Client hujjatiga qo'shsak, har xabarda butun
// mijoz yozuvi qayta yozilardi.

const TurnSchema = new mongoose.Schema({
  r: { type: String, required: true },   // 'u' = foydalanuvchi, 'b' = bot
  t: { type: String, required: true }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  chatId:   { type: String, required: true },
  agencyId: { type: String, required: true },
  clientId:    { type: String, default: '' },   // mijoz tomoni
  candidateId: { type: String, default: '' },   // nomzod tomoni

  // To'plangan qidiruv mezonlari — xabardan xabarga to'ldirib boriladi
  criteria: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

  // search - nomzod qidirilyapti
  // offer  - tanlov yuborildi, endi vakansiya shartlari so'ralyapti
  stage: { type: String, default: 'search' },

  // Oxirgi tanlov — "nima taklif qilasiz?" javobi shunga yoziladi
  shortlistId: { type: String, default: '' },

  // Faqat oxirgi bir nechta gap saqlanadi: kontekst uchun shu yetarli
  // va promptni cheksiz o'stirmaydi.
  turns: { type: [TurnSchema], default: [] },

  lastCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

ConversationSchema.index({ chatId: 1 }, { unique: true });
// Suhbat 7 kun tinch tursa o'chadi — eski kontekst foyda bermaydi,
// aksincha botni allaqachon yopilgan mavzuga qaytaradi.
ConversationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('Conversation', ConversationSchema);
