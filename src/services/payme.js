// ── PAYME MERCHANT API (JSON-RPC) ────────────────────────────
// Payme bizning endpoint'imizni chaqiradi (routes/payments POST /api/pay/payme):
// CheckPerformTransaction -> CreateTransaction -> PerformTransaction
// (yoki CancelTransaction), CheckTransaction, GetStatement.
// Kirish: Basic "Paycom:<PAYME_KEY>". Hisob maydoni — order_id (Payme
// kabinetida "order_id" deb sozlanadi). Summa tiyinda (so'm × 100).
// Javob doim HTTP 200, xato JSON-RPC "error" ichida.
//
// Holatlar: 1 yaratildi, 2 bajarildi (tarif yoqildi), -1 bajarilmasdan
// bekor, -2 bajarilgandan keyin bekor (biz ruxsat bermaymiz: kreditlar
// berilgan — -31007). 12 soatda bajarilmagan tranzaksiya bekor (sabab 4).

const crypto = require('crypto');
const Order = require('../models/Order');
const billing = require('./billing');

const TIMEOUT = 12 * 36e5;
const m = (uz, ru, en) => ({ uz, ru, en: en || ru });
const ERR = {
  auth:     [-32504, m('Ruxsat yo\'q', 'Недостаточно привилегий', 'Insufficient privilege')],
  method:   [-32601, m('Usul topilmadi', 'Метод не найден', 'Method not found')],
  amount:   [-31001, m('Summa noto\'g\'ri', 'Неверная сумма', 'Invalid amount')],
  noTx:     [-31003, m('Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found')],
  noCancel: [-31007, m('Bekor qilib bo\'lmaydi: xizmat ko\'rsatilgan', 'Невозможно отменить: услуга оказана', 'Cannot cancel')],
  noPerform:[-31008, m('Bajarib bo\'lmaydi', 'Невозможно выполнить операцию', 'Cannot perform')],
  noOrder:  [-31050, m('Buyurtma topilmadi', 'Заказ не найден', 'Order not found')],
  closed:   [-31051, m('Buyurtma to\'langan yoki bekor qilingan', 'Заказ оплачен или отменён', 'Order closed')],
  busy:     [-31099, m('Buyurtma boshqa to\'lov bilan band', 'Заказ ожидает другой оплаты', 'Order busy')]
};
const err = (key, data) => ({ error: { code: ERR[key][0], message: ERR[key][1], data: data || undefined } });

function authOk(header) {
  const key = process.env.PAYME_KEY || '';
  if (!key) return false;
  const want = 'Basic ' + Buffer.from('Paycom:' + key).toString('base64');
  const got = String(header || '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const txView = o => ({
  create_time: o.paymeCreateTime, perform_time: o.paymePerformTime, cancel_time: o.paymeCancelTime,
  transaction: o.id, state: o.paymeState, reason: o.paymeReason
});

// Buyurtma to'lov uchun ochiqmi va summa to'g'rimi
async function payable(p) {
  const id = p && p.account && String(p.account.order_id || '');
  const o = id ? await Order.findOne({ id }) : null;
  if (!o) return { e: err('noOrder', 'order_id') };
  if (o.status !== 'pending') return { e: err('closed', 'order_id') };
  if (Number(p.amount) !== o.amount * 100) return { e: err('amount') };
  return { o };
}

async function cancelExpired(o, now) {
  o.paymeState = -1; o.paymeReason = 4; o.paymeCancelTime = now;
  o.status = 'canceled'; o.canceledAt = new Date(now);
  await o.save();
}

const METHODS = {
  async CheckPerformTransaction(p) {
    const { e } = await payable(p);
    return e || { result: { allow: true } };
  },

  async CreateTransaction(p, now) {
    const ex = await Order.findOne({ paymeId: String(p.id) });
    if (ex) {
      if (ex.paymeState !== 1) return err('noPerform');
      if (now - ex.paymeCreateTime > TIMEOUT) { await cancelExpired(ex, now); return err('noPerform'); }
      return { result: { create_time: ex.paymeCreateTime, transaction: ex.id, state: 1 } };
    }
    const { o, e } = await payable(p);
    if (e) return e;
    if (o.paymeId && o.paymeState === 1) return err('busy', 'order_id');
    Object.assign(o, { paymeId: String(p.id), paymeState: 1, paymeCreateTime: now, provider: 'payme' });
    await o.save();
    return { result: { create_time: now, transaction: o.id, state: 1 } };
  },

  async PerformTransaction(p, now) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    if (!o) return err('noTx');
    if (o.paymeState === 2) return { result: { transaction: o.id, perform_time: o.paymePerformTime, state: 2 } };
    if (o.paymeState !== 1) return err('noPerform');
    if (now - o.paymeCreateTime > TIMEOUT) { await cancelExpired(o, now); return err('noPerform'); }
    await billing.activate(o.id, { by: 'payme' });
    await Order.updateOne({ id: o.id }, { $set: { paymeState: 2, paymePerformTime: now } });
    return { result: { transaction: o.id, perform_time: now, state: 2 } };
  },

  async CancelTransaction(p, now) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    if (!o) return err('noTx');
    if (o.paymeState === 2) return err('noCancel');
    if (o.paymeState === 1) {
      Object.assign(o, { paymeState: -1, paymeCancelTime: now, paymeReason: Number(p.reason) || null,
        status: o.status === 'pending' ? 'canceled' : o.status, canceledAt: new Date(now) });
      await o.save();
    }
    return { result: { transaction: o.id, cancel_time: o.paymeCancelTime, state: o.paymeState } };
  },

  async CheckTransaction(p) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    return o ? { result: txView(o) } : err('noTx');
  },

  async GetStatement(p) {
    const rows = await Order.find({ paymeId: { $ne: '' },
      paymeCreateTime: { $gte: Number(p.from) || 0, $lte: Number(p.to) || Date.now() } }).sort({ paymeCreateTime: 1 }).lean();
    return { result: { transactions: rows.map(o => Object.assign({
      id: o.paymeId, time: o.paymeCreateTime, amount: o.amount * 100, account: { order_id: o.id }
    }, txView(o))) } };
  }
};

/** body — JSON-RPC so'rov, auth — Authorization sarlavhasi. Javob — JSON-RPC obyekt. */
async function handle(body, auth, now = Date.now()) {
  const id = body && body.id != null ? body.id : null;
  if (!authOk(auth)) return Object.assign({ id }, err('auth'));
  const fn = body && METHODS[body.method];
  if (!fn) return Object.assign({ id }, err('method'));
  try {
    return Object.assign({ id }, await fn(body.params || {}, now));
  } catch (e) {
    console.error('[PAYME]', body.method, e.message);
    return Object.assign({ id }, err('noPerform', e.message));
  }
}

module.exports = { handle, authOk, TIMEOUT };
