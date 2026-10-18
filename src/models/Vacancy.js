const mongoose = require('mongoose');

// ── VAKANSIYA ────────────────────────────────────────────────
// Ikkala kabinetning markazi: mijoz shu yerda nima kerakligini yozadi,
// nomzod shu ro'yxatdan ko'radi va ariza beradi.
//
// Ikki qismga bo'lingan — bu ataylab:
//   TALAB   — kimni qidiramiz. Qidiruv filtri shundan quriladi.
//   TAKLIF  — nima beramiz. Qo'ng'iroqda aytiladi, nomzod shuni o'qiydi.
//
// Avval ikkisi aralash edi va qo'ng'iroq paytida "qancha maosh?" degan
// savolga javob topib bo'lmasdi.

const VacancySchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },
  clientId: { type: String, required: true },

  title: { type: String, required: true, trim: true },   // "Ofitsiant, kechki smena"
  role:  { type: String, default: 'boshqa' },            // ROLE_KEYS dan

  // ── TALAB ──
  minExp:    { type: Number, default: null },   // yil
  minAge:    { type: Number, default: null },
  maxAge:    { type: Number, default: null },
  languages: { type: [String], default: [] },
  shift:     { type: String, default: '' },     // kunduzgi | kechki | ikkalasi
  location:  { type: String, default: '' },     // tuman; bo'sh bo'lsa mijoznikidan olinadi

  // ── TAKLIF ──
  salaryFrom: { type: Number, default: null },
  salaryTo:   { type: Number, default: null },
  schedule:   { type: String, default: '' },    // "6/1, 10:00-22:00"
  conditions: { type: String, default: '' },    // ovqat, forma, yo'l kira
  startDate:  { type: Date,   default: null },  // qachon kerak
  headcount:  { type: Number, default: 1 },     // nechta odam

  notes: { type: String, default: '' },

  status: { type: String, default: 'open' },    // open | paused | closed

  // Qayerdan paydo bo'lgan: manual = mijoz/agentlik qo'lda yozgan,
  // search = bot qidiruvidan tanlov qilinganda o'zi yaratilgan
  // (services/vacancyAuto.js). search'da sarlavha shablondan yasaladi.
  source: { type: String, default: 'manual' },

  // Nomzodlarning ochiq ro'yxatida ko'rinadimi. Avtomatik vakansiya
  // yopiq tug'iladi — mijoz e'lon qilmoqchi bo'lmagan, faqat qidirgan.
  // Eski hujjatlarda maydon yo'q: so'rovlarda { $ne: false } ishlatiladi.
  listed: { type: Boolean, default: true },

  // Soxta e'lon muammosining yechimi: mijoz vakansiyani muntazam
  // tasdiqlab turadi. Tasdiqlanmasa nomzodlarga ko'rsatilmaydi —
  // "2 kun oldin tasdiqlangan" degan belgi ishonch beradi.
  confirmedAt: { type: Date, default: Date.now },

  // Yangi mos nomzod chiqsa mijozga xabar berilsinmi
  autoNotify: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt:  { type: Date, default: null }
});

VacancySchema.index({ agencyId: 1, id: 1 }, { unique: true });
VacancySchema.index({ agencyId: 1, clientId: 1, createdAt: -1 });
// Nomzodga ko'rsatiladigan ro'yxat uchun
VacancySchema.index({ agencyId: 1, status: 1, role: 1, confirmedAt: -1 });

module.exports = mongoose.model('Vacancy', VacancySchema);
