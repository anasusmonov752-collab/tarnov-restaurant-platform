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

  // ── NOMZOD UCHUN TAVSIF (2026-10-22) ──
  // Ilgari 13 ta vakansiya "Ofitsiant · Toshkentda restoran" bo'lib bir-
  // biridan farq qilmasdi, kunlik maosh matn ichida yashirin edi — soxtaga
  // o'xshardi. Hammasi ixtiyoriy: eski vakansiyalar o'zgarishsiz ishlaydi.
  venue:        { type: String, default: '' },   // joy tavsifi NOMSIZ: "Uyg'ur oshxonasi restorani, 3 filial"
  landmark:     { type: String, default: '' },   // mo'ljal: "Bodomzor metrosi yonida"
  salaryPeriod: { type: String, default: 'month' }, // month | day | shift — salaryFrom/To nimaga
  payout:       { type: String, default: '' },   // daily | weekly | twice | monthly — qachon to'lanadi
  perks:        { type: [String], default: [] }, // th-i18n PERK_KEYS
  duties:       { type: [String], default: [] }, // vazifalar — qisqa bandlar
  requirements: { type: [String], default: [] }, // talablar — qisqa bandlar (minExp/yosh/tildan tashqari)
  hook:         { type: String, default: '' },   // bir qatorli jalb — e'londagi haqiqiy fakt
  // Agentlik ish beruvchiga qo'ng'iroq qilib o'rin ochiqligini tasdiqladi.
  // confirmedAt'dan farqi: u — "ro'yxatda tursin" taymeri, bu — ishonch belgisi.
  verifiedAt:   { type: Date, default: null },

  status: { type: String, default: 'open' },    // open | paused | closed
  // Sinov mijozining vakansiyasi — haqiqiy nomzodlarga ko'rinmaydi (pastdagi hook)
  isTest: { type: Boolean, default: false },

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

// Vakansiya uch joyda yaratiladi (panel, Mini App formasi, avtomatik) —
// "sinov mijozining vakansiyasi = sinov" qoidasi shu yerda, bir marta
VacancySchema.pre('validate', async function () {
  if (!this.isNew || !this.clientId || this.isTest) return;
  const Client = require('./Client');
  const c = await Client.findOne({ agencyId: this.agencyId, id: this.clientId }, 'isTest').lean();
  if (c && c.isTest) this.isTest = true;
});

module.exports = mongoose.model('Vacancy', VacancySchema);
