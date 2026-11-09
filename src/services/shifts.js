// ── SMENA BOZORI (MVP, beta) ─────────────────────────────────
// Mijoz Mini App'da bir martalik smena e'lon qiladi (create) -> mos
// nomzodlarga bot xabari "✅ Olaman" bilan (broadcast) -> birinchi
// bosganlar band qiladi (atomik: bookedN < slots) -> mijozga ism va telefon.
// tick(): 2 soat oldin band qilganlarga eslatma; smena tugagach mijozdan
// "keldi / kelmadi" so'raladi — natija ishonchlilik tarixiga (reliability).
// Tugmalar (callback):
//   sh:b:<id>        nomzod band qiladi       sh:c:<id>  nomzod bekor qiladi
//   sh:x:<id>        nomzod smena takliflarini o'chiradi
//   sh:k|n:<id>:<cid> mijoz: keldi | kelmadi
// Beta: kredit yechilmaydi (yakuniy hisobotda aytilgan).

const crypto = require('crypto');
const Shift = require('../models/Shift');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');
const { isValidRole } = require('../data/roles');

const H = 3600e3, TZ = 5 * H;                    // Toshkent UTC+5
const MAX_SEND = 40;                             // bitta smena — ko'pi bilan 40 nomzodga
const OFFER_GAP = 6 * H;                         // bitta nomzodga 6 soatda bittadan ko'p taklif yo'q
const T = (lang, k, v) => I18N.t(lang, k, v);
const langOf = x => I18N.resolve(x && x.lang, x && x.tgLang);
const reachable = c => !!(c && c.tgChatId && !['blocked', 'stopped'].includes(c.tgState));
const send = (chatId, text, opts) => chatId
  ? tg.sendMessage(tg.platformToken(), chatId, text, opts || {}).catch(e => { console.error('[SH] xabar ketmadi:', e.message); return null; })
  : Promise.resolve(null);
const kb = rows => ({ reply_markup: { inline_keyboard: rows } });
const fmtSum = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** "2026-11-12" + "18:00" (Toshkent) -> Date */
function tashkentDate(day, hm) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - TZ);
}
/** Date -> {day:"12.11", hm:"18:00", wd} Toshkent bo'yicha */
function local(dt) {
  const x = new Date(new Date(dt).getTime() + TZ);
  const p = n => String(n).padStart(2, '0');
  return { day: `${p(x.getUTCDate())}.${p(x.getUTCMonth() + 1)}`, hm: `${p(x.getUTCHours())}:${p(x.getUTCMinutes())}`, wd: (x.getUTCDay() + 6) % 7 };
}
function whenText(s, L) {
  const a = local(s.startAt), b = local(s.endAt);
  const wd = T(L, 'ivx.wd').split(',')[a.wd] || '';
  return `${wd} ${a.day}, ${a.hm}–${b.hm}`;
}

/** Forma -> tekshirilgan smena maydonlari yoki {error} */
function validate(b = {}, now = new Date()) {
  const role = String(b.role || '');
  if (!isValidRole(role)) return { error: 'Lavozimni tanlang' };
  const startAt = tashkentDate(b.date, b.from);
  let endAt = tashkentDate(b.date, b.to);
  if (!startAt || !endAt) return { error: 'Sana va vaqtni kiriting' };
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24 * H);     // tungi smena: 18:00–02:00
  if (startAt - now < H) return { error: 'Smena kamida 1 soatdan keyin boshlanishi kerak' };
  if (startAt - now > 14 * 24 * H) return { error: 'Smena 14 kundan uzoq bo\'lmasin' };
  if (endAt - startAt > 16 * H) return { error: 'Smena 16 soatdan uzun bo\'lmasin' };
  const pay = Math.round(Number(String(b.pay || '').replace(/\D/g, '')) || 0);
  if (pay < 50000) return { error: 'Smena uchun to\'lovni kiriting (kamida 50 000)' };
  const slots = Math.min(10, Math.max(1, parseInt(b.slots, 10) || 1));
  return { role, startAt, endAt, pay, slots,
    address: String(b.address || '').trim().slice(0, 200), note: String(b.note || '').trim().slice(0, 300) };
}

