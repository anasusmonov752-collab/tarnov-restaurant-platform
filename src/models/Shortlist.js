const mongoose = require('mongoose');

// ── TANLOV (mijoz tanlagan nomzodlar) ────────────────────────
// Mijoz Mini App'da bir nechta nomzodni belgilab yuboradi — shu bitta
// yozuv bo'lib tushadi. Bir necha mijoz bilan ishlaganda "kim nimani
// tanlagan, qaysi bosqichda" esda qolmaydi, shuning uchun alohida
// kuzatiladi.

const ItemSchema = new mongoose.Schema({
  candidateId: { type: String, required: true },

  // Bosqichlar va sabablar ro'yxati — src/data/pipeline.js
  state: { type: String, default: 'selected' },

  // Rad sababi (candidate_no yoki not_fit holatida). Erkin matn emas,
  // ro'yxatdan: faqat shunda "6 tasi maosh sababli rad etdi" deb
  // sanab bo'ladi va mijozga aniq maslahat beriladi.
  reason: { type: String, default: '' },

  interviewAt: { type: Date, default: null },   // restorandagi suhbat
  decidedAt:   { type: Date, default: null },   // ishga olindi / mos kelmadi
  revealedAt:  { type: Date, default: null },
  refundedAt:  { type: Date, default: null },
  note:        { type: String, default: '' }
}, { _id: false });

const ShortlistSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  agencyId:  { type: String, required: true },
  clientId:  { type: String, required: true },
  vacancyId: { type: String, default: '' },

  // Qidiruv matni ("xostes, ingliz tili bilan"). SearchSession 24 soatda
  // o'chadi, shuning uchun bu yerga KO'CHIRIB olamiz — aks holda mijoz
  // kabinetida "bu qaysi qidiruv edi?" degan savol javobsiz qoladi.
  summary: { type: String, default: '' },

  // Mijoz nima taklif qilyapti (maosh, smena, qachon kerak). Tanlovdan
  // KEYIN so'raladi — filtr uchun emas, nomzodga qo'ng'iroq qilganda
  // nima sotayotganingizni bilish uchun.
  offer: { type: String, default: '' },

  items:  { type: [ItemSchema], default: [] },
  status: { type: String, default: 'new' },     // new | in_progress | done

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ShortlistSchema.index({ agencyId: 1, createdAt: -1 });
ShortlistSchema.index({ agencyId: 1, clientId: 1, createdAt: -1 });
ShortlistSchema.index({ agencyId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Shortlist', ShortlistSchema);
