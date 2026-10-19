const mongoose = require('mongoose');

// ── ANKETA ───────────────────────────────────────────────────
// Nomzod e'lon havolasidan kirib to'ldiradigan savollar ro'yxati.
// Savollar BAZADA (koddagi shablon faqat boshlang'ich nusxa —
// services/survey.js TEMPLATE): keyin panel konstruktori shu hujjatni
// tahrirlaydi, kod o'zgarmaydi.
//
// Har savol nomzod maydoniga bog'lanadi (field): javob kartaga
// SHABLON bo'yicha tushadi, AI talqin qilmaydi.

const OptionSchema = new mongoose.Schema({
  key: { type: String, required: true },   // bazaga yoziladigan qiymat
  uz:  { type: String, default: '' },
  ru:  { type: String, default: '' }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  id:       { type: String, required: true },   // 'fullName', 'shift' ...
  // text | longtext | date | choice | contact | photo | consent
  type:     { type: String, required: true },
  required: { type: Boolean, default: true },
  text:     { uz: { type: String, default: '' }, ru: { type: String, default: '' } },
  hint:     { uz: { type: String, default: '' }, ru: { type: String, default: '' } },
  options:  { type: [OptionSchema], default: [] }
}, { _id: false });

const SurveySchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },
  // Havoladagi qisqa kod (t.me/<bot>?start=a_<code>_<kanal>). Faqat
  // A-Z va 2-9: Telegram payload'i [A-Za-z0-9_-], '_' esa ajratuvchi.
  code:     { type: String, required: true },
  title:    { uz: { type: String, default: '' }, ru: { type: String, default: '' } },
  // '' — lavozimni nomzod o'zi tanlaydi; aks holda shu lavozim uchun
  // (vakansiya havolasida lavozim vakansiyadan olinadi)
  role:     { type: String, default: '' },
  questions:{ type: [QuestionSchema], default: [] },
  active:   { type: Boolean, default: true },
  isDefault:{ type: Boolean, default: false },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now }
});

SurveySchema.index({ agencyId: 1, id: 1 }, { unique: true });
SurveySchema.index({ code: 1 }, { unique: true });
// Agentlikda BITTA umumiy anketa: panelda bir vaqtda ikki so'rov kelsa
// (ikki "Anketa" tugmasi) ensureDefault ikkinchisini yarata olmasin
SurveySchema.index({ agencyId: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

module.exports = mongoose.model('Survey', SurveySchema);
