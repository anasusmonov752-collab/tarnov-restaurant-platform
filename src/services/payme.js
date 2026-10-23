// ── PAYME MERCHANT API (JSON-RPC) ────────────────────────────
// developer.help.paycom.uz — Payme bizning endpoint'imizni chaqiradi
// (routes/payments POST /api/pay/payme): CheckPerformTransaction ->
// CreateTransaction -> PerformTransaction (yoki CancelTransaction),
// CheckTransaction, GetStatement, SetFiscalData.
// Kirish: Basic "Paycom:<PAYME_KEY>" (sinov kassasida — TEST_KEY'ni PAYME_KEY
// ga qo'ying). Hisob maydoni — order_id (kassa sozlamasida "order_id", bir
// martalik hisob). Summa tiyinda (so'm × 100). Javob doim HTTP 200.
//
// Holatlar: 1 yaratildi, 2 bajarildi (tarif yoqildi), -1 bajarilmasdan bekor,
// -2 bajarilgandan keyin bekor — faqat tarif kreditlari ishlatilmagan bo'lsa
// (billing.refundOrder), aks holda -31007. 12 soatda (Payme'dagi yaratilish
// vaqti — params.time) bajarilmagan tranzaksiya bekor (sabab 4).
// Create/Perform/Cancel takror kelishi mumkin — javob birinchisi bilan bir xil.
//
// Fiskal chek (OFD): PAYME_IKPU va PAYME_PACKAGE_CODE berilsa
// CheckPerformTransaction "detail" qaytaradi (PAYME_VAT — QQS foizi, standart 0).

const crypto = require('crypto');
const Order = require('../models/Order');
const billing = require('./billing');
const PL = require('../data/plans');

