// ── UZUM BANK MERCHANT API (vebhuklar) ───────────────────────
// developer.uzumbank.uz/merchant — mijoz Uzum Bank ilovasida to'laydi, Uzum
// bizning 5 ta vebhukimizni chaqiradi (routes/payments POST /api/pay/uzum/<op>):
// check -> create -> (pul yechiladi) -> confirm; reverse (bekor), status
// (confirm javobi yetmasa — 10 martagacha). Kirish: Basic base64(login:parol)
// — Uzum beradi (UZUM_LOGIN, UZUM_PASSWORD), xizmat — UZUM_SERVICE_ID.
// Summa tiyinda, vaqt ms. Xato — HTTP 400 va errorCode (satr).
// Buyurtma params.order_id yoki params.account ichida keladi: to'liq id yoki
// qisqa raqam (Order.code — mijoz ilovada qo'lda ham yoza oladi).
// confirm'da summa kelmaydi — create'dagisi saqlanadi. 30 daqiqada confirm
// kelmasa tranzaksiya FAILED (Uzum talabi).

const crypto = require('crypto');
const Order = require('../models/Order');
const billing = require('./billing');

const CONFIRM_WINDOW = 30 * 60e3;
const ERR = {
  auth: '10001', json: '10002', params: '10005', service: '10006', noOrder: '10007',
  paid: '10008', canceled: '10009', exists: '10010', amount: '10011',
  noTx: '10014', txCanceled: '10015', confirmed: '10016', noReverse: '10017', reversed: '10018', system: '99999'
};

