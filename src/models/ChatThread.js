const mongoose = require('mongoose');

// ── SUHBAT (MIJOZ TOMONI) ────────────────────────────────────
// Ikki xil suhbat shu yerda: mijoz<->nomzod va mijoz<->agentlik.
//
// Agentlik<->nomzod yozishmasi BU YERDA EMAS — u BotMessage'da, chunki
// unda Telegram plumbing'i bor (tgMessageId, adminMsgId — admin reply
// qilib javob yozadi). Ishlayotgan narsani ko'chirmaymiz; inbox ikkala
// manbadan yig'ib ko'rsatadi.
//
// Xabarlar alohida kolleksiyada (ChatMessage) — thread cheksiz o'sadi,
// ro'yxat esa har ochilganda o'qiladi. MentorChat/BotMessage bilan bir
// xil mantiq.

const ChatThreadSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },

  // cc = client <-> candidate   (kontakt ochilganda avtomatik ochiladi)
  // ca = client <-> agency      (mijoz kabinetida tepada qadalgan)
  kind: { type: String, required: true, enum: ['cc', 'ca'] },

  clientId:    { type: String, required: true },
  candidateId: { type: String, default: '' },      // 'ca' da bo'sh

  // Qaysi tanlovdan kelib chiqqan — nizoda kontekst uchun
  shortlistId: { type: String, default: '' },

  // open = inbox tepasida, archived = yakuniy qaror chiqqan, pastda turadi.
  // Yopilmaydi: nomzod keyin ham yoza oladi.
  state: { type: String, default: 'open', enum: ['open', 'archived'] },

  // Ro'yxatni chizish uchun — har safar xabarlarni o'qimaslik kerak
  lastMsgAt:   { type: Date,   default: Date.now },
  lastMsgText: { type: String, default: '' },
  lastMsgFrom: { type: String, default: '' },      // client | candidate | agency | system

  unreadClient:    { type: Number, default: 0 },
  unreadCandidate: { type: Number, default: 0 },
  unreadAgency:    { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChatThreadSchema.index({ agencyId: 1, id: 1 }, { unique: true });
// Inbox: mijozning suhbatlari, oxirgi xabar bo'yicha
ChatThreadSchema.index({ agencyId: 1, clientId: 1, lastMsgAt: -1 });
// Nomzod kabineti: nomzodning suhbatlari
ChatThreadSchema.index({ agencyId: 1, candidateId: 1, lastMsgAt: -1 });
// Bir mijoz va bir nomzod o'rtasida BITTA 'cc' suhbat bo'lsin — kontakt
// ikki marta ochilsa (yoki poyga bo'lsa) ikkinchi thread ochilmaydi
ChatThreadSchema.index(
  { agencyId: 1, clientId: 1, candidateId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: 'cc' } }
);

module.exports = mongoose.model('ChatThread', ChatThreadSchema);
