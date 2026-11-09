const mongoose = require('mongoose');

// ── ISHGA JOYLASHTIRISH (ishga olingandan keyin) ─────────────
// Qoida YAGONA — services/placements.js. Tanlov elementi 'hired' bo'lganda
// yaratiladi (shortlist.setClientState). 1-, 7- va 30-kunda ikki tomondan
// "ishlayaptimi?" so'raladi; 30 kun ichida ketsa — almashtirish (kafolat).
// Bu yozuvdan nomzodning ishonchlilik tarixi ham olinadi (services/reliability).
//
// status: active — ishlayapti | done — 30 kundan o'tdi | left — ketdi
const PlacementSchema = new mongoose.Schema({
  id:          { type: String, required: true },     // qisqa (callback_data)
  agencyId:    { type: String, required: true },
  clientId:    { type: String, required: true },
  candidateId: { type: String, required: true },
  shortlistId: { type: String, required: true },
  vacancyId:   { type: String, default: '' },
  hiredAt:     { type: Date, required: true },

  status:  { type: String, default: 'active' },
  d1At:    { type: Date, default: null },            // so'rov yuborilgan payt
  d7At:    { type: Date, default: null },
  d30At:   { type: Date, default: null },
  clientOk:  { type: Date, default: null },          // mijoz oxirgi "ishlayapti" degan payt
  candOk:    { type: Date, default: null },
  problemAt: { type: Date, default: null },          // nomzod "muammo bor" — agentlik qo'ng'iroq qiladi
  leftAt:    { type: Date, default: null },
  leftBy:    { type: String, default: '' },          // client | candidate
  replacedAt: { type: Date, default: null },         // kafolat ishga tushdi (vakansiya qayta ochildi, +1 kredit)

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

PlacementSchema.index({ id: 1 }, { unique: true });
PlacementSchema.index({ agencyId: 1, shortlistId: 1, candidateId: 1 }, { unique: true });
PlacementSchema.index({ status: 1, hiredAt: 1 });
PlacementSchema.index({ agencyId: 1, candidateId: 1 });

module.exports = mongoose.model('Placement', PlacementSchema);
