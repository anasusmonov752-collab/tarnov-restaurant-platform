const mongoose = require('mongoose');

// ── ANKETA TO'LDIRILISHI ─────────────────────────────────────
// Nomzod havolani bosgan zahoti yaratiladi (bot /start), har javobda
// yangilanadi. Nomzod (Candidate) faqat OXIRIDA, rozilik berilgach
// yasaladi — chala anketa bazani axlatga to'ldirmasin.
//
// step — oxirgi javob berilgan savol: qaysi savolda tashlab
// ketilayotganini shu ko'rsatadi (keyingi bosqich — statistika va eslatma).

const SurveyResponseSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  agencyId:  { type: String, required: true },
  surveyId:  { type: String, required: true },
  vacancyId: { type: String, default: '' },     // vakansiya havolasidan kelgan bo'lsa
  channel:   { type: String, default: '' },     // e'lon manbasi: ig, tg, olx, qr ...

  tgUserId:  { type: String, required: true },  // kim to'ldiryapti (initData bilan tekshiriladi)
  chatId:    { type: String, default: '' },
  lang:      { type: String, default: '' },     // anketa tili (uz | ru)

  answers:   { type: mongoose.Schema.Types.Mixed, default: {} },
  photo:     { type: String, default: '' },     // dataURL — answers'da emas, ro'yxatlar yengil bo'lsin

  // Telefon: "Raqamni ulashish" — Telegram bot'ga kontakt xabari yuboradi,
  // webhook uni SHU YERGA yozadi (contact.user_id === from.id). Mini App
  // qaytargan raqamga ishonmaymiz — u brauzer tomonida.
  phone:           { type: String, default: '' },
  phoneVerifiedAt: { type: Date, default: null },

  step:        { type: String, default: '' },
  status:      { type: String, default: 'started' },   // started | done
  candidateId: { type: String, default: '' },

  startedAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
});

SurveyResponseSchema.index({ agencyId: 1, id: 1 }, { unique: true });
SurveyResponseSchema.index({ id: 1 });
SurveyResponseSchema.index({ tgUserId: 1, status: 1, updatedAt: -1 });
SurveyResponseSchema.index({ agencyId: 1, surveyId: 1, status: 1 });

module.exports = mongoose.model('SurveyResponse', SurveyResponseSchema);