function offerText(s, client, L) {
  return [
    T(L, 'sh.offer', { r: T(L, 'role.' + s.role) }), '',
    `🕘 ${whenText(s, L)}`,
    `💰 ${T(L, 'sh.pay', { s: fmtSum(s.pay) })}`,
    client && client.location ? `📍 ${client.location}` : '',
    s.note ? `ℹ️ ${s.note}` : '',
    s.slots > 1 ? T(L, 'sh.slots', { n: s.slots }) : '',
    '', T(L, 'sh.offerHint')
  ].filter((x, i, a) => x !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

/** Mos nomzodlarga yuborish. Tartib: shu tumandagilar oldin. */
async function broadcast(s, client) {
  const q = { restaurantId: s.agencyId, role: s.role, tgChatId: { $gt: '' }, tgState: { $nin: ['blocked', 'stopped'] },
    status: { $nin: ['rejected', 'hired'] }, jobStatus: { $ne: 'not_looking' }, shiftOptOut: { $ne: true },
    isTest: s.isTest ? true : { $ne: true },
    $or: [{ shiftOfferAt: null }, { shiftOfferAt: { $lt: new Date(Date.now() - OFFER_GAP) } }] };
  const list = await Candidate.find(q, 'id tgChatId tgState lang tgLang location').limit(400).lean();
  const loc = String((client && client.location) || '').toLowerCase();
  list.sort((a, b) => (String(b.location || '').toLowerCase() === loc) - (String(a.location || '').toLowerCase() === loc));
  let n = 0;
  for (const c of list.slice(0, MAX_SEND)) {
    const L = langOf(c);
    const ok = await send(c.tgChatId, offerText(s, client, L), kb([
      [{ text: T(L, 'sh.take'), callback_data: `sh:b:${s.id}` }],
      [{ text: T(L, 'sh.optOut'), callback_data: `sh:x:${s.id}` }]
    ]));
    if (ok) { n++; await Candidate.updateOne({ restaurantId: s.agencyId, id: c.id }, { $set: { shiftOfferAt: new Date() } }); }
  }
  await Shift.updateOne({ _id: s._id }, { $set: { sentN: n } });
  return n;
}

async function create(client, body, { now = new Date(), notify = true } = {}) {
  const v = validate(body, now);
  if (v.error) return v;
  const open = await Shift.countDocuments({ agencyId: client.agencyId, clientId: client.id, status: { $in: ['open', 'full'] }, endAt: { $gt: now } });
  if (open >= 10) return { error: 'Ochiq smenalar juda ko\'p (10 tagacha)' };
  const s = await Shift.create(Object.assign(v, { id: crypto.randomBytes(5).toString('hex'),
    agencyId: client.agencyId, clientId: client.id, address: v.address || client.address || '', isTest: !!client.isTest }));
  const sent = notify ? await broadcast(s, client) : 0;
  return { ok: true, shift: s.toObject(), sent };
}

async function cancel(client, id) {
  const s = await Shift.findOneAndUpdate({ agencyId: client.agencyId, clientId: client.id, id, status: { $in: ['open', 'full'] } },
    { $set: { status: 'cancelled' } }, { new: true }).lean();
  if (!s) return { error: 'Smena topilmadi' };
  const ids = s.booked.map(b => b.candidateId);
  if (ids.length) {
    const cands = await Candidate.find({ restaurantId: s.agencyId, id: { $in: ids } }, 'tgChatId tgState lang tgLang').lean();
    for (const c of cands) if (reachable(c)) await send(c.tgChatId, T(langOf(c), 'sh.cancelled', { w: whenText(s, langOf(c)) }));
  }
  return { ok: true };
}

/** Mijoz: smenadan keyin belgilash (Mini App ham, bot tugmasi ham) */
async function mark(client, id, candidateId, came) {
  const s = await Shift.findOneAndUpdate(
    { agencyId: client.agencyId, clientId: client.id, id, booked: { $elemMatch: { candidateId, state: 'booked' } }, startAt: { $lt: new Date() } },
    { $set: { 'booked.$.state': came ? 'came' : 'noshow' } }, { new: true }).lean();
  if (!s) return { error: 'Belgilab bo\'lmaydi' };
  if (!s.booked.some(b => b.state === 'booked')) await Shift.updateOne({ _id: s._id }, { $set: { status: 'done' } });
  if (!came) {
    try {
      const ag = await Restaurant.findOne({ id: s.agencyId }, 'telegram').lean();
      const cand = await Candidate.findOne({ restaurantId: s.agencyId, id: candidateId }, 'fullName phone').lean();
      const chat = ag && ag.telegram && ag.telegram.adminChatId;
      if (chat) await send(chat, `🚩 Smenaga kelmadi: ${(cand && cand.fullName) || candidateId} ${(cand && cand.phone) || ''} — ${client.name}, ${whenText(s, 'uz')}`);
    } catch (e) { /* jim */ }
  }
  return { ok: true };
}

/** Mijozning smenalari (Mini App) — band qilganlar ism va telefon bilan */
async function listFor(client, lang) {
  const list = await Shift.find({ agencyId: client.agencyId, clientId: client.id, status: { $ne: 'cancelled' } })
    .sort({ startAt: -1 }).limit(30).lean();
  const ids = [...new Set(list.flatMap(s => s.booked.map(b => b.candidateId)))];
  const cands = ids.length ? await Candidate.find({ restaurantId: client.agencyId, id: { $in: ids } }, 'id fullName phone').lean() : [];
  const by = Object.fromEntries(cands.map(c => [c.id, c]));
  const now = Date.now();
  return list.map(s => ({
    id: s.id, role: s.role, when: whenText(s, lang), pay: s.pay, slots: s.slots, status: s.status, sentN: s.sentN,
    past: new Date(s.startAt).getTime() < now, upcoming: new Date(s.endAt).getTime() > now,
    booked: s.booked.map(b => ({ candidateId: b.candidateId, state: b.state,
      name: (by[b.candidateId] && by[b.candidateId].fullName) || '—', phone: (by[b.candidateId] && by[b.candidateId].phone) || '' }))
  }));
}

const CB_RE = /^sh:(b|c|x|k|n):([0-9a-f]{10})(?::([A-Za-z0-9_-]{1,64}))?$/;

async function handleCallback({ data, chatId }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, id, cid] = m;
  const s = await Shift.findOne({ id }).lean();
  if (!s) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };

  // Mijoz tugmalari
  if (op === 'k' || op === 'n') {
    const client = await Client.findOne({ agencyId: s.agencyId, id: s.clientId }).lean();
    const L = langOf(client);
    if (!client || String(client.tgChatId) !== String(chatId)) return { ok: false, text: T(L, 'ivx.notYours'), alert: true };
    const r = await mark(client, id, cid, op === 'k');
    if (r.error) return { ok: true, text: '✓' };
    return { ok: true, text: '✓', edit: T(L, op === 'k' ? 'sh.markedCame' : 'sh.markedNo') };
  }

  const cand = await Candidate.findOne({ restaurantId: s.agencyId, tgChatId: String(chatId) }, 'id fullName phone tgChatId lang tgLang isTest').lean();
  const L = langOf(cand);
  if (!cand) return { ok: false, text: T(L, 'ivx.notYours'), alert: true };

  if (op === 'x') {
    await Candidate.updateOne({ restaurantId: s.agencyId, id: cand.id }, { $set: { shiftOptOut: true } });
    return { ok: true, text: '✓', edit: T(L, 'sh.optedOut') };
  }

  if (op === 'b') {
    if (!!cand.isTest !== !!s.isTest) return { ok: false, text: T(L, 'ivx.notYours'), alert: true };
    if (s.booked.some(b => b.candidateId === cand.id)) return { ok: true, text: T(L, 'sh.already'), alert: true };
    if (new Date(s.startAt) <= new Date()) return { ok: true, text: T(L, 'sh.late'), alert: true, edit: T(L, 'sh.late') };
    const up = await Shift.findOneAndUpdate(
      { _id: s._id, status: 'open', 'booked.candidateId': { $ne: cand.id }, $expr: { $lt: ['$bookedN', '$slots'] } },
      { $inc: { bookedN: 1 }, $push: { booked: { candidateId: cand.id, at: new Date() } } }, { new: true }).lean();
    if (!up) return { ok: true, text: T(L, 'sh.taken'), alert: true, edit: T(L, 'sh.taken') };
    if (up.bookedN >= up.slots) await Shift.updateOne({ _id: up._id, status: 'open' }, { $set: { status: 'full' } });
    const client = await Client.findOne({ agencyId: s.agencyId, id: s.clientId }).lean();
    // Mijozga — kim keladi (beta: kredit yechilmaydi)
    if (client && client.tgChatId) {
      const CL = langOf(client);
      await send(client.tgChatId, T(CL, 'sh.toClient', { n: cand.fullName || '—', p: cand.phone || '—',
        r: T(CL, 'role.' + s.role), w: whenText(s, CL), a: up.bookedN, b: up.slots }));
    }
    const lines = [T(L, 'sh.booked', { w: whenText(s, L) }),
      (s.address || (client && client.address)) ? `📍 ${s.address || client.address}` : '',
      client && client.phone ? `📞 ${client.phone}` : '', '', T(L, 'sh.bookedHint')].filter((x, i, a) => x !== '' || a[i - 1] !== '');
    return { ok: true, text: '✅', edit: lines.join('\n'),
      keyboard: [[{ text: T(L, 'sh.cancelBtn'), callback_data: `sh:c:${s.id}` }]] };
  }

  if (op === 'c') {
    if (new Date(s.startAt) - new Date() < 2 * H) return { ok: true, text: T(L, 'sh.tooLateCancel'), alert: true };
    const up = await Shift.findOneAndUpdate({ _id: s._id, booked: { $elemMatch: { candidateId: cand.id, state: 'booked' } } },
      { $pull: { booked: { candidateId: cand.id } }, $inc: { bookedN: -1 } }, { new: true }).lean();
    if (!up) return { ok: true, text: '✓' };
    if (up.status === 'full') await Shift.updateOne({ _id: up._id, status: 'full' }, { $set: { status: 'open' } });
    const client = await Client.findOne({ agencyId: s.agencyId, id: s.clientId }, 'tgChatId lang tgLang').lean();
    if (client && client.tgChatId) await send(client.tgChatId, T(langOf(client), 'sh.candCancelled', { n: cand.fullName || '—', w: whenText(s, langOf(client)) }));
    return { ok: true, text: '✓', edit: T(L, 'sh.youCancelled') };
  }
  return { ok: false, text: '' };
}

