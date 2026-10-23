// ── TARIF VA TO'LOV — YAGONA QOIDA ───────────────────────────
// Buyurtma (Order) -> to'landi -> activate(): kredit qo'shiladi (jurnalda
// 'purchase'), tarif muddati qo'yiladi, mijoz va agentlikka xabar. Qaysi yo'l
// bilan to'langani muhim emas — Payme, Click yoki agentlik qo'lda tasdiqlasa
// ham shu bitta funksiya (ikki marta chaqirilsa ham bir marta ishlaydi).
//
// Muddat tugaganda ishlatilmagan kreditlar yonadi ('expire'); 3 kun oldin
// eslatiladi. Yangi tarif olinganda qolgan kreditlar yangisiga qo'shiladi —
// shuning uchun eslatma "yangilasangiz, kreditlar saqlanadi" deydi.

const { v4: uuidv4 } = require('uuid');
const Order = require('../models/Order');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const credits = require('./credits');
const tg = require('./telegram');
const PL = require('../data/plans');
const I18N = require('../../public/js/th-i18n');

const DAY = 864e5;
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const dmy = d => { const x = new Date(new Date(d).getTime() + 5 * 36e5); return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}.${x.getUTCFullYear()}`; };

// Ulangan to'lov tizimlari — kalitlari Render'da bo'lsa (bo'lmasa — qo'lda)
function providers() {
  const e = process.env;
  return [
    e.PAYME_MERCHANT_ID && e.PAYME_KEY ? 'payme' : '',
    e.CLICK_SERVICE_ID && e.CLICK_MERCHANT_ID && e.CLICK_SECRET_KEY ? 'click' : ''
  ].filter(Boolean);
}

// To'lov sahifasi havolasi (Mini App uni Telegram.openLink bilan ochadi)
function checkoutUrl(o, returnUrl) {
  const e = process.env;
  if (o.provider === 'payme') {
    const raw = `m=${e.PAYME_MERCHANT_ID};ac.order_id=${o.id};a=${o.amount * 100};c=${returnUrl};l=uz`;
    const host = e.PAYME_TEST === '1' ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
    return `${host}/${Buffer.from(raw).toString('base64')}`;
  }
  if (o.provider === 'click') {
    const q = new URLSearchParams({ service_id: e.CLICK_SERVICE_ID, merchant_id: e.CLICK_MERCHANT_ID,
      amount: String(o.amount), transaction_param: o.id, return_url: returnUrl });
    return `https://my.click.uz/services/pay?${q}`;
  }
  return '';
}

/** Mijozga ko'rinadigan tarif holati */
function planView(c, now = new Date()) {
  const p = (c && c.plan) || {};
  const active = !!(p.key && p.endsAt && new Date(p.endsAt) > now);
  return {
    key: active ? p.key : '',
    endsAt: active ? p.endsAt : null,
    daysLeft: active ? Math.max(0, Math.ceil((new Date(p.endsAt) - now) / DAY)) : 0,
    trialAvailable: !c.trialUsedAt && !p.key
  };
}

async function adminChatOf(agencyId) {
  const ag = await Restaurant.findOne({ id: agencyId }, 'telegram').lean();
  return (ag && ag.telegram && ag.telegram.adminChatId) || '';
}
async function say(chatId, text, extra) {
  if (!chatId) return;
  await tg.sendMessage(tg.platformToken(), chatId, text, extra).catch(e => console.error('[BILL] xabar:', e.message));
}
const langOf = c => I18N.resolve(c.lang, c.tgLang);
const planName = (lang, key) => I18N.t(lang, 'plan.' + key);

/** Buyurtma yaratadi. provider: payme | click | manual */
async function createOrder({ client, planKey, provider }) {
  if (!PL.isPlan(planKey)) fail('Tarif topilmadi');
  const prov = provider === 'manual' || providers().includes(provider) ? provider : fail('To\'lov usuli mavjud emas');
  const plan = PL.PLANS[planKey];
  const o = await Order.create({ id: uuidv4(), agencyId: client.agencyId, clientId: client.id,
    planKey, amount: plan.price, provider: prov });

  if (prov === 'manual') {
    // Agentlikka — bir bosishda tasdiqlash tugmasi bilan (telegram.js 'bo:')
    await say(await adminChatOf(client.agencyId),
      `💳 Tarif so'rovi\n\n${client.name}\nTarif: ${planName('uz', planKey)} — ${plan.price.toLocaleString('ru-RU')} so'm\n` +
      `Joriy balans: ${client.credits} kredit\n\nTo'lovni qabul qilgach, tasdiqlang:`,
      { reply_markup: { inline_keyboard: [[{ text: '✅ To\'landi — tarifni yoqish', callback_data: 'bo:' + o.id }]] } });
  }
  return o;
}

/**
 * Buyurtmani to'langan deb belgilaydi va tarifni yoqadi. Takror chaqiruv xavfsiz.
 * by: payme | click | admin
 */
