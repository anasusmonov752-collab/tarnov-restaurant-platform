const mongoose = require('mongoose');

// ── ARIZA ────────────────────────────────────────────────────
// Nomzod vakansiyaga o'zi ariza beradi. Bu qidiruvga QARAMA-QARSHI
// oqim: u yerda biz nomzodni topamiz, bu yerda nomzod bizni topadi.
//
// Lekin natija bir xil joyga quyiladi: mijoz arizachini ham anonim
// ko'radi, tanlaydi, siz tekshirasiz, kontakt ochiladi va kredit
// yechiladi. Alohida pul modeli yaratmadik — bitta oqim, ikki manba.
//
// Shuning uchun Application bosqichlari qisqa: u faqat "ariza tanlovga
// kirdimi yoki yo'qmi" ni kuzatadi. Undan keyingi hayot Shortlist'da.

const ApplicationSchema = new mongoose.Schema({
  id:          { type: String, required: true },
  agencyId:    { type: String, required: true },
  vacancyId:   { type: String, required: true },
  candidateId: { type: String, required: true },
  clientId:    { type: String, required: true },   // vakansiya egasi

  // new         - yangi, hali ko'rilmagan
  // seen        - mijoz ko'rdi
  // shortlisted - mijoz tanladi, Shortlist'ga o'tdi
  // rejected    - mijoz rad etdi
  state: { type: String, default: 'new' },
  isTest: { type: Boolean, default: false },   // sinov nomzodining arizasi — sanoqlarga kirmaydi

  // Nomzodning qisqa xati (ixtiyoriy)
  message: { type: String, default: '' },
  // Mijozning rad sababi
  reason:  { type: String, default: '' },

  shortlistId: { type: String, default: '' },      // tanlangach to'ladi

  // Botdagi dastlabki tekshiruv (services/prescreen) — HR qo'ng'irog'i o'rniga.
  // step: fit -> fitWhy? -> start -> commute -> voice -> done
  screen: {
    step:      { type: String, default: '' },
    fit:       { type: String, default: '' },     // ok | sal | no — shartlar mosmi
    fitWhy:    { type: String, default: '' },     // sal | far | shift | other
    start:     { type: String, default: '' },     // now | week | later | busy
    startPre:  { type: Boolean, default: false }, // anketadagi "qachondan" dan olingan — so'ralmaydi
    commute:   { type: String, default: '' },     // 30 | 60 | 90 | na (daqiqa)
    voiceFileId: { type: String, default: '' },   // Telegram file_id (shu bot uchun)
    voiceDur:  { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    remindedAt: { type: Date, default: null },
    doneAt:    { type: Date, default: null }
  },

  createdAt: { type: Date, default: Date.now },
  seenAt:    { type: Date, default: null },      // mijoz ko'rdi
  decidedAt: { type: Date, default: null },
  // Agentlik tomoni (panel "Arizalar"): nomzod "ko'rib chiqildi / HR bog'landi"ni
  // sana bilan ko'radi — services/appLife.stepsFor
  agencySeenAt: { type: Date, default: null },
  contactedAt:  { type: Date, default: null }
});

// Bitta nomzod bitta vakansiyaga bir marta ariza beradi
ApplicationSchema.index({ vacancyId: 1, candidateId: 1 }, { unique: true });
ApplicationSchema.index({ agencyId: 1, clientId: 1, state: 1, createdAt: -1 });
ApplicationSchema.index({ agencyId: 1, candidateId: 1, createdAt: -1 });

module.exports = mongoose.model('Application', ApplicationSchema);
