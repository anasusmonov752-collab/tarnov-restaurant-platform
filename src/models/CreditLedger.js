const mongoose = require('mongoose');

// ── KREDIT JURNALI ───────────────────────────────────────────
// Faqat QO'SHILADIGAN jurnal — yozuv o'chirilmaydi va tahrirlanmaydi.
// Sabab: pul masalasi. "Nega 3 ta kredit yechilgan?" degan savolga
// aniq javob bo'lishi kerak. Client.credits — shu jurnalning yig'indisi,
// tezlik uchun saqlanadigan nusxa.

const CreditLedgerSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  agencyId: { type: String, required: true },
  clientId: { type: String, required: true },

  delta:  { type: Number, required: true },   // +10 paket | -1 ochildi | +1 qaytdi
  reason: { type: String, required: true },   // purchase | reveal | refund | bonus

  // Qaysi hodisaga bog'liq (reveal/refund uchun)
  shortlistId: { type: String, default: '' },
  candidateId: { type: String, default: '' },

  balanceAfter: { type: Number, default: 0 }, // yechilgandan keyingi qoldiq
  note:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

CreditLedgerSchema.index({ agencyId: 1, clientId: 1, createdAt: -1 });
// Bitta tanlov elementi uchun bitta yechish va bitta qaytarish — kod
// xato qilsa ham baza ikkinchisini qabul qilmaydi (credits.move
// tranzaksiyasi balansni ham qaytaradi)
CreditLedgerSchema.index({ agencyId: 1, shortlistId: 1, candidateId: 1 },
  { unique: true, partialFilterExpression: { reason: 'reveal' }, name: 'one_reveal_per_item' });
CreditLedgerSchema.index({ agencyId: 1, shortlistId: 1, candidateId: 1 },
  { unique: true, partialFilterExpression: { reason: 'refund', shortlistId: { $gt: '' } }, name: 'one_refund_per_item' });

module.exports = mongoose.model('CreditLedger', CreditLedgerSchema);