async function activate(orderId, { by = 'admin', now = new Date() } = {}) {
  const o = await Order.findOneAndUpdate({ id: orderId, status: 'pending' },
    { $set: { status: 'paid', paidAt: now, paidBy: by } }, { new: true });
  if (!o) {
    const ex = await Order.findOne({ id: orderId }).lean();
    if (!ex) fail('Buyurtma topilmadi', 404);
    if (ex.status === 'paid') return { already: true, order: ex };
    fail('Buyurtma bekor qilingan');
  }
  const plan = PL.PLANS[o.planKey];
  let balance;
  try {
    ({ balance } = await credits.purchase({ agencyId: o.agencyId, clientId: o.clientId, amount: plan.contacts,
      note: `Tarif ${planName('uz', o.planKey)} · ${o.id.slice(0, 8)}` }));
  } catch (e) {
    await Order.updateOne({ id: o.id }, { $set: { status: 'pending', paidAt: null, paidBy: '' } });
    throw e;
  }
  const endsAt = new Date(now.getTime() + plan.days * DAY);
  const c = await Client.findOneAndUpdate({ agencyId: o.agencyId, id: o.clientId },
    { $set: { 'plan.key': o.planKey, 'plan.startedAt': now, 'plan.endsAt': endsAt,
              'plan.remindedAt': null, 'plan.expiredAt': null } }, { new: true }).lean();

  if (c) {
    const L = langOf(c);
    await say(c.tgChatId, I18N.t(L, 'bill.paid', { plan: planName(L, o.planKey), n: plan.contacts, bal: balance, date: dmy(endsAt) }));
    await say(await adminChatOf(o.agencyId),
      `✅ To'lov: ${c.name} — ${planName('uz', o.planKey)}, ${o.amount.toLocaleString('ru-RU')} so'm (${by}). Balans: ${balance}.`);
  }
  return { already: false, order: o, endsAt, balance };
}

async function cancelOrder(orderId) {
  const o = await Order.findOneAndUpdate({ id: orderId, status: 'pending' },
    { $set: { status: 'canceled', canceledAt: new Date() } }, { new: true });
  if (!o) fail('Faqat kutilayotgan buyurtma bekor qilinadi');
  return o;
}

/** Bepul sinov: 3 kredit, 7 kun — har mijozga bir marta, tarifi bo'lmaganga */
async function startTrial(client, now = new Date()) {
  const c = await Client.findOneAndUpdate(
    { agencyId: client.agencyId, id: client.id, trialUsedAt: null, $or: [{ 'plan.key': '' }, { 'plan.key': null }, { plan: null }] },
    { $set: { trialUsedAt: now } }, { new: true });
  if (!c) fail('Bepul sinov allaqachon ishlatilgan');
  const { balance } = await credits.bonus({ agencyId: c.agencyId, clientId: c.id, amount: PL.TRIAL.contacts, note: 'Bepul sinov' });
  const endsAt = new Date(now.getTime() + PL.TRIAL.days * DAY);
  await Client.updateOne({ agencyId: c.agencyId, id: c.id },
    { $set: { 'plan.key': 'trial', 'plan.startedAt': now, 'plan.endsAt': endsAt, 'plan.remindedAt': null, 'plan.expiredAt': null } });
  return { balance, endsAt };
}

/**
 * Soatlik (cron): muddati tugaganlarda kreditlar yonadi, 3 kun qolganlarga eslatma.
 * Tunda chaqirilmaydi (routes/cron reminders.quietNow bilan birga).
 */
async function tick({ now = new Date() } = {}) {
  const out = { expired: 0, burned: 0, reminded: 0 };
  const due = await Client.find({ 'plan.endsAt': { $lte: now }, 'plan.expiredAt': null, 'plan.key': { $nin: ['', null] } }).lean();
  for (const c of due) {
    let burned = 0;
    if (c.credits > 0) {
      try {
        await credits.move({ agencyId: c.agencyId, clientId: c.id, delta: -c.credits, reason: 'expire',
          note: `Tarif muddati tugadi (${planName('uz', c.plan.key)})` });
        burned = c.credits;
      } catch (e) { console.error('[BILL] yondirish:', e.message); }
    }
    await Client.updateOne({ agencyId: c.agencyId, id: c.id }, { $set: { 'plan.expiredAt': now } });
    out.expired++; out.burned += burned;
    const L = langOf(c);
    await say(c.tgChatId, I18N.t(L, 'bill.expired', { plan: planName(L, c.plan.key) }));
  }
  const soon = await Client.find({ 'plan.endsAt': { $gt: now, $lte: new Date(now.getTime() + PL.REMIND_DAYS * DAY) },
    'plan.remindedAt': null, 'plan.key': { $nin: ['', null] } }).lean();
  for (const c of soon) {
    await Client.updateOne({ agencyId: c.agencyId, id: c.id }, { $set: { 'plan.remindedAt': now } });
    const L = langOf(c);
    await say(c.tgChatId, I18N.t(L, 'bill.remind', { plan: planName(L, c.plan.key), date: dmy(c.plan.endsAt), n: c.credits }));
    out.reminded++;
  }
  return out;
}

module.exports = { providers, checkoutUrl, planView, createOrder, activate, cancelOrder, startTrial, tick, dmy };