const TIMEOUT = 12 * 36e5;
const m = (uz, ru, en) => ({ uz, ru, en: en || ru });
const ERR = {
  auth:     [-32504, m('Ruxsat yo\'q', 'Недостаточно привилегий', 'Insufficient privilege')],
  method:   [-32601, m('Usul topilmadi', 'Метод не найден', 'Method not found')],
  system:   [-32400, m('Tizim xatosi', 'Системная ошибка', 'System error')],
  amount:   [-31001, m('Summa noto\'g\'ri', 'Неверная сумма', 'Invalid amount')],
  noTx:     [-31003, m('Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found')],
  noCancel: [-31007, m('Bekor qilib bo\'lmaydi: xizmat ko\'rsatilgan', 'Невозможно отменить: услуга оказана', 'Cannot cancel')],
  noPerform:[-31008, m('Bajarib bo\'lmaydi', 'Невозможно выполнить операцию', 'Cannot perform')],
  noOrder:  [-31050, m('Buyurtma topilmadi', 'Заказ не найден', 'Order not found')],
  closed:   [-31051, m('Buyurtma to\'langan yoki bekor qilingan', 'Заказ оплачен или отменён', 'Order closed')],
  busy:     [-31099, m('Buyurtma boshqa to\'lovni kutmoqda', 'Заказ ожидает другой оплаты', 'Order awaits another payment')]
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
const created = o => o.paymeTime || o.paymeCreateTime;

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

// Fiskal chek tafsiloti (kalitlar bo'lsa)
function detail(o) {
  const e = process.env;
  if (!e.PAYME_IKPU || !e.PAYME_PACKAGE_CODE) return undefined;
  const plan = PL.PLANS[o.planKey];
  return { receipt_type: 0, items: [{
    title: `TalentHub: ${plan ? plan.key.toUpperCase() : o.planKey} tarifi`,
    price: o.amount * 100, count: 1,
    code: e.PAYME_IKPU, package_code: e.PAYME_PACKAGE_CODE,
    vat_percent: Number(e.PAYME_VAT) || 0
  }] };
}

const METHODS = {
  async CheckPerformTransaction(p) {
    const { o, e } = await payable(p);
    if (e) return e;
    if (o.paymeId && o.paymeState === 1) return err('busy', 'order_id');
    const d = detail(o);
    return { result: d ? { allow: true, detail: d } : { allow: true } };
  },

  async CreateTransaction(p, now) {
    const ex = await Order.findOne({ paymeId: String(p.id) });
    if (ex) {
      if (ex.paymeState !== 1) return err('noPerform');
      if (now - created(ex) > TIMEOUT) { await cancelExpired(ex, now); return err('noPerform'); }
      return { result: { create_time: ex.paymeCreateTime, transaction: ex.id, state: 1 } };
    }
    const { o, e } = await payable(p);
    if (e) return e;
    // Buyurtmada boshqa faol tranzaksiya bor (sandbox: -31008)
    if (o.paymeId && o.paymeState === 1) return err('noPerform', 'order_id');
    const t = Number(p.time) || now;
    if (now - t > TIMEOUT) return err('noPerform');
    const r = await Order.updateOne({ id: o.id, status: 'pending', $or: [{ paymeId: '' }, { paymeState: { $ne: 1 } }] },
      { $set: { paymeId: String(p.id), paymeState: 1, paymeCreateTime: now, paymeTime: t, provider: 'payme',
                paymePerformTime: 0, paymeCancelTime: 0, paymeReason: null } });
    if (!r.modifiedCount) return err('noPerform', 'order_id');
    return { result: { create_time: now, transaction: o.id, state: 1 } };
  },

  async PerformTransaction(p, now) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    if (!o) return err('noTx');
    if (o.paymeState === 2) return { result: { transaction: o.id, perform_time: o.paymePerformTime, state: 2 } };
    if (o.paymeState !== 1) return err('noPerform');
    if (now - created(o) > TIMEOUT) { await cancelExpired(o, now); return err('noPerform'); }
    await billing.activate(o.id, { by: 'payme' });
    await Order.updateOne({ id: o.id, paymeState: 1 }, { $set: { paymeState: 2, paymePerformTime: now } });
    const fresh = await Order.findOne({ id: o.id }).lean();
    return { result: { transaction: o.id, perform_time: fresh.paymePerformTime, state: 2 } };
  },

  async CancelTransaction(p, now) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    if (!o) return err('noTx');
    const reason = Number(p.reason) || null;
    if (o.paymeState === 1) {
      Object.assign(o, { paymeState: -1, paymeCancelTime: now, paymeReason: reason,
        status: o.status === 'pending' ? 'canceled' : o.status, canceledAt: new Date(now) });
      await o.save();
    } else if (o.paymeState === 2) {
      const r = await billing.refundOrder(o.id, { now: new Date(now), by: 'payme' });
      if (!r.ok) return err('noCancel');
      await Order.updateOne({ id: o.id, paymeState: 2 }, { $set: { paymeState: -2, paymeCancelTime: now, paymeReason: reason } });
      Object.assign(o, await Order.findOne({ id: o.id }).lean());
    }
    return { result: { transaction: o.id, cancel_time: o.paymeCancelTime, state: o.paymeState } };
  },

  async CheckTransaction(p) {
    const o = await Order.findOne({ paymeId: String(p.id) });
    return o ? { result: txView(o) } : err('noTx');
  },

  async GetStatement(p) {
    const from = Number(p.from) || 0, to = Number(p.to) || Date.now();
    const rows = await Order.find({ paymeId: { $ne: '' },
      $or: [{ paymeTime: { $gte: from, $lte: to } }, { paymeTime: 0, paymeCreateTime: { $gte: from, $lte: to } }] }).lean();
    rows.sort((a, b) => created(a) - created(b));
    return { result: { transactions: rows.map(o => Object.assign({
      id: o.paymeId, time: created(o), amount: o.amount * 100, account: { order_id: o.id }, receivers: null
    }, txView(o))) } };
  },

  // Chek fiskallashtirilgach Payme yuboradi (ixtiyoriy) — saqlab qo'yamiz
  async SetFiscalData(p) {
    const o = await Order.findOne({ paymeId: String(p.id || '') });
    if (!o) return { error: { code: -32001, message: 'Receipt not found' } };
    const f = Object.assign({ type: String(p.type || '') }, p.fiscal_data || {});
    await Order.updateOne({ id: o.id }, { $push: { paymeFiscal: f } });
    return { result: { success: true } };
  }
};

/** body — JSON-RPC so'rov, auth — Authorization sarlavhasi. Javob — JSON-RPC obyekt. */
async function handle(body, auth, now = Date.now()) {
  const id = body && body.id != null ? body.id : null;
  if (!authOk(auth)) return Object.assign({ id }, err('auth'));
  if (!body || typeof body.method !== 'string' || (body.params != null && typeof body.params !== 'object')) {
    return { id, error: { code: -32600, message: m('So\'rov noto\'g\'ri', 'Неверный запрос', 'Invalid request') } };
  }
  const fn = METHODS[body.method];
  if (!fn) return Object.assign({ id }, err('method', body.method));
  try {
    return Object.assign({ id }, await fn(body.params || {}, now));
  } catch (e) {
    console.error('[PAYME]', body.method, e.message);
    return Object.assign({ id }, err('system', e.message));
  }
}

module.exports = { handle, authOk, TIMEOUT };
