const mongoose = require('mongoose');

// ── QIDIRUV SEANSI ───────────────────────────────────────────
// Mijoz botda qidiradi -> natija shu yerda saqlanadi -> Mini App
// kalit bo'yicha o'shani ochadi.
//
// Nega saqlaymiz, qayta qidirmaymiz: bot "12 ta topildi" deb aytdi,
// Mini App ochilganda 11 ta bo'lib qolsa (nomzod holati o'zgardi)
// mijoz chalkashadi. Ko'rsatilgan narsa o'zgarmasin.
//
// Seans bir kundan keyin o'zi o'chadi — doimiy saqlashning hojati yo'q.

const SearchSessionSchema = new mongoose.Schema({
  key:      { type: String, required: true },   // Mini App havolasidagi ?s=
  agencyId: { type: String, required: true },
  clientId: { type: String, required: true },

  criteria:     { type: Object, default: {} },  // AI ajratgan kriteriyalar
  summary:      { type: String, default: '' },
  candidateIds: { type: [String], default: [] },

  createdAt: { type: Date, default: Date.now }
});

SearchSessionSchema.index({ key: 1 }, { unique: true });
// 24 soatdan keyin Mongo o'zi o'chiradi
SearchSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('SearchSession', SearchSessionSchema);
