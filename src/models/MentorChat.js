const mongoose = require('mongoose');

// ── MENTOR SUHBAT TARIXI ─────────────────────────────────────
// ALOHIDA kolleksiya — Restaurant hujjatiga solinmaydi.
// Sabab: Restaurant deyarli har API so'rovida to'liq o'qiladi. Suhbat esa
// cheksiz o'sadi (25 ofitsiant x yuzlab xabar) — uni ichkariga solsak
// har so'rov og'irlashadi va 16 MB hujjat limitiga yaqinlashadi.

const MessageSchema = new mongoose.Schema({
  role:    { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  at:      { type: Date, default: Date.now }
}, { _id: false });

const MentorChatSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true },
  waiterId:     { type: String, required: true },

  messages: [MessageSchema],

  // Eski xabarlarning qisqacha mazmuni. Hamma tarixni AI'ga yuborib
  // bo'lmaydi (token limiti va narx), shuning uchun eskilari shu yerga
  // siqiladi va system prompt'ga qo'shiladi.
  summary:        { type: String, default: '' },
  // Nechta xabar summary'ga kirgan — shundan keyingilari hali "yangi"
  summarizedUpTo: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

MentorChatSchema.index({ restaurantId: 1, waiterId: 1 }, { unique: true });

module.exports = mongoose.model('MentorChat', MentorChatSchema);
