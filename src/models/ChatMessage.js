const mongoose = require('mongoose');

// ── SUHBAT XABARI ────────────────────────────────────────────
// ChatThread'dan ALOHIDA: thread ro'yxati har inbox ochilganda o'qiladi,
// xabarlar esa cheksiz o'sadi. Ichkariga solsak ro'yxat og'irlashadi.

const ChatMessageSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },
  threadId: { type: String, required: true },

  // Kim yozdi. 'system' — hech kim yozmagan, platforma qo'ygan
  // (kontakt ochildi, suhbat belgilandi va h.k.). Buni ALOHIDA
  // ko'rsatamiz: tizim xabarini odamning gapi qilib ko'rsatish
  // yozishmani dalil sifatida ishlatishni buzadi.
  from: { type: String, required: true, enum: ['client', 'candidate', 'agency', 'system'] },

  kind: { type: String, default: 'text', enum: ['text', 'system'] },
  text: { type: String, default: '' },

  // Telegram'ga xabar berilganmi. Mini App doim ochiq turmaydi —
  // push bo'lmasa odam yozadi, javob ko'rmaydi va chatni tashlab ketadi.
  // null = hali yuborilmagan.
  tgPushedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

ChatMessageSchema.index({ agencyId: 1, threadId: 1, createdAt: 1 });
ChatMessageSchema.index({ agencyId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
