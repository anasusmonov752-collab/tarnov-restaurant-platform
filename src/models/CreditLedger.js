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

module.exports = mongoose.model('CreditLedger', CreditLedgerSchema);
