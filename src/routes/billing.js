// ── TO'LOVLAR (agentlik paneli) ──────────────────────────────
// Buyurtmalar ro'yxati, qo'lda tasdiqlash ("To'landi" — naqd, karta o'tkazma,
// hisob-faktura) va bekor qilish. Tasdiqlash billing.activate — Payme/Click
// bilan bir xil yo'l.

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const Order = require('../models/Order');
const Client = require('../models/Client');
const billing = require('../services/billing');
const PL = require('../data/plans');
const cardPay = require('../services/cardPay');

const router = express.Router();
const guard = require('../middleware/agency').agencyAuth;

router.get('/orders', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const q = { agencyId };
  if (['pending', 'paid', 'canceled', 'refunded'].includes(req.query.status)) q.status = req.query.status;
  const rows = await Order.find(q).sort({ createdAt: -1 }).limit(200).lean();
  const cl = await Client.find({ agencyId, id: { $in: [...new Set(rows.map(r => r.clientId))] } }, 'id name credits plan isTest').lean();
  const by = Object.fromEntries(cl.map(c => [c.id, c]));
  res.json({
    plans: PL.PLANS,
    providers: billing.providers(),
    subscribe: require('../services/paymeSubscribe').enabled(),
    orders: rows.map(o => ({
      id: o.id, code: o.code, auto: !!o.auto, invoiceCompany: o.invoiceCompany, invoiceInn: o.invoiceInn,
      cardTo: o.cardTo, claimedAt: o.claimedAt, payer: o.payer, rejectedAt: o.rejectedAt, rejects: o.rejects || 0,
      planKey: o.planKey, amount: o.amount, provider: o.provider, status: o.status,
      paidBy: o.paidBy, createdAt: o.createdAt, paidAt: o.paidAt, canceledAt: o.canceledAt,
      client: by[o.clientId] ? { id: o.clientId, name: by[o.clientId].name, credits: by[o.clientId].credits,
        isTest: !!by[o.clientId].isTest, plan: billing.planView(by[o.clientId]) } : { id: o.clientId, name: '—' }
    }))
  });
}));

const own = async (req, res) => {
  const o = await Order.findOne({ agencyId: req.user.restaurantId, id: req.params.id }).lean();
  if (!o) { res.status(404).json({ error: 'Buyurtma topilmadi' }); return null; }
  return o;
};

router.post('/orders/:id/paid', guard, asyncHandler(async (req, res) => {
  if (!(await own(req, res))) return;
  try { const r = await billing.activate(req.params.id, { by: 'admin' }); res.json({ ok: true, already: r.already, balance: r.balance }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));

// Kartaga o'tkazma: mijoz "To'ladim" degan, lekin pul tushmagan
router.post('/orders/:id/reject', guard, asyncHandler(async (req, res) => {
  if (!(await own(req, res))) return;
  try { await cardPay.reject(req.user.restaurantId, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));

// ── To'lov kartasi rekvizitlari (kartaga o'tkazma) ──
router.get('/card', guard, asyncHandler(async (req, res) => {
  const c = await cardPay.getCard(req.user.restaurantId);
  res.json(c ? Object.assign({}, c, { luhn: cardPay.luhnOk(c.number) }) : null);
}));
router.put('/card', guard, asyncHandler(async (req, res) => {
  try { res.json(await cardPay.setCard(req.user.restaurantId, req.body || {}, req.user.email || req.user.name || 'panel')); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));
router.delete('/card', guard, asyncHandler(async (req, res) => {
  await cardPay.removeCard(req.user.restaurantId, req.user.email || req.user.name || 'panel');
  res.json({ ok: true });
}));

router.post('/orders/:id/cancel', guard, asyncHandler(async (req, res) => {
  if (!(await own(req, res))) return;
  try { await billing.cancelOrder(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));

module.exports = router;
