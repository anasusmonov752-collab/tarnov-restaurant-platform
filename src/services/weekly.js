// ── HAFTALIK HISOBOT — ADMIN CHATIGA, DUSHANBA ERTALAB ────────
// Reja (Anas): avval nomzod bazasini yig'ish, ma'lum miqdordan keyin restoranlar.
// "Ma'lum miqdor"ga yetdikmi, va'da ("HR 24 soatda qo'ng'iroq qiladi") bajarilyaptimi —
// buni bilish uchun to'rt sahifani ochish kerak edi. Endi har dushanba 09:00–13:00
// (Toshkent) bitta xabar: o'tgan 7 kun raqamlari BAZADAN (to'qima raqam yo'q).
//   • yangi nomzodlar (manba bo'yicha), arizalar va ulardan 24 soat ichida qo'ng'iroq qilingani
//   • hozir qo'ng'iroq kutayotganlar (services/callQueue — panel bilan bir xil qoida)
//   • qo'ng'iroq natijalari, ish beruvchiga taklif, ochilgan kontakt, ishga olingan
//   • "Hali ish qidiryapsizmi?" (services/lookCheck) javoblari
//   • faol baza lavozim bo'yicha — oxirgi 30 kunda ro'yxatdan o'tgan yoki tasdiqlagan
// Haftada bir marta: Restaurant.weeklyReportAt atomik qo'yiladi (ikki instansiya — bitta xabar).

const Candidate = require('../models/Candidate');
const Application = require('../models/Application');
const Shortlist = require('../models/Shortlist');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const { roleLabel } = require('../data/roles');

const H = 36e5, DAY = 24 * H, TZ = 5 * H;
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const SRC = { anketa: 'anketa', hh: 'hh.uz', manual: 'qo\'lda', telegram: 'Telegram', referral: 'tavsiya' };

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Shu haftaning dushanbasi 00:00 (Toshkent), UTC Date sifatida */
function weekStart(now = new Date()) {
  const local = new Date(now.getTime() + TZ);
  const dow = (local.getUTCDay() + 6) % 7;            // 0 = dushanba
  const day0 = Math.floor(local.getTime() / DAY) * DAY - dow * DAY;
  return new Date(day0 - TZ);
}

/** Hisobot vaqti: dushanba 09:00–13:00 Toshkent */
function sendWindow(now = new Date()) {
  const local = new Date(now.getTime() + TZ);
  return local.getUTCDay() === 1 && local.getUTCHours() >= 9 && local.getUTCHours() < 13;
}