function authOk(header) {
  const { UZUM_LOGIN: l, UZUM_PASSWORD: p } = process.env;
  if (!l || !p) return false;
  const want = 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64');
  const got = String(header || '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const serviceOk = b => String(b.serviceId) === String(process.env.UZUM_SERVICE_ID || '');
const fail = (b, code, extra) => ({ status: 400, body: Object.assign({ serviceId: b.serviceId, timestamp: Date.now(),
  transId: b.transId, status: 'FAILED', errorCode: code }, extra || {}) });
const ok = body => ({ status: 200, body });

async function findOrder(params) {
  const ref = String((params && (params.order_id || params.orderId || params.account)) || '').trim();
  if (!ref) return null;
  return Order.findOne(/^\d{6,10}$/.test(ref) ? { code: ref } : { id: ref });
}
const dataOf = o => ({ order: { value: o.code || o.id }, plan: { value: String(o.planKey).toUpperCase() } });

const OPS = {
  async check(b) {
    if (!b.params) return fail(b, ERR.params);
    if (!serviceOk(b)) return fail(b, ERR.service);
    const o = await findOrder(b.params);
    if (!o) return fail(b, ERR.noOrder);
    if (o.status === 'paid' || o.status === 'refunded') return fail(b, ERR.paid);
    if (o.status === 'canceled') return fail(b, ERR.canceled);
    return ok({ serviceId: b.serviceId, timestamp: Date.now(), status: 'OK', data: dataOf(o) });
  },

  async create(b, now) {
    if (!b.params || !b.transId || b.amount == null) return fail(b, ERR.params);
    if (!serviceOk(b)) return fail(b, ERR.service);
    const same = await Order.findOne({ uzumTransId: String(b.transId) });
    if (same) {
      if (same.uzumState !== 'CREATED') return fail(b, ERR.exists, { transTime: same.uzumCreateTime });
      return ok({ serviceId: b.serviceId, transId: b.transId, status: 'CREATED', transTime: same.uzumCreateTime,
        data: dataOf(same), amount: same.amount * 100 });
    }
    const o = await findOrder(b.params);
    if (!o) return fail(b, ERR.noOrder, { transTime: now });
    if (o.status === 'paid' || o.status === 'refunded') return fail(b, ERR.paid, { transTime: now });
    if (o.status === 'canceled') return fail(b, ERR.canceled, { transTime: now });
    if (Number(b.amount) !== o.amount * 100) return fail(b, ERR.amount, { transTime: now });
    // Boshqa faol Uzum tranzaksiyasi (30 daqiqa ichida) — band
    if (o.uzumTransId && o.uzumState === 'CREATED' && now - o.uzumCreateTime < CONFIRM_WINDOW) return fail(b, ERR.exists, { transTime: now });
    const r = await Order.updateOne({ id: o.id, status: 'pending' },
      { $set: { uzumTransId: String(b.transId), uzumState: 'CREATED', uzumCreateTime: now, provider: 'uzum',
                uzumConfirmTime: 0, uzumReverseTime: 0 } });
    if (!r.modifiedCount) return fail(b, ERR.paid, { transTime: now });
    return ok({ serviceId: b.serviceId, transId: b.transId, status: 'CREATED', transTime: now, data: dataOf(o), amount: o.amount * 100 });
  },

  async confirm(b, now) {
    if (!b.transId) return fail(b, ERR.params);
    const o = await Order.findOne({ uzumTransId: String(b.transId) });
    if (!o) return fail(b, ERR.noTx);
    if (o.uzumState === 'CONFIRMED') return ok(view(b, o));           // takror — saqlangan holat
    if (o.uzumState !== 'CREATED') return fail(b, ERR.txCanceled);
    if (now - o.uzumCreateTime > CONFIRM_WINDOW) {
      await Order.updateOne({ id: o.id, uzumState: 'CREATED' }, { $set: { uzumState: 'FAILED' } });
      return fail(b, ERR.txCanceled);
    }
    await billing.activate(o.id, { by: 'uzum' });
    await Order.updateOne({ id: o.id, uzumState: 'CREATED' }, { $set: { uzumState: 'CONFIRMED', uzumConfirmTime: now } });
    const fresh = await Order.findOne({ id: o.id }).lean();
    return ok({ serviceId: b.serviceId, transId: b.transId, status: 'CONFIRMED', confirmTime: fresh.uzumConfirmTime,
      data: dataOf(fresh), amount: fresh.amount * 100 });
  },

  async reverse(b, now) {
    if (!b.transId) return fail(b, ERR.params);
    const o = await Order.findOne({ uzumTransId: String(b.transId) });
    if (!o) return fail(b, ERR.noTx);
    if (o.uzumState === 'REVERSED') return ok(view(b, o));
    if (o.uzumState === 'CREATED' || o.uzumState === 'FAILED') {
      await Order.updateOne({ id: o.id }, { $set: { uzumState: 'REVERSED', uzumReverseTime: now,
        status: o.status === 'pending' ? 'canceled' : o.status, canceledAt: new Date(now) } });
    } else if (o.uzumState === 'CONFIRMED') {
      const r = await billing.refundOrder(o.id, { now: new Date(now), by: 'uzum' });
      if (!r.ok) return fail(b, ERR.noReverse);
      await Order.updateOne({ id: o.id }, { $set: { uzumState: 'REVERSED', uzumReverseTime: now } });
    }
    const fresh = await Order.findOne({ id: o.id }).lean();
    return ok({ serviceId: b.serviceId, transId: b.transId, status: 'REVERSED', reverseTime: fresh.uzumReverseTime,
      data: dataOf(fresh), amount: fresh.amount * 100 });
  },

  async status(b) {
    if (!b.transId) return fail(b, ERR.params);
    const o = await Order.findOne({ uzumTransId: String(b.transId) });
    if (!o) return fail(b, ERR.noTx);
    return ok(view(b, o));
  }
};

function view(b, o) {
  const st = o.uzumState === 'FAILED' ? 'FAILED' : o.uzumState;
  return { serviceId: b.serviceId, transId: b.transId, status: st, transTime: o.uzumCreateTime,
    confirmTime: o.uzumConfirmTime || null, reverseTime: o.uzumReverseTime || null, data: dataOf(o), amount: o.amount * 100 };
}

/** op — check|create|confirm|reverse|status. Javob: { status (HTTP), body } */
async function handle(op, body, auth, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  if (!authOk(auth)) return fail(b, ERR.auth);
  const fn = OPS[op];
  if (!fn) return fail(b, ERR.params);
  try {
    return await fn(b, now);
  } catch (e) {
    console.error('[UZUM]', op, e.message);
    return fail(b, ERR.system);
  }
}

/** Uzum Bank ilovasida xizmatni buyurtma bilan ochadigan havola (Uzum bilan tasdiqlash kerak) */
function payUrl(o, returnUrl) {
  const q = new URLSearchParams({ serviceId: process.env.UZUM_SERVICE_ID, order_id: o.code || o.id,
    amount: String(o.amount * 100), redirectUrl: returnUrl });
  return `https://www.uzumbank.uz/open-service?${q}`;
}

module.exports = { handle, authOk, payUrl, CONFIRM_WINDOW, ERR };
