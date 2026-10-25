// ── KARTAGA O'TKAZMA — merchant shartnomasigacha yarim avtomat to'lov ──
// Mijoz tarifni tanlaydi -> agentlik kartasi, aniq summa va buyurtma raqami
// (Mini App va botda) -> o'tkazadi -> "To'ladim" -> agentlikka botda
// "✅ Pul tushdi — yoqish" (bo:) / "❌ Tushmadi" (bx:) -> billing.activate.
// Pul tushganini faqat inson ko'radi (bank ilovasida), shuning uchun tarif
// O'ZI yoqilmaydi; qolgan hamma narsa — eslatma, bekor qilish, holat — avtomat.
//
// Eslatmalar (billing.tick, soatlik): "To'ladim" bosilmagan buyurtma —
// 3 soatdan keyin mijozga bir marta, 72 soatda bekor; bosilgan, lekin
// 2 soat tasdiqlanmagan — agentlikka bir marta.

const Order = require('../models/Order');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const billing = require('./billing');
const tg = require('./telegram');
const PL = require('../data/plans');
const I18N = require('../../public/js/th-i18n');

const H = 36e5;
const REMIND_AFTER = 3 * H, EXPIRE_AFTER = 72 * H, ADMIN_AFTER = 2 * H;
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
const sum = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const group = num => String(num).replace(/(\d{4})(?=\d)/g, '$1 ');
const masked = num => num ? `${num.slice(0, 4)} •••• ${num.slice(-4)}` : '';

// Luhn — rekvizit kiritishda xato raqamni ushlash (panel ogohlantiradi)
function luhnOk(num) {
  let s = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    s += d; alt = !alt;
  }
  return s % 10 === 0;
}

async function getCard(agencyId) {
  const ag = await Restaurant.findOne({ id: agencyId }, 'payCard').lean();
  const c = ag && ag.payCard;
  return c && c.number ? { number: c.number, holder: c.holder, bank: c.bank, updatedAt: c.updatedAt } : null;
}

