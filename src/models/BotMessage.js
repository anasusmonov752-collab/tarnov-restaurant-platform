const mongoose = require('mongoose');

// ── TELEGRAM YOZISHMA TARIXI ─────────────────────────────────
// ALOHIDA kolleksiya — Candidate hujjatiga solinmaydi.
// Sabab: har nomzod bilan yozishma cheksiz o'sadi, nomzodlar ro'yxati esa
// deyarli har API so'rovida o'qiladi. Yozishmani ichkariga solsak ro'yxat
// og'irlashadi. MentorChat bilan bir xil mantiq.

const BotMessageSchema = new mongoose.Schema({
  id:           { type: String, required: true },
  restaurantId: { type: String, required: true },
  candidateId:  { type: String, required: true },

  // 'out' = admin -> nomzod,  'in' = nomzod -> admin
  direction: { type: String, required: true },
  text:      { type: String, default: '' },
  kind:      { type: String, default: 'text' },   // text | template | system

  // Telegram xabar id'lari
  tgMessageId: { type: Number, default: null },   // nomzod chatidagi xabar
  adminMsgId:  { type: Number, default: null },   // admin chatiga ko'chirilgan xabar
                                                  // (admin shunga reply qilib javob yozadi)

  sentBy: { type: String, default: 'panel' },     // panel | telegram | system
  error:  { type: String, default: '' },          // yuborilmasa — sabab

  createdAt: { type: Date, default: Date.now }
});

BotMessageSchema.index({ restaurantId: 1, candidateId: 1, createdAt: -1 });
// Admin Telegramda reply qilganda qaysi nomzodga tegishliligini topish uchun
BotMessageSchema.index({ restaurantId: 1, adminMsgId: 1 });

module.exports = mongoose.model('BotMessage', BotMessageSchema);
