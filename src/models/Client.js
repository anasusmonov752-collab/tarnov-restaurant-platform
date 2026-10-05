const mongoose = require('mongoose');

// ── MIJOZ RESTORAN ───────────────────────────────────────────
// Nomzod bazasini SOTIB OLUVCHI tomon. Bu RestoOne'dagi `Restaurant`
// emas: mijozda menyu, xodim, o'quv moduli yo'q — u faqat nomzod
// qidiradi va kontakt sotib oladi.
//
// Ishlash joyi: faqat Telegram (bot + Mini App). Veb paneli yo'q,
// parol yo'q — bog'lanish bir martalik havola orqali.

const ClientSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },   // kimning bazasidan foydalanadi

  name:        { type: String, required: true, trim: true },  // "Chaykhana Navruz"
  contactName: { type: String, default: '' },                 // menejer ismi
  phone:       { type: String, default: '' },
  note:        { type: String, default: '' },

  // ── Telegram ──
  tgChatId:    { type: String, default: '' },
  tgUsername:  { type: String, default: '' },
  tgLinkToken: { type: String, default: '' },   // bir martalik, bosilgach kuyadi

  // pending — botga yozsa ham HECH NARSA ko'rsatilmaydi.
  // Botga istalgan odam kira oladi; tasdiqlamasak raqobatchi bazani ko'radi.
  status: { type: String, default: 'pending' }, // pending | active | blocked

  // Kontakt krediti. Haqiqiy manba — CreditLedger; bu tezlik uchun nusxa.
  credits: { type: Number, default: 0 },

  createdAt:  { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: null }
});

ClientSchema.index({ agencyId: 1, createdAt: -1 });
ClientSchema.index({ agencyId: 1, id: 1 }, { unique: true });
ClientSchema.index({ tgChatId: 1 }, { sparse: true });
ClientSchema.index({ tgLinkToken: 1 }, { sparse: true });

module.exports = mongoose.model('Client', ClientSchema);
