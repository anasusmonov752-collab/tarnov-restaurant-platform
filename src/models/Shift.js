const mongoose = require('mongoose');

// ── SMENA BOZORI (services/shifts) ───────────────────────────
// Restoranga BIR MARTALIK smena uchun odam kerak (bayram, kasal xodim,
// banket). Mijoz Mini App'da smena e'lon qiladi -> mos nomzodlarga bot
// "✅ Olaman" tugmasi bilan yuboradi -> birinchi bosganlar band qiladi
// (atomik, slots dan oshmaydi) -> mijozga xodim ismi va telefoni.
// 2 soat oldin eslatma, smenadan keyin mijoz "keldi / kelmadi" belgilaydi —
// bu nomzodning ishonchlilik tarixiga kiradi (services/reliability).
// Beta: kredit yechilmaydi.

const BookingSchema = new mongoose.Schema({
  candidateId: { type: String, required: true },
  at:          { type: Date, default: Date.now },
  state:       { type: String, default: 'booked' },   // booked | came | noshow
  remindedAt:  { type: Date, default: null }
}, { _id: false });

const ShiftSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  agencyId: { type: String, required: true },
  clientId: { type: String, required: true },
  role:     { type: String, required: true },
  startAt:  { type: Date, required: true },
  endAt:    { type: Date, required: true },
  pay:      { type: Number, default: 0 },            // so'm, butun smena uchun
  slots:    { type: Number, default: 1 },            // nechta odam
  address:  { type: String, default: '' },
  note:     { type: String, default: '' },
  booked:   { type: [BookingSchema], default: [] },
  bookedN:  { type: Number, default: 0 },            // atomik band qilish uchun hisoblagich
  status:   { type: String, default: 'open' },       // open | full | cancelled | done
  sentN:    { type: Number, default: 0 },            // nechta nomzodga yuborildi
  askedAt:  { type: Date, default: null },           // smenadan keyin mijozdan so'raldi
  isTest:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

ShiftSchema.index({ agencyId: 1, clientId: 1, startAt: -1 });
ShiftSchema.index({ status: 1, startAt: 1 });

module.exports = mongoose.model('Shift', ShiftSchema);