function rangeLabel(from, to) {
  const a = new Date(from.getTime() + TZ), b = new Date(to.getTime() + TZ - 1);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()}-${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()}-${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()}-${MONTHS[b.getUTCMonth()]}`;
}

/** Raqamlar (yubormasdan — test va panel uchun ham) */
async function build(agencyId, now = new Date()) {
  const to = weekStart(now), from = new Date(to.getTime() - 7 * DAY);
  const win = { $gte: from, $lt: to };
  const testClients = await Client.distinct('id', { agencyId, isTest: true });
  const noTest = { isTest: { $ne: true } };

  const [bySource, apps, results, look, base, sl] = await Promise.all([
    Candidate.aggregate([{ $match: { restaurantId: agencyId, isTest: { $ne: true }, createdAt: win } },
      { $group: { _id: '$source', n: { $sum: 1 } } }]),
    Application.find(Object.assign({ agencyId, createdAt: win, clientId: { $nin: testClients } }, noTest),
      'createdAt contactedAt state decidedAt').lean(),
    Candidate.aggregate([{ $match: { restaurantId: agencyId, isTest: { $ne: true }, callLastAt: win } },
      { $group: { _id: '$callLast', n: { $sum: 1 } } }]),
    Candidate.aggregate([{ $match: { restaurantId: agencyId, isTest: { $ne: true }, lookAskedAt: win } },
      { $group: { _id: null, asked: { $sum: 1 },
        yes: { $sum: { $cond: [{ $and: [{ $eq: ['$jobStatus', 'active'] }, { $gte: ['$jobStatusAt', '$lookAskedAt'] }] }, 1, 0] } },
        no: { $sum: { $cond: [{ $and: [{ $eq: ['$jobStatus', 'not_looking'] }, { $gte: ['$jobStatusAt', '$lookAskedAt'] }] }, 1, 0] } } } }]),
    Candidate.aggregate([{ $match: { restaurantId: agencyId, isTest: { $ne: true }, jobStatus: { $ne: 'not_looking' },
        status: { $nin: ['hired', 'rejected'] },
        $or: [{ createdAt: { $gte: new Date(to.getTime() - 30 * DAY) } }, { jobStatusAt: { $gte: new Date(to.getTime() - 30 * DAY) } }] } },
      { $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Shortlist.aggregate([{ $match: { agencyId, clientId: { $nin: testClients } } }, { $unwind: '$items' },
      { $group: { _id: null,
        revealed: { $sum: { $cond: [{ $and: [{ $gte: ['$items.revealedAt', from] }, { $lt: ['$items.revealedAt', to] }] }, 1, 0] } },
        hired: { $sum: { $cond: [{ $and: [{ $eq: ['$items.state', 'hired'] }, { $gte: ['$items.decidedAt', from] }, { $lt: ['$items.decidedAt', to] }] }, 1, 0] } } } }])
  ]);
  const calls = await require('./callQueue').counts(agencyId, now);
  const cnt = arr => Object.fromEntries(arr.map(x => [x._id || '', x.n]));
  const src = cnt(bySource), res = cnt(results);
  return {
    from, to, label: rangeLabel(from, to),
    newCands: Object.values(src).reduce((s, n) => s + n, 0), bySource: src,
    apps: apps.length,
    called24: apps.filter(a => a.contactedAt && new Date(a.contactedAt) - new Date(a.createdAt) <= DAY).length,
    proposed: await Application.countDocuments(Object.assign({ agencyId, state: 'shortlisted', decidedAt: win, clientId: { $nin: testClients } }, noTest)),
    calls, results: res,
    look: look[0] || { asked: 0, yes: 0, no: 0 },
    base: base.map(b => ({ role: b._id, n: b.n })), baseTotal: base.reduce((s, b) => s + b.n, 0),
    revealed: (sl[0] || {}).revealed || 0, hired: (sl[0] || {}).hired || 0
  };
}

function messageFor(r) {
  const L = [`📊 <b>Haftalik hisobot</b> · ${r.label}`, ''];
  const srcTxt = Object.entries(r.bySource).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${SRC[k] || k || 'boshqa'} ${n}`).join(', ');
  L.push(`Yangi nomzodlar: <b>${r.newCands}</b>${srcTxt ? ` (${esc(srcTxt)})` : ''}`);
  L.push(`Arizalar: <b>${r.apps}</b>` + (r.apps ? ` — 24 soat ichida qo'ng'iroq: ${r.called24} tasiga` : ''));
  L.push(`Hozir qo'ng'iroq kutmoqda: <b>${r.calls.due}</b>` + (r.calls.late ? ` (${r.calls.late} tasi 24 soatdan oshgan)` : '')
    + (r.calls.later ? ` · ertaga yana ${r.calls.later}` : ''));
  const rs = r.results, marked = (rs.talked || 0) + (rs.noanswer || 0) + (rs.unreachable || 0) + (rs.unfit || 0);
  if (marked) {
    L.push(`Qo'ng'iroq natijasi: gaplashildi ${rs.talked || 0}, javob bermadi ${(rs.noanswer || 0) + (rs.unreachable || 0)}, mos emas ${rs.unfit || 0}`);
  }
  L.push(`Ish beruvchiga taklif: ${r.proposed} · kontakt ochildi: ${r.revealed} · ishga olindi: ${r.hired}`);
  if (r.look.asked) L.push(`«Hali ish qidiryapsizmi?»: ${r.look.asked} kishiga — ha ${r.look.yes}, yo'q ${r.look.no}, javobsiz ${r.look.asked - r.look.yes - r.look.no}`);
  L.push('');
  L.push(`Faol baza (30 kun): <b>${r.baseTotal}</b>`);
  if (r.base.length) L.push(esc(r.base.slice(0, 6).map(b => `${roleLabel(b.role)} ${b.n}`).join(' · ')));
  return L.join('\n');
}

/** Taymer (server.js, har 2 daqiqa). @returns {{ sent:number }} */
async function tick(now = new Date(), { send } = {}) {
  const out = { sent: 0 };
  if (!sendWindow(now)) return out;
  const ws = weekStart(now);
  const ags = await Restaurant.find({ kind: 'agency', 'telegram.adminChatId': { $nin: ['', null] }, active: { $ne: false } }, 'id telegram').lean();
  const doSend = send || ((chat, text, opts) => tg.sendMessage(tg.platformToken(), chat, text, opts));
  for (const ag of ags) {
    const own = await Restaurant.findOneAndUpdate(
      { id: ag.id, $or: [{ weeklyReportAt: null }, { weeklyReportAt: { $lt: ws } }] }, { $set: { weeklyReportAt: now } });
    if (!own) continue;
    try {
      const r = await build(ag.id, now);
      const base = (process.env.APP_URL || '').replace(/\/+$/, '');
      await doSend(ag.telegram.adminChatId, messageFor(r), Object.assign({ parse_mode: 'HTML' },
        base ? { reply_markup: { inline_keyboard: [[{ text: '📞 Qo\'ng\'iroqlar', url: base + '/qongiroq.html' },
          { text: '📈 Analitika', url: base + '/analitika.html' }]] } } : {}));
      out.sent++;
    } catch (e) { console.error('[WEEKLY] hisobot ketmadi:', e.message); }
  }
  return out;
}

module.exports = { tick, build, messageFor, weekStart, sendWindow };
