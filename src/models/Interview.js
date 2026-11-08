const mongoose = require('mongoose');

// ── SUHBAT (restorandagi uchrashuv) ──────────────────────────
// Qoida YAGONA — services/interviews.js. Mijoz Mini App'da "Suhbatga
// chaqirish" ni bosadi: nomzodga botda bo'sh vaqtlar boradi, u o'zi
// tanlaydi, bir kun va 2 soat oldin eslatma oladi, suhbatdan keyin ikki
// tomondan "keldimi?" so'raladi. Kelmasa — kontakt krediti qaytadi.
//
// Tanlovdagi holat (Shortlist.items[].state = 'interview', interviewAt)
// ham yangilanadi — voronka, appLife va panel o'sha yerdan o'qiydi. Bu
// yozuv esa jarayonning o'zi: kim nima dedi, qaysi eslatma ketdi.
//
// status:
//   offered   — nomzodga vaqtlar yuborildi, hali tanlamagan
//   scheduled — vaqt belgilangan (nomzod tanladi yoki mijoz aniq vaqt berdi)
//   confirmed — nomzod eslatmada "Boraman" dedi
//   done      — keldi
//   declined  — nomzod "bormayman" dedi
//   expired   — nomzod vaqt tanlamadi (24 soat)
//   noshow    — kelmadi
//   conflict  — mijoz "kelmadi", nomzod "bordim" — agentlik hal qiladi
//   cancelled — mijoz bekor qildi yoki yangi taklif bilan almashtirildi
const InterviewSchema = new mongoose.Schema({
  id:          { type: String, required: true },     // qisqa (callback_data 64 bayt)
  agencyId:    { type: String, required: true },
  clientId:    { type: String, required: true },
  candidateId: { type: String, required: true },
  shortlistId: { type: String, required: true },
  vacancyId:   { type: String, default: '' },

  status:  { type: String, default: 'offered' },
  mode:    { type: String, default: 'pick' },        // pick — nomzod tanlaydi | fixed — mijoz aniq vaqt
  slots:   { type: [Date], default: [] },            // taklif qilingan vaqtlar
  at:      { type: Date, default: null },            // belgilangan vaqt
  address: { type: String, default: '' },

  offeredAt:   { type: Date, default: null },
  offerRemindAt: { type: Date, default: null },      // tanlamagan nomzodga bitta eslatma
  scheduledAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
  onWayAt:     { type: Date, default: null },
  declinedAt:  { type: Date, default: null },
  r24At:       { type: Date, default: null },        // bir kun oldingi eslatma ketdi
  r2At:        { type: Date, default: null },        // 2 soat oldingi eslatma ketdi
  warnAt:      { type: Date, default: null },        // mijozga "tasdiqlamadi" ogohlantirishi
  askedAt:     { type: Date, default: null },        // suhbatdan keyin "keldimi?" so'raldi
  reaskAt:     { type: Date, default: null },

  clientSaid: { type: String, default: '' },          // came | noshow
  candSaid:   { type: String, default: '' },          // went | missed
  refundedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

InterviewSchema.index({ id: 1 }, { unique: true });
InterviewSchema.index({ agencyId: 1, shortlistId: 1, candidateId: 1, createdAt: -1 });
InterviewSchema.index({ status: 1, at: 1 });
InterviewSchema.index({ clientId: 1, status: 1, at: 1 });

module.exports = mongoose.model('Interview', InterviewSchema);
