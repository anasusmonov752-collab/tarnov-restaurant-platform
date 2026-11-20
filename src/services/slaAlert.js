// ── "HR 24 SOAT ICHIDA QO'NG'IROQ QILADI" — VA'DA NAZORATI ──────
// Nomzodga bot (ft.cAsk), kabinet va anketa shunday va'da qiladi. Bu va'dani
// tizim nazorat qilmasdi: ariza tushadi, HR band — nomzod kutib, ishonchni
// yo'qotadi. Endi agentlik admin chatiga ikki bosqich:
//   18 soat — "⏳ 6 soat qoldi"  (hali ulgurish mumkin)
//   24 soat — "⏰ muddat o'tdi"  (bir marta, keyin jim)
// "Qo'ng'iroq qilindi" deb hisoblanadi: panelda "Bog'landim" (Application.contactedAt)
// yoki ariza tushgandan keyin nomzod bilan har qanday birinchi aloqa
// (Candidate.firstContactAt — services/contactLog). Mijoz qaror qilgan
// (shortlisted / rejected) ariza — kutilmaydi. Sinov yozuvlari, 7 kundan eski
// arizalar hisoblanmaydi. Faqat kunduzi (09–21 Toshkent): tunda chegaradan
// o'tganlar ertalab bitta xabarda keladi. Har ariza bosqich bayrog'i atomik
// qo'yiladi (slaWarnAt / slaLateAt) — ikki instansiya ham ikki marta yubormaydi.

const Application = require('../models/Application');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');

const H = 36e5, D = 24 * H;
const WARN_H = 18, LATE_H = 24, WINDOW_D = 7, MAX_LINES = 15;

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Kunduzmi (Toshkent, UTC+5) */
const daytime = now => { const h = (now.getUTCHours() + 5) % 24; return h >= 9 && h < 21; };

/** Bosqich uchun nomzodlar: [{ app, cand, vac, hours }] — hali qo'ng'iroq qilinmaganlar */
async function due(kind, now) {
  const t = now.getTime();
  const [from, to] = kind === 'late'
    ? [t - WINDOW_D * D, t - LATE_H * H]
    : [t - LATE_H * H, t - WARN_H * H];
  const flag = kind === 'late' ? 'slaLateAt' : 'slaWarnAt';
  const rows = await Application.find({
    isTest: { $ne: true }, state: { $in: ['new', 'seen'] }, contactedAt: null,
    createdAt: { $gte: new Date(from), $lte: new Date(to) }, [flag]: null
  }).sort({ createdAt: 1 }).limit(200).lean();
  if (!rows.length) return [];
  const agencies = [...new Set(rows.map(a => a.agencyId))];
  const [cands, vacs] = await Promise.all([
    Candidate.find({ restaurantId: { $in: agencies }, id: { $in: rows.map(a => a.candidateId) } }, 'id fullName phone firstContactAt isTest').lean(),
    Vacancy.find({ agencyId: { $in: agencies }, id: { $in: rows.map(a => a.vacancyId) } }, 'id title status').lean()
  ]);
  const cBy = Object.fromEntries(cands.map(c => [c.id, c]));
  const vBy = Object.fromEntries(vacs.map(v => [v.id, v]));
  const all = rows.map(a => ({ app: a, cand: cBy[a.candidateId], vac: vBy[a.vacancyId], hours: Math.floor((t - new Date(a.createdAt)) / H) }));
  const keep = x => x.cand && !x.cand.isTest
    // Ariza tushgandan keyin nomzod bilan aloqa bo'lgan (Telegram xabari, bosqich) — qo'ng'iroq hisoblanadi
    && !(x.cand.firstContactAt && new Date(x.cand.firstContactAt) >= new Date(x.app.createdAt))
    && (!x.vac || x.vac.status !== 'closed');
  // Kutilmaydiganlarga ham bayroq qo'yiladi (xabarsiz) — har 2 daqiqada qayta o'qilmasin va
  // limit(200) ni egallab, yangi kechikkan arizalarni to'sib qo'ymasin
  const skip = all.filter(x => !keep(x)).map(x => x.app._id);
  if (skip.length) {
    const set = { [flag]: now };
    if (kind === 'late') set.slaWarnAt = now;
    await Application.updateMany({ _id: { $in: skip }, [flag]: null }, { $set: set });
  }
  return all.filter(keep);
}

function messageFor(kind, list) {
  const head = kind === 'late'
    ? `⏰ <b>${list.length} ta arizaga 24 soatdan beri qo'ng'iroq qilinmadi</b>`
    : `⏳ <b>${list.length} ta ariza: 24 soat tugashiga ${LATE_H - WARN_H} soat qoldi</b>`;
  const lines = list.slice(0, MAX_LINES).map((x, i) =>
    `${i + 1}. ${esc(x.cand.fullName || 'Nomsiz')} — ${esc(x.vac ? x.vac.title : 'vakansiya')} · ${x.hours} soat` +
    (x.cand.phone ? `\n    ${esc(x.cand.phone)}` : ''));
  const more = list.length > MAX_LINES ? `\n…va yana ${list.length - MAX_LINES} ta` : '';
  return `${head}\nNomzodga «HR 24 soat ichida qo'ng'iroq qiladi» deganmiz.\n\n${lines.join('\n')}${more}\n\n` +
    `Qo'ng'iroq qilgach panelda «Bog'landim» bosing — ro'yxatdan chiqadi.`;
}

/**
 * Taymer (server.js, har 2 daqiqa). @returns {{ warned:number, late:number }}
 * Bayroq avval qo'yiladi, keyin yuboriladi: xabar ketmasa ham takror spam bo'lmaydi.
 */
async function tick(now = new Date()) {
  const out = { warned: 0, late: 0 };
  if (!daytime(now)) return out;
  for (const kind of ['late', 'warn']) {
    const list = await due(kind, now);
    if (!list.length) continue;
    const flag = kind === 'late' ? 'slaLateAt' : 'slaWarnAt';
    // Atomik egallash — faqat shu chaqiruv bayroqni qo'ygan arizalar xabarga kiradi
    const mine = [];
    for (const x of list) {
      const set = { [flag]: now };
      if (kind === 'late') set.slaWarnAt = x.app.slaWarnAt || now;     // kech qolgan — ogohlantirish ham o'tdi
      const up = await Application.findOneAndUpdate({ _id: x.app._id, [flag]: null }, { $set: set });
      if (up) mine.push(x);
    }
    const byAgency = {};
    for (const x of mine) (byAgency[x.app.agencyId] = byAgency[x.app.agencyId] || []).push(x);
    for (const [agencyId, items] of Object.entries(byAgency)) {
      try {
        const ag = await Restaurant.findOne({ id: agencyId }, 'telegram').lean();
        const chat = ag && ag.telegram && ag.telegram.adminChatId;
        if (!chat) continue;
        const base = (process.env.APP_URL || '').replace(/\/+$/, '');
        await tg.sendMessage(tg.platformToken(), chat, messageFor(kind, items), Object.assign({ parse_mode: 'HTML' },
          base ? { reply_markup: { inline_keyboard: [[{ text: '📨 Arizalarni ochish', url: base + '/arizalar.html' }]] } } : {}));
      } catch (e) { console.error('[SLA] xabar ketmadi:', e.message); }
    }
    out[kind === 'late' ? 'late' : 'warned'] += mine.length;
  }
  return out;
}

module.exports = { tick, due, messageFor, WARN_H, LATE_H };
