// ── TARIF BUYURTMASI (to'lov) ────────────────────────────────
// Mijoz tarif tanlaydi -> buyurtma (pending) -> to'lov tizimi (Payme/Click)
// yoki qo'lda (agentlik tasdiqlaydi) -> paid: tarif faollashadi (billing.activate).
// Payme holatlari Merchant API bo'yicha: 1 yaratildi, 2 bajarildi,
// -1 bajarilmasdan bekor, -2 bajarilgandan keyin bekor.
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  agencyId:  { type: String, required: true },
  clientId:  { type: String, required: true },
  planKey:   { type: String, required: true },
  amount:    { type: Number, required: true },          // so'm
  provider:  { type: String, default: 'manual' },       // payme | click | manual
  status:    { type: String, default: 'pending' },      // pending | paid | canceled

  // Payme
  paymeId:         { type: String, default: '' },
  paymeState:      { type: Number, default: 0 },
  paymeCreateTime: { type: Number, default: 0 },        // ms (Payme shunday kutadi)
  paymePerformTime:{ type: Number, default: 0 },
  paymeCancelTime: { type: Number, default: 0 },
  paymeReason:     { type: Number, default: null },

  // Click
  clickTransId:    { type: String, default: '' },
  clickPrepareAt:  { type: Date, default: null },
  clickPrepareId:  { type: Number, default: 0 },         // Click merchant_prepare_id (butun son)

  paidBy:     { type: String, default: '' },            // payme | click | admin
  createdAt:  { type: Date, default: Date.now },
  paidAt:     { type: Date, default: null },
  canceledAt: { type: Date, default: null }
});

OrderSchema.index({ id: 1 }, { unique: true });
OrderSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ paymeId: 1 }, { sparse: true });

module.exports = mongoose.model('Order', OrderSchema);
