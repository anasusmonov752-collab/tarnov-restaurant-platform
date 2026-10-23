// ── CLICK SHOP API ───────────────────────────────────────────
// docs.click.uz/shop-api — Click ikki marta chaqiradi (routes/payments,
// x-www-form-urlencoded): Prepare (action=0) — buyurtma bormi, summa
// to'g'rimi; Complete (action=1) — to'lov o'tdi (error=0) yoki bekor (error<0
// -> biz bekor qilib -9 qaytaramiz). Imzo: md5(click_trans_id + service_id +
// SECRET_KEY + merchant_trans_id [+ merchant_prepare_id] + amount + action +
// sign_time) — Click yuborgan XOM satrlar bilan (amount qayta formatlanmaydi).
// merchant_trans_id — bizning buyurtma id'si (to'lov havolasida transaction_param).
// Tekshirish tartibi rasmiy kutubxonadagidek (click-integration-php).

const crypto = require('crypto');
const Order = require('../models/Order');
const billing = require('./billing');

const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const E = {
  ok:       [0, 'Success'],
  sign:     [-1, 'SIGN CHECK FAILED!'],
  amount:   [-2, 'Incorrect parameter amount'],
  action:   [-3, 'Action not found'],
  paid:     [-4, 'Already paid'],
  noOrder:  [-5, 'User does not exist'],
  noTx:     [-6, 'Transaction does not exist'],
  update:   [-7, 'Failed to update user'],
  request:  [-8, 'Error in request from click'],
  canceled: [-9, 'Transaction cancelled']
};
const REQUIRED = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string'];

function signOk(p) {
  const key = process.env.CLICK_SECRET_KEY || '';
  if (!key || String(p.service_id) !== String(process.env.CLICK_SERVICE_ID || '')) return false;
  const mid = Number(p.action) === 1 ? String(p.merchant_prepare_id || '') : '';
  const want = md5(`${p.click_trans_id}${p.service_id}${key}${p.merchant_trans_id}${mid}${p.amount}${p.action}${p.sign_time}`);
  const got = String(p.sign_string || '').toLowerCase();
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const reply = (p, key, o) => Object.assign({
  click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id,
  error: E[key][0], error_note: E[key][1]
}, o && o.clickPrepareId ? { merchant_prepare_id: o.clickPrepareId, merchant_confirm_id: o.clickPrepareId } : {});

const amountOk = (p, o) => Math.abs(Number(p.amount) - o.amount) <= 0.01;

// Umumiy tekshiruvlar (ikkala bosqich): -8, -1, -3, -5, [-6], -4, -2, -9
async function check(p, action) {
  const need = action === 1 ? REQUIRED.concat('merchant_prepare_id') : REQUIRED;
  if (need.some(k => p[k] == null || p[k] === '')) return { r: reply(p, 'request') };
  if (!signOk(p)) return { r: reply(p, 'sign') };
  if (Number(p.action) !== action) return { r: reply(p, 'action') };
  const o = await Order.findOne({ id: String(p.merchant_trans_id) });
  if (!o) return { r: reply(p, 'noOrder') };
  if (action === 1 && (!o.clickPrepareId || Number(p.merchant_prepare_id) !== o.clickPrepareId)) return { r: reply(p, 'noTx') };
  if (o.status === 'paid' || o.status === 'refunded') return { r: reply(p, 'paid', o) };
  if (!amountOk(p, o)) return { r: reply(p, 'amount') };
  if (o.status === 'canceled') return { r: reply(p, 'canceled', o) };
  return { o };
}

async function prepare(p) {
  const { r, o } = await check(p, 0);
  if (r) return r;
  if (!o.clickPrepareId) {
    Object.assign(o, { provider: 'click', clickTransId: String(p.click_trans_id), clickPrepareAt: new Date(),
      clickPrepareId: Date.now() % 2e9 });
    await o.save();
  }
  return reply(p, 'ok', o);
}

async function complete(p) {
  const { r, o } = await check(p, 1);
  if (r) return r;
  // Click tomonda to'lov o'tmadi — buyurtma bekor
  if (Number(p.error) < 0) {
    await Order.updateOne({ id: o.id, status: 'pending' }, { $set: { status: 'canceled', canceledAt: new Date() } });
    return reply(p, 'canceled', o);
  }
  try {
    await billing.activate(o.id, { by: 'click' });
  } catch (e) {
    console.error('[CLICK] activate:', e.message);
    return reply(p, 'update', o);
  }
  return reply(p, 'ok', o);
}

module.exports = { prepare, complete, signOk, md5 };
