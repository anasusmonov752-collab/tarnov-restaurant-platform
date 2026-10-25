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
const Shortlist = require('../models/Shortlist');
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
    e.CLICK_SERVICE_ID && e.CLICK_MERCHANT_ID && e.CLICK_SECRET_KEY ? 'click' : '',
    e.UZUM_SERVICE_ID && e.UZUM_LOGIN && e.UZUM_PASSWORD ? 'uzum' : ''
  ].filter(Boolean);
}

// To'lov sahifasi havolasi (Mini App uni Telegram.openLink bilan ochadi)
function checkoutUrl(o, returnUrl) {
  const e = process.env;
  if (o.provider === 'payme') {
    const raw = `m=${e.PAYME_MERCHANT_ID};ac.order_id=${o.id};a=${o.amount * 100};c=${returnUrl};l=uz`;
    const host = e.PAYME_TEST === '1' ? 'https://test.paycom.uz' : 'https://checkout.paycom.uz';
    return `${host}/${Buffer.from(raw).toString('base64')}`;
  }
  if (o.provider === 'click') {
    const q = new URLSearchParams({ service_id: e.CLICK_SERVICE_ID, merchant_id: e.CLICK_MERCHANT_ID,
      amount: o.amount.toFixed(2), transaction_param: o.id, return_url: returnUrl });
    return `https://my.click.uz/services/pay/?${q}`;
  }
  if (o.provider === 'uzum') return require('./uzum').payUrl(o, returnUrl);
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

/**
 * Buyurtma yaratadi. provider: payme | click | uzum | manual | invoice
 * invoice — yuridik shaxs: hisob-faktura va bank o'tkazmasi ({ company, inn })
 */
async function createOrder({ client, planKey, provider, invoice, auto, card }) {
  if (!PL.isPlan(planKey)) fail('Tarif topilmadi');
  const offline = ['manual', 'invoice'];
  // 'card' faqat cardPay.startOrder orqali (rekvizit borligi o'sha yerda tekshiriladi)
  const prov = offline.includes(provider) || providers().includes(provider) || (provider === 'card' && card) ? provider : fail('To\'lov usuli mavjud emas');
  const inv = prov === 'invoice' ? {
    company: String((invoice && invoice.company) || '').trim().slice(0, 120),
    inn: String((invoice && invoice.inn) || '').replace(/\D/g, '')
  } : null;
  if (inv && (inv.company.length < 2 || !/^\d{9}$/.test(inv.inn))) fail('Kompaniya nomi va 9 xonali STIR kerak');
  const plan = PL.PLANS[planKey];
  let o;
  for (let i = 0; !o; i++) {
    try {
      o = await Order.create({ id: uuidv4(), code: String(10000000 + Math.floor(Math.random() * 9e7)),
        agencyId: client.agencyId, clientId: client.id, planKey, amount: plan.price, provider: prov, auto: !!auto,
        cardTo: prov === 'card' ? card : '',
        invoiceCompany: inv ? inv.company : '', invoiceInn: inv ? inv.inn : '' });
    } catch (e) { if (e.code !== 11000 || i > 4) throw e; }           // raqam band — qayta
  }

  if (offline.includes(prov)) {
    // Agentlikka — bir bosishda tasdiqlash tugmasi bilan (telegram.js 'bo:')
    await say(await adminChatOf(client.agencyId),
      `💳 Tarif so'rovi${inv ? ' — hisob-faktura' : ''} · №${o.code}\n\n${client.name}\nTarif: ${planName('uz', planKey)} — ${plan.price.toLocaleString('ru-RU')} so'm\n` +
      (inv ? `Kompaniya: ${inv.company}\nSTIR: ${inv.inn}\n` : '') +
      `Joriy balans: ${client.credits} kredit\n\n${inv ? 'Hisob-faktura yuboring; pul tushgach' : 'To\'lovni qabul qilgach'}, tasdiqlang:`,
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
  // Faol pullik tarif bo'lsa yangi muddat uning OXIRIDAN boshlanadi —
  // oldindan (yoki avto-yangilash bilan) to'lagan mijoz kunlarini yo'qotmaydi
  const cur = await Client.findOne({ agencyId: o.agencyId, id: o.clientId }, 'plan').lean();
  const cp = (cur && cur.plan) || {};
  const from = PL.isPlan(cp.key) && !cp.expiredAt && cp.endsAt && new Date(cp.endsAt) > now ? new Date(cp.endsAt) : now;
  await Order.updateOne({ id: o.id }, { $set: { prevPlan: { key: cp.key || '', startedAt: cp.startedAt || null, endsAt: cp.endsAt || null } } });
  const endsAt = new Date(from.getTime() + plan.days * DAY);
  const c = await Client.findOneAndUpdate({ agencyId: o.agencyId, id: o.clientId },
    { $set: { 'plan.key': o.planKey, 'plan.startedAt': now, 'plan.endsAt': endsAt,
              'plan.remindedAt': null, 'plan.expiredAt': null, 'plan.lowAt': null, 'plan.guaranteeExtendedAt': null,
              'autoRenew.error': '' } }, { new: true }).lean();

  if (c) {
    const L = langOf(c);
    await say(c.tgChatId, I18N.t(L, 'bill.paid', { plan: planName(L, o.planKey), n: plan.contacts, bal: balance, date: dmy(endsAt) }));
    await say(await adminChatOf(o.agencyId),
      `✅ To'lov: ${c.name} — ${planName('uz', o.planKey)}, ${o.amount.toLocaleString('ru-RU')} so'm (${by}). Balans: ${balance}.`);
    await rewardReferral(c);
  }
  return { already: false, order: o, endsAt, balance };
}

// ── Tavsiya dasturi: taklif qilingan restoran BIRINCHI marta to'lasa —
// ikkalasiga REFERRAL_BONUS kredit (bir marta, atomik belgi bilan)
const REFERRAL_BONUS = 3;
async function rewardReferral(c) {
  if (!c.referredBy) return;
  const won = await Client.findOneAndUpdate({ agencyId: c.agencyId, id: c.id, referralRewardedAt: null },
    { $set: { referralRewardedAt: new Date() } });
  if (!won) return;
  const ref = await Client.findOne({ agencyId: c.agencyId, id: c.referredBy }).lean();
  try {
    await credits.bonus({ agencyId: c.agencyId, clientId: c.id, amount: REFERRAL_BONUS, note: 'Tavsiya bonusi' });
    if (ref) await credits.bonus({ agencyId: c.agencyId, clientId: ref.id, amount: REFERRAL_BONUS, note: `Tavsiya bonusi: ${c.name}` });
  } catch (e) { console.error('[BILL] tavsiya bonusi:', e.message); return; }
  await say(c.tgChatId, I18N.t(langOf(c), 'bill.refYou', { n: REFERRAL_BONUS }));
  if (ref) await say(ref.tgChatId, I18N.t(langOf(ref), 'bill.refThem', { n: REFERRAL_BONUS, name: c.name }));
}

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Mijozning tavsiya havolasi (kod birinchi so'rovda beriladi) */
async function referralLink(client, botUsername) {
  let code = client.referralCode;
  for (let i = 0; !code && i < 5; i++) {
    const c = Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join('');
    try {
      const r = await Client.updateOne({ agencyId: client.agencyId, id: client.id, $or: [{ referralCode: '' }, { referralCode: null }] },
        { $set: { referralCode: c } });
      if (r.modifiedCount) code = c;
      else code = (await Client.findOne({ agencyId: client.agencyId, id: client.id }, 'referralCode').lean()).referralCode;
    } catch (e) { if (e.code !== 11000) throw e; }          // kod band — qayta
  }
  const [invited, paid] = await Promise.all([
    Client.countDocuments({ agencyId: client.agencyId, referredBy: client.id }),
    Client.countDocuments({ agencyId: client.agencyId, referredBy: client.id, referralRewardedAt: { $ne: null } })
  ]);
  return { code, link: `https://t.me/${botUsername}?start=ref_${code}`, invited, paid, bonus: REFERRAL_BONUS };
}

// ── Kafolat: tarif davrida berilgan tekshirilgan nomzodlar va ishga olinganlar ──
// Nomzod "berildi" — kontakti shu davrda ochilgan yoki agentlik tekshirib
// "nomzod rozi" (candidate_ok) holatiga olib chiqqan (mijoz hali ochmagan).
async function guaranteeProgress(c) {
  const p = (c && c.plan) || {};
  const plan = PL.PLANS[p.key];
  if (!plan || !p.startedAt) return null;
  const since = new Date(p.startedAt);
  const sls = await Shortlist.find({ agencyId: c.agencyId, clientId: c.id,
    $or: [{ createdAt: { $gte: since } }, { 'items.revealedAt': { $gte: since } }, { 'items.decidedAt': { $gte: since } }] },
    'items createdAt').lean();
  const seen = new Set();
  let hired = 0;
  for (const s of sls) {
    for (const it of s.items || []) {
      const rev = it.revealedAt && new Date(it.revealedAt) >= since && it.state !== 'refunded';
      const ok = it.state === 'candidate_ok' && new Date(s.createdAt) >= since;
      if (rev || ok) seen.add(it.candidateId);
      if (it.state === 'hired' && it.decidedAt && new Date(it.decidedAt) >= since) hired++;
    }
  }
  const g = plan.guarantee || {};
  return { candidates: seen.size, needCandidates: g.candidates || 0, hired, needHire: g.hire || 0 };
}
const guaranteeMet = g => !g || ((!g.needCandidates || g.candidates >= g.needCandidates) && (!g.needHire || g.hired >= g.needHire));

// ── Kam balans: kontakt ochilib 2 yoki kam qolsa — bir marta taklif (Max — cheksiz, yozilmaydi) ──
const LOW_AT = 2;
async function lowBalance({ agencyId, clientId, balance, appBase }) {
  if (balance > LOW_AT) return false;
  const c = await Client.findOneAndUpdate({ agencyId, id: clientId, 'plan.lowAt': null, 'plan.key': { $ne: 'max' } },
    { $set: { 'plan.lowAt': new Date() } }, { new: true }).lean();
  if (!c || !c.tgChatId) return false;
  const L = langOf(c);
  await say(c.tgChatId, I18N.t(L, 'bill.low', { n: balance }), appBase ? { reply_markup: { inline_keyboard: [[
    { text: I18N.t(L, 'bill.lowBtn'), web_app: { url: `${appBase}/miniapp.html?open=plans` } }]] } } : undefined);
  return true;
}

/**
 * To'langan buyurtmani qaytarish (Payme kabinetidan "qaytarish" — CancelTransaction
 * state 2 dan). Faqat tarif kreditlari ishlatilmagan bo'lsa: kreditlar yechiladi,
 * shu buyurtma yoqgan tarif yopiladi. Ishlatilgan bo'lsa — { ok:false } (Payme -31007).
 */
async function refundOrder(orderId, { now = new Date(), by = 'payme' } = {}) {
  const o = await Order.findOneAndUpdate({ id: orderId, status: 'paid' },
    { $set: { status: 'refunded', refundedAt: now } }, { new: true });
  if (!o) {
    const ex = await Order.findOne({ id: orderId }).lean();
    return { ok: !!ex && ex.status === 'refunded', already: true };
  }
  const plan = PL.PLANS[o.planKey];
  try {
    await credits.move({ agencyId: o.agencyId, clientId: o.clientId, delta: -plan.contacts, reason: 'payrefund',
      note: `To'lov qaytarildi · ${o.id.slice(0, 8)}` });
  } catch (e) {
    await Order.updateOne({ id: o.id }, { $set: { status: 'paid', refundedAt: null } });
    return { ok: false, reason: e.message };
  }
  // Shu buyurtma yoqgan tarif hali joriy bo'lsa — oldingisini tiklaymiz (u hali amalda bo'lsa), aks holda yopamiz
  const pv = o.prevPlan || {};
  const back = pv.key && pv.endsAt && new Date(pv.endsAt) > now;
  await Client.updateOne({ agencyId: o.agencyId, id: o.clientId, 'plan.startedAt': o.paidAt },
    { $set: back ? { 'plan.key': pv.key, 'plan.startedAt': pv.startedAt, 'plan.endsAt': pv.endsAt }
                 : { 'plan.key': '', 'plan.endsAt': now, 'plan.expiredAt': now } });
  const c = await Client.findOne({ agencyId: o.agencyId, id: o.clientId }, 'name').lean();
  await say(await adminChatOf(o.agencyId),
    `↩️ To'lov qaytarildi (${by}): ${c ? c.name : o.clientId} — ${planName('uz', o.planKey)}, ${o.amount.toLocaleString('ru-RU')} so'm. Tarif yopildi.`);
  return { ok: true };
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
// ── Avto-yangilash: muddat tugashiga 1 kun qolganda saqlangan karta bilan ──
// Kafolat bajarilmagan bo'lsa to'lov olinmaydi — muddat baribir bepul uzayadi.
async function autoRenew(now) {
  const sub = require('./paymeSubscribe');
  const out = { tried: 0, paid: 0, failed: 0 };
  if (!sub.enabled()) return out;
  const due = await Client.find({ 'autoRenew.on': true, 'autoRenew.token': { $gt: '' }, 'plan.expiredAt': null,
    'plan.key': { $in: PL.PLAN_KEYS }, 'plan.endsAt': { $gt: now, $lte: new Date(now.getTime() + DAY) } }).lean();
  for (const c of due) {
    if (c.autoRenew.triedAt && c.plan.startedAt && new Date(c.autoRenew.triedAt) > new Date(c.plan.startedAt)) continue;
    if (!c.plan.guaranteeExtendedAt && !guaranteeMet(await guaranteeProgress(c))) continue;
    const won = await Client.findOneAndUpdate({ agencyId: c.agencyId, id: c.id, 'autoRenew.triedAt': c.autoRenew.triedAt || null },
      { $set: { 'autoRenew.triedAt': now } });
    if (!won) continue;
    out.tried++;
    const L = langOf(c);
    let o;
    try {
      o = await createOrder({ client: c, planKey: c.plan.key, provider: 'payme', auto: true });
      const r = await sub.charge(o, c.autoRenew.token);
      await Order.updateOne({ id: o.id }, { $set: { receiptId: r.receiptId } });
      if (r.state !== 4) throw new Error('Chek holati ' + r.state);
      out.paid++;                                   // tarifni Merchant API (PerformTransaction) yoqadi
    } catch (e) {
      out.failed++;
      if (o) await Order.updateOne({ id: o.id, status: 'pending' }, { $set: { status: 'canceled', canceledAt: now } });
      await Client.updateOne({ agencyId: c.agencyId, id: c.id }, { $set: { 'autoRenew.error': String(e.message).slice(0, 200) } });
      await say(c.tgChatId, I18N.t(L, 'bill.autoFail', { plan: planName(L, c.plan.key), date: dmy(c.plan.endsAt) }));
      await say(await adminChatOf(c.agencyId), `⚠️ Avto-yangilash o'tmadi: ${c.name} — ${e.message}`);
    }
  }
  return out;
}

/** Avto-yangilash kartasini saqlash (token Mini App'da Payme'dan olingan) */
async function saveCard(client, token) {
  const sub = require('./paymeSubscribe');
  if (!sub.enabled()) fail('Avto-yangilash hozircha ulanmagan');
  if (!/^[\w\-=+/.]{10,600}$/.test(String(token || ''))) fail('Karta tokeni noto\'g\'ri');
  const { masked } = await sub.checkCard(token).catch(e => fail(e.message));
  const old = client.autoRenew && client.autoRenew.token;
  await Client.updateOne({ agencyId: client.agencyId, id: client.id },
    { $set: { autoRenew: { on: true, provider: 'payme', token, masked, triedAt: null, error: '' } } });
  if (old && old !== token) await sub.removeCard(old);
  return { on: true, masked };
}

async function setAutoRenew(client, on) {
  const ar = client.autoRenew || {};
  if (on && !ar.token) fail('Avval kartani qo\'shing');
  if (on === 'remove') {
    if (ar.token) await require('./paymeSubscribe').removeCard(ar.token);
    await Client.updateOne({ agencyId: client.agencyId, id: client.id },
      { $set: { autoRenew: { on: false, provider: '', token: '', masked: '', triedAt: null, error: '' } } });
    return { on: false, masked: '' };
  }
  await Client.updateOne({ agencyId: client.agencyId, id: client.id }, { $set: { 'autoRenew.on': !!on } });
  return { on: !!on, masked: ar.masked || '' };
}

const autoView = c => {
  const ar = (c && c.autoRenew) || {};
  return { available: require('./paymeSubscribe').enabled(), on: !!(ar.on && ar.token), masked: ar.masked || '', error: ar.error || '' };
};

async function tick({ now = new Date() } = {}) {
  const out = { expired: 0, burned: 0, reminded: 0 };
  out.auto = await autoRenew(now);
  out.card = await require('./cardPay').tick(now);
  const due = await Client.find({ 'plan.endsAt': { $lte: now }, 'plan.expiredAt': null, 'plan.key': { $nin: ['', null] } }).lean();
  out.extended = 0;
  for (const c of due) {
    // Kafolat bajarilmagan — muddat bir marta bepul uzayadi (Max: keyingi oy bepul)
    const plan = PL.PLANS[c.plan.key];
    if (plan && !c.plan.guaranteeExtendedAt) {
      const g = await guaranteeProgress(c);
      if (!guaranteeMet(g)) {
        const endsAt = new Date(new Date(c.plan.endsAt).getTime() + plan.days * DAY);
        await Client.updateOne({ agencyId: c.agencyId, id: c.id },
          { $set: { 'plan.endsAt': endsAt, 'plan.guaranteeExtendedAt': now, 'plan.remindedAt': null } });
        const L = langOf(c);
        const got = g.needHire ? I18N.t(L, 'bill.gHire', { n: g.hired }) : I18N.t(L, 'bill.gCand', { n: g.candidates, need: g.needCandidates });
        await say(c.tgChatId, I18N.t(L, 'bill.extended', { plan: planName(L, c.plan.key), got, date: dmy(endsAt) }));
        await say(await adminChatOf(c.agencyId),
          `🛡 Kafolat: ${c.name} — ${planName('uz', c.plan.key)} ${dmy(endsAt)} gacha bepul uzaytirildi ` +
          `(${g.needHire ? `ishga olindi ${g.hired}/${g.needHire}` : `nomzod ${g.candidates}/${g.needCandidates}`}). ` +
          `Mijoz shartlarni buzgan bo'lsa (maosh, 48 soat) — panelda tuzating.`);
        out.extended++;
        continue;
      }
    }
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

module.exports = { providers, checkoutUrl, adminChatOf, say, langOf, planName, planView, createOrder, activate, refundOrder, cancelOrder, startTrial, tick, dmy,
  guaranteeProgress, guaranteeMet, lowBalance, referralLink, rewardReferral, REFERRAL_BONUS, LOW_AT,
  saveCard, setAutoRenew, autoView, autoRenew };
