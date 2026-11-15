const mongoose = require('mongoose');

// ── NOMZOD YO'LI: hodisalar jurnali (services/track) ─────────
// Faqat qo'shiladi, o'zgartirilmaydi. Analitika shundan yig'iladi:
// botga kirdi -> lavozim tanladi -> anketani ochdi -> tugatdi -> ariza.
// Anketa ichida qaysi savolda to'xtagani — SurveyResponse.step dan
// (u allaqachon har javobda yoziladi, bu yerda takrorlanmaydi).
const EventSchema = new mongoose.Schema({
  agencyId:    { type: String, required: true },
  tgUserId:    { type: String, required: true },   // odamni Telegram bo'yicha taniymiz (anketasiz ham)
  kind:        { type: String, required: true },   // track.KINDS
  ref:         { type: String, default: '' },      // lavozim | vakansiya id
  channel:     { type: String, default: '' },      // qayerdan kelgan (survey.CHANNELS)
  name:        { type: String, default: '' },      // Telegram ismi — panelda "kim"
  rid:         { type: String, default: '' },      // SurveyResponse id
  candidateId: { type: String, default: '' },
  isTest:      { type: Boolean, default: false },  // admin test rejimi — analitikaga kirmaydi
  at:          { type: Date, default: Date.now }
}, { versionKey: false });

EventSchema.index({ agencyId: 1, at: -1 });
EventSchema.index({ agencyId: 1, tgUserId: 1, at: -1 });
EventSchema.index({ agencyId: 1, kind: 1, ref: 1, at: -1 });
// 180 kundan eski hodisalar o'zi o'chadi — jurnal cheksiz o'smasin
EventSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 86400 });

module.exports = mongoose.model('Event', EventSchema);