/** server.js har 2 daqiqada: eslatma (2 soat oldin) va smenadan keyingi so'rov */
async function tick(now = new Date()) {
  // 1) 2 soat oldin eslatma — har band qilganga bir marta (atomik)
  const soon = await Shift.find({ status: { $in: ['open', 'full'] }, startAt: { $gt: now, $lte: new Date(now.getTime() + 2 * H) },
    booked: { $elemMatch: { state: 'booked', remindedAt: null } } }).limit(50).lean();
  for (const s of soon) {
    for (const b of s.booked.filter(x => x.state === 'booked' && !x.remindedAt)) {
      const claim = await Shift.updateOne({ _id: s._id, booked: { $elemMatch: { candidateId: b.candidateId, remindedAt: null } } },
        { $set: { 'booked.$.remindedAt': now } });
      if (!claim.modifiedCount) continue;
      const c = await Candidate.findOne({ restaurantId: s.agencyId, id: b.candidateId }, 'tgChatId tgState lang tgLang').lean();
      if (reachable(c)) await send(c.tgChatId, T(langOf(c), 'sh.remind', { w: whenText(s, langOf(c)), a: s.address || '—' }));
    }
  }
  // 2) Smena tugadi — mijozdan har band qilgan uchun "keldimi?"
  const ended = await Shift.find({ status: { $in: ['open', 'full'] }, endAt: { $lte: now }, askedAt: null }).limit(50).lean();
  for (const s of ended) {
    const claim = await Shift.updateOne({ _id: s._id, askedAt: null }, { $set: { askedAt: now, status: s.booked.length ? s.status : 'done' } });
    if (!claim.modifiedCount || !s.booked.length) continue;
    const client = await Client.findOne({ agencyId: s.agencyId, id: s.clientId }, 'tgChatId lang tgLang').lean();
    if (!client || !client.tgChatId) continue;
    const L = langOf(client);
    const cands = await Candidate.find({ restaurantId: s.agencyId, id: { $in: s.booked.map(b => b.candidateId) } }, 'id fullName').lean();
    for (const c of cands) {
      await send(client.tgChatId, T(L, 'sh.ask', { n: c.fullName || '—', w: whenText(s, L) }), kb([[
        { text: T(L, 'sh.came'), callback_data: `sh:k:${s.id}:${c.id}` },
        { text: T(L, 'sh.noshow'), callback_data: `sh:n:${s.id}:${c.id}` }]]));
    }
  }
}

module.exports = { create, cancel, mark, listFor, handleCallback, tick, validate, tashkentDate, broadcast, CB_RE };