/** Panel: rekvizitni saqlash. O'zgarsa admin chatiga xabar (sezdirmay almashtirib bo'lmasin). */
async function setCard(agencyId, input, by = '') {
  const number = String((input && input.number) || '').replace(/\D/g, '');
  const holder = String((input && input.holder) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const bank = String((input && input.bank) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (number.length < 16 || number.length > 19) fail('Karta raqami 16 ta raqam bo\'lishi kerak');
  if (holder.length < 3) fail('Karta egasining ismini yozing');
  const old = await getCard(agencyId);
  await Restaurant.updateOne({ id: agencyId }, { $set: { payCard: { number, holder, bank, updatedAt: new Date(), updatedBy: by } } });
  if (!old || old.number !== number || old.holder !== holder) {
    await billing.say(await billing.adminChatOf(agencyId),
      `🔐 To'lov kartasi ${old ? 'o\'zgartirildi' : 'qo\'shildi'}: ${masked(number)} · ${holder}${by ? `\nKim: ${by}` : ''}\n` +
      `Agar buni siz qilmagan bo'lsangiz — darhol panelda tekshiring.`);
  }
  return { number, holder, bank, luhn: luhnOk(number) };
}

async function removeCard(agencyId, by = '') {
  const old = await getCard(agencyId);
  await Restaurant.updateOne({ id: agencyId }, { $set: { payCard: { number: '', holder: '', bank: '', updatedAt: new Date(), updatedBy: by } } });
  if (old) await billing.say(await billing.adminChatOf(agencyId), `🔐 To'lov kartasi o'chirildi (${masked(old.number)})${by ? ` — ${by}` : ''}.`);
}

// Mijozga ko'rinadigan holat
function status(o) {
  if (o.status === 'paid') return 'paid';
  if (o.status !== 'pending') return 'canceled';
  if (o.claimedAt) return 'checking';
  if (o.rejectedAt) return 'rejected';
  return 'waiting';
}

function clientView(o, card, c) {
  return {
    id: o.id, code: o.code, planKey: o.planKey, amount: o.amount, provider: o.provider,
    status: status(o), claimedAt: o.claimedAt, createdAt: o.createdAt,
    card: card ? { number: card.number, holder: card.holder, bank: card.bank } : null,
    credits: c ? c.credits : undefined
  };
}

// Botdagi rekvizit xabari (HTML: <code> — Telegram'da bosib nusxa olinadi)
function cardMessage(L, o, card) {
  return I18N.t(L, 'bill.cardMsg', {
    plan: esc(I18N.t(L, 'plan.' + o.planKey)), sum: sum(o.amount), code: o.code,
    card: group(card.number), holder: esc(card.holder), bank: card.bank ? ' · ' + esc(card.bank) : ''
  });
}
const cardKb = (L, o, appBase) => ({ inline_keyboard: [
  [{ text: I18N.t(L, 'bill.cardPaidBtn'), callback_data: 'pc:' + o.id }],
  ...(appBase ? [[{ text: I18N.t(L, 'bill.cardOpenBtn'), web_app: { url: `${appBase}/miniapp.html?open=pay&o=${o.id}` } }]] : [])
] });

/**
 * Buyurtma ochish (yoki shu tarifga ochiq turganini qaytarish — ikki marta
 * bosilsa ikkita buyurtma bo'lmasin). Yangi bo'lsa botga rekvizit xabari.
 */
async function startOrder(client, planKey, appBase = '') {
  if (!PL.isPlan(planKey)) fail('Tarif topilmadi');
  const card = await getCard(client.agencyId);
  if (!card) fail('Karta orqali to\'lov hozircha yoqilmagan');
  let o = await Order.findOne({ agencyId: client.agencyId, clientId: client.id, provider: 'card', status: 'pending', planKey })
    .sort({ createdAt: -1 }).lean();
  if (!o) {
    // Boshqa tarifga ochiq qolgan kartali buyurtma — eskirgan tanlov, bekor
    await Order.updateMany({ agencyId: client.agencyId, clientId: client.id, provider: 'card', status: 'pending', claimedAt: null },
      { $set: { status: 'canceled', canceledAt: new Date() } });
    o = (await billing.createOrder({ client, planKey, provider: 'card', card: masked(card.number) })).toObject();
    const L = billing.langOf(client);
    if (client.tgChatId) {
      await tg.sendMessage(tg.platformToken(), client.tgChatId, cardMessage(L, o, card),
        { parse_mode: 'HTML', reply_markup: cardKb(L, o, appBase) }).catch(e => console.error('[CARD] xabar:', e.message));
    }
  }
  return clientView(o, card);
}

async function getForClient(client, orderId) {
  const o = await Order.findOne({ agencyId: client.agencyId, clientId: client.id, id: orderId }).lean();
  if (!o) fail('Buyurtma topilmadi', 404);
  const card = o.provider === 'card' && o.status === 'pending' ? await getCard(client.agencyId) : null;
  const c = o.status === 'paid' ? await Client.findOne({ agencyId: client.agencyId, id: client.id }, 'credits').lean() : null;
  return clientView(o, card, c);
}

/** Mijoz "To'ladim" — agentlikka tekshirish xabari (takror bosilsa — bir marta) */
async function claim(client, orderId, payer = '') {
  const now = new Date();
  const o = await Order.findOneAndUpdate(
    { agencyId: client.agencyId, clientId: client.id, id: orderId, provider: 'card', status: 'pending', claimedAt: null },
    { $set: { claimedAt: now, payer: String(payer || '').trim().replace(/\s+/g, ' ').slice(0, 60), adminRemindedAt: null } },
    { new: true }).lean();
  if (!o) {
    const ex = await Order.findOne({ agencyId: client.agencyId, clientId: client.id, id: orderId }).lean();
    if (!ex || ex.provider !== 'card') fail('Buyurtma topilmadi', 404);
    return clientView(ex);                                       // allaqachon bosilgan yoki yopilgan
  }
  await notifyAdmin(o, client, false);
  return clientView(o);
}

async function notifyAdmin(o, client, reminder) {
  const c = client || await Client.findOne({ agencyId: o.agencyId, id: o.clientId }, 'name credits').lean();
  const t = new Date(new Date(o.claimedAt).getTime() + 5 * H);
  const hm = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  await billing.say(await billing.adminChatOf(o.agencyId),
    `${reminder ? '⏰ Hali tekshirilmadi! ' : ''}💳 Kartaga to'lov · №${o.code}\n\n` +
    `${c ? c.name : o.clientId} — ${billing.planName('uz', o.planKey)}\n` +
    `Summa: ${sum(o.amount)} so'm\nKartaga: ${o.cardTo}\n` +
    (o.payer ? `To'lovchi: ${o.payer}\n` : '') +
    `"To'ladim" bosildi: ${hm}${o.rejects ? ` (${o.rejects + 1}-urinish)` : ''}\n\n` +
    `Bank ilovasida tushganini tekshiring:`,
    { reply_markup: { inline_keyboard: [[
      { text: '✅ Pul tushdi — yoqish', callback_data: 'bo:' + o.id },
      { text: '❌ Tushmadi', callback_data: 'bx:' + o.id }]] } });
}

/** Agentlik: pul kelmadi — mijozga xabar, buyurtma ochiq qoladi (qayta "To'ladim" bosa oladi) */
async function reject(agencyId, orderId) {
  const o = await Order.findOneAndUpdate({ agencyId, id: orderId, provider: 'card', status: 'pending', claimedAt: { $ne: null } },
    { $set: { claimedAt: null, rejectedAt: new Date() }, $inc: { rejects: 1 } }, { new: true }).lean();
  if (!o) fail('Tekshiriladigan to\'lov topilmadi');
  const c = await Client.findOne({ agencyId, id: o.clientId }).lean();
  if (c) {
    const L = billing.langOf(c);
    await billing.say(c.tgChatId, I18N.t(L, 'bill.cardRejected', { plan: I18N.t(L, 'plan.' + o.planKey), code: o.code, sum: sum(o.amount) }),
      { reply_markup: { inline_keyboard: [[{ text: I18N.t(L, 'bill.cardPaidBtn'), callback_data: 'pc:' + o.id }]] } });
  }
  return o;
}

/** Mijoz o'zi bekor qiladi ("To'ladim" bosilmagan bo'lsa) */
async function cancelByClient(client, orderId) {
  const r = await Order.updateOne({ agencyId: client.agencyId, clientId: client.id, id: orderId, status: 'pending', claimedAt: null },
    { $set: { status: 'canceled', canceledAt: new Date() } });
  if (!r.modifiedCount) fail('Bu buyurtmani bekor qilib bo\'lmaydi');
  return { ok: true };
}

async function tick(now = new Date()) {
  const out = { reminded: 0, expired: 0, adminReminded: 0 };
  const t = now.getTime();
  // 72 soat "To'ladim" bosilmagan — bekor
  const old = await Order.find({ provider: 'card', status: 'pending', claimedAt: null, createdAt: { $lte: new Date(t - EXPIRE_AFTER) } }).lean();
  for (const o of old) {
    const r = await Order.updateOne({ id: o.id, status: 'pending', claimedAt: null }, { $set: { status: 'canceled', canceledAt: now } });
    if (!r.modifiedCount) continue;
    out.expired++;
    const c = await Client.findOne({ agencyId: o.agencyId, id: o.clientId }).lean();
    if (c) { const L = billing.langOf(c); await billing.say(c.tgChatId, I18N.t(L, 'bill.cardExpired', { code: o.code })); }
  }
  // 3 soat — mijozga bir marta eslatma
  const wait = await Order.find({ provider: 'card', status: 'pending', claimedAt: null, cardRemindedAt: null,
    createdAt: { $lte: new Date(t - REMIND_AFTER), $gt: new Date(t - EXPIRE_AFTER) } }).lean();
  for (const o of wait) {
    const r = await Order.updateOne({ id: o.id, cardRemindedAt: null }, { $set: { cardRemindedAt: now } });
    if (!r.modifiedCount) continue;
    const c = await Client.findOne({ agencyId: o.agencyId, id: o.clientId }).lean();
    if (!c || !c.tgChatId) continue;
    const L = billing.langOf(c);
    await billing.say(c.tgChatId, I18N.t(L, 'bill.cardRemind', { plan: I18N.t(L, 'plan.' + o.planKey), code: o.code, sum: sum(o.amount) }),
      { reply_markup: { inline_keyboard: [[{ text: I18N.t(L, 'bill.cardPaidBtn'), callback_data: 'pc:' + o.id }]] } });
    out.reminded++;
  }
  // 2 soat tasdiqlanmagan "To'ladim" — agentlikka bir marta
  const stuck = await Order.find({ provider: 'card', status: 'pending', claimedAt: { $ne: null, $lte: new Date(t - ADMIN_AFTER) }, adminRemindedAt: null }).lean();
  for (const o of stuck) {
    const r = await Order.updateOne({ id: o.id, adminRemindedAt: null }, { $set: { adminRemindedAt: now } });
    if (!r.modifiedCount) continue;
    await notifyAdmin(o, null, true);
    out.adminReminded++;
  }
  return out;
}

module.exports = { getCard, setCard, removeCard, startOrder, getForClient, claim, reject, cancelByClient, tick,
  status, luhnOk, masked, cardMessage, cardKb, REMIND_AFTER, EXPIRE_AFTER, ADMIN_AFTER };
