// ── PAYME SUBSCRIBE API — saqlangan karta bilan avto-yangilash ──
// developer.help.paycom.uz/protokol-subscribe-api. Karta raqami bizning
// serverimizga KELMAYDI: Mini App cards.create / get_verify_code / verify ni
// to'g'ridan-to'g'ri Payme'ga yuboradi (X-Auth: kassa id) va faqat tokenni
// bizga beradi. Server tokenni cards.check bilan tekshiradi, muddat
// tugashidan oldin receipts.create + receipts.pay qiladi (X-Auth: id:kalit).
// Chek kassaga bog'langani uchun Payme bizning Merchant API'mizni ham
// chaqiradi (order_id bo'yicha) — tarifni o'sha yo'l yoqadi (billing.activate).
// Yoqish: PAYME_SUBSCRIBE=1 (kassada Subscribe ruxsati bo'lishi kerak).

const PL = require('../data/plans');

const enabled = () => {
  const e = process.env;
  return e.PAYME_SUBSCRIBE === '1' && !!e.PAYME_MERCHANT_ID && !!e.PAYME_KEY;
};
const apiUrl = () => process.env.PAYME_TEST === '1' ? 'https://checkout.test.paycom.uz/api' : 'https://checkout.paycom.uz/api';

async function call(method, params) {
  const e = process.env;
  const r = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': `${e.PAYME_MERCHANT_ID}:${e.PAYME_KEY}` },
    body: JSON.stringify({ id: Date.now(), method, params }),
    signal: AbortSignal.timeout(30000)
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw Object.assign(new Error((j.error.message && (j.error.message.uz || j.error.message.ru)) || j.error.message || 'Payme xatosi'), { code: j.error.code });
  return j.result;
}

/** Token haqiqiymi va takroriy to'lovga yaroqlimi → { masked } */
async function checkCard(token) {
  const r = await call('cards.check', { token });
  const c = (r && r.card) || {};
  if (!c.verify) throw new Error('Karta tasdiqlanmagan');
  if (c.recurrent === false) throw new Error('Bu karta takroriy to\'lovni qo\'llamaydi');
  return { masked: c.number || '' };
}

/** Buyurtmani saqlangan karta bilan to'lash. state 4 — to'landi */
async function charge(order, token) {
  const plan = PL.PLANS[order.planKey];
  const rc = await call('receipts.create', { amount: order.amount * 100, account: { order_id: order.id },
    description: `TalentHub ${plan ? plan.key.toUpperCase() : order.planKey}` });
  const id = rc.receipt._id;
  const paid = await call('receipts.pay', { id, token });
  return { receiptId: id, state: paid && paid.receipt ? paid.receipt.state : null };
}

async function removeCard(token) {
  try { await call('cards.remove', { token }); } catch (e) { console.warn('[SUBSCRIBE] cards.remove:', e.message); }
}

module.exports = { enabled, checkCard, charge, removeCard, apiUrl };
