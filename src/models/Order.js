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
  provider:  { type: String, default: 'manual' },       // payme | click | uzum | manual | invoice
  status:    { type: String, default: 'pending' },      // pending | paid | canceled | refunded
  // Qisqa buyurtma raqami (8 raqam): Uzum ilovasida qo'lda yozish, bank
  // o'tkazmasida to'lov maqsadi, mijoz bilan gaplashganda
  code:      { type: String, default: '' },
  auto:      { type: Boolean, default: false },         // avto-yangilash (saqlangan karta) yaratgan

  // Hisob-faktura (yuridik shaxs, bank o'tkazmasi)
  invoiceCompany: { type: String, default: '' },
  invoiceInn:     { type: String, default: '' },        // STIR, 9 raqam

  // Payme
  paymeId:         { type: String, default: '' },
  paymeState:      { type: Number, default: 0 },
  paymeCreateTime: { type: Number, default: 0 },        // ms (Payme shunday kutadi)
  paymePerformTime:{ type: Number, default: 0 },
  paymeCancelTime: { type: Number, default: 0 },
  paymeReason:     { type: Number, default: null },
  paymeTime:       { type: Number, default: 0 },        // Payme'dagi yaratilish vaqti (GetStatement, timeout)
  paymeFiscal:     { type: Array, default: [] },        // SetFiscalData: [{type, receipt_id, qr_code_url, ...}]

  // Uzum Bank (Merchant API)
  uzumTransId:     { type: String, default: '' },
  uzumState:       { type: String, default: '' },        // CREATED | CONFIRMED | REVERSED | FAILED
  uzumCreateTime:  { type: Number, default: 0 },
  uzumConfirmTime: { type: Number, default: 0 },
  uzumReverseTime: { type: Number, default: 0 },

  // Payme Subscribe (saqlangan karta bilan avto-yangilash)
  receiptId:       { type: String, default: '' },

  // Click
  clickTransId:    { type: String, default: '' },
  clickPrepareAt:  { type: Date, default: null },
  clickPrepareId:  { type: Number, default: 0 },         // Click merchant_prepare_id (butun son)

  paidBy:     { type: String, default: '' },            // payme | click | admin
  createdAt:  { type: Date, default: Date.now },
  paidAt:     { type: Date, default: null },
  canceledAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null },
  // To'lovdan oldingi tarif — qaytarilsa tiklanadi (billing.refundOrder)
  prevPlan:   { type: Object, default: null }
});

OrderSchema.index({ id: 1 }, { unique: true });
OrderSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ paymeId: 1 }, { sparse: true });
OrderSchema.index({ uzumTransId: 1 }, { partialFilterExpression: { uzumTransId: { $gt: '' } } });
OrderSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $gt: '' } } });

module.exports = mongoose.model('Order', OrderSchema);
