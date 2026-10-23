// ── CLICK SHOP API ───────────────────────────────────────────
// Click ikki marta chaqiradi (routes/payments): Prepare (action=0) — buyurtma
// bormi, summa to'g'rimi; Complete (action=1) — to'lov o'tdi (error=0) yoki
// bekor (error<0). Imzo: md5(click_trans_id + service_id + SECRET_KEY +
// merchant_trans_id [+ merchant_prepare_id] + amount + action + sign_time).
// merchant_trans_id — bizning buyurtma id'si (to'lov havolasida transaction_param).

const crypto = require('crypto');
const Order = require('../models/Order');
const billing = require('./billing');

const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const E = {
  ok:       [0, 'Success'],
  sign:     [-1, 'SIGN CHECK FAILED'],
  amount:   [-2, 'Incorrect parameter amount'],
  action:   [-3, 'Action not found'],
  paid:     [-4, 'Already paid'],
  noOrder:  [-5, 'Order does not exist'],
  noTx:     [-6, 'Transaction does not exist'],
  canceled: [-9, 'Transaction cancelled']
};

function signOk(p) {
  const key = process.env.CLICK_SECRET_KEY || '';
  if (!key || String(p.service_id) !== String(process.env.CLICK_SERVICE_ID || '')) return false;
  const mid = Number(p.action) === 1 ? String(p.merchant_prepare_id || '') : '';
  const want = md5(`${p.click_trans_id}${p.service_id}${key}${p.merchant_trans_id}${mid}${p.amount}${p.action}${p.sign_time}`);
  const got = String(p.sign_string || '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const reply = (p, key, extra) => Object.assign({
  click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id,
  error: E[key][0], error_note: E[key][1]
}, extra || {});

async function prepare(p) {
  if (!signOk(p)) return reply(p, 'sign');
  if (Number(p.action) !== 0) return reply(p, 'action');
  const o = await Order.findOne({ id: String(p.merchant_trans_id || '') });
  if (!o) return reply(p, 'noOrder');
  if (o.status === 'paid') return reply(p, 'paid');
  if (o.status === 'canceled') return reply(p, 'canceled');
  if (Number(p.amount) !== o.amount) return reply(p, 'amount');
  const prepareId = o.clickPrepareId || (Date.now() % 2e9);
  Object.assign(o, { provider: 'click', clickTransId: String(p.click_trans_id), clickPrepareAt: new Date(), clickPrepareId: prepareId });
  await o.save();
  return reply(p, 'ok', { merchant_prepare_id: prepareId });
}

async function complete(p) {
  if (!signOk(p)) return reply(p, 'sign');
  if (Number(p.action) !== 1) return reply(p, 'action');
  const o = await Order.findOne({ id: String(p.merchant_trans_id || '') });
  if (!o) return reply(p, 'noOrder');
  if (!o.clickPrepareId || Number(p.merchant_prepare_id) !== o.clickPrepareId) return reply(p, 'noTx');
  if (o.status === 'paid') return reply(p, 'paid', { merchant_confirm_id: o.clickPrepareId });
  if (o.status === 'canceled') return reply(p, 'canceled');
  if (Number(p.amount) !== o.amount) return reply(p, 'amount');
  // Click tomonda to'lov o'tmadi — buyurtma bekor
  if (Number(p.error) < 0) {
    await Order.updateOne({ id: o.id, status: 'pending' }, { $set: { status: 'canceled', canceledAt: new Date() } });
    return reply(p, 'canceled');
  }
  await billing.activate(o.id, { by: 'click' });
  return reply(p, 'ok', { merchant_confirm_id: o.clickPrepareId });
}

module.exports = { prepare, complete, signOk, md5 };
