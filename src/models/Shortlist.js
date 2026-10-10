const mongoose = require('mongoose');

// ── TANLOV (mijoz tanlagan nomzodlar) ────────────────────────
// Mijoz Mini App'da bir nechta nomzodni belgilab yuboradi — shu bitta
// yozuv bo'lib tushadi. Bir necha mijoz bilan ishlaganda "kim nimani
// tanlagan, qaysi bosqichda" esda qolmaydi, shuning uchun alohida
// kuzatiladi.

const ItemSchema = new mongoose.Schema({
  candidateId: { type: String, required: true },

  // selected      - mijoz tanladi, siz hali ko'rmadingiz
  // contacting    - nomzod bilan bog'lanyapsiz
  // candidate_ok  - nomzod rozi, kontakt ochishga tayyor
  // candidate_no  - nomzod yo'q dedi / topilmadi (kredit yechilmaydi)
  // revealed      - kontakt mijozga ochildi (-1 kredit)
  // refunded      - ochilgan, lekin javob bermadi (+1 kredit qaytdi)
  state: { type: String, default: 'selected' },

  revealedAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null },
  note:       { type: String, default: '' }
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

  items:  { type: [ItemSchema], default: [] },
  status: { type: String, default: 'new' },     // new | in_progress | done

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ShortlistSchema.index({ agencyId: 1, createdAt: -1 });
ShortlistSchema.index({ agencyId: 1, clientId: 1, createdAt: -1 });
ShortlistSchema.index({ agencyId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Shortlist', ShortlistSchema);
