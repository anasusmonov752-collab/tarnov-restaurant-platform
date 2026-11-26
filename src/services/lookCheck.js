// ── "HALI ISH QIDIRYAPSIZMI?" — NOMZOD BAZASI TIRIK BO'LSIN ────
// Reja: avval nomzod bazasini yig'ish, keyin restoranlar bilan ishlash. Lekin ko'k
// yoqa nomzodi 1–2 haftada ish topadi: bir oy oldingi baza restoranga "o'lik"
// kontakt bo'lib ketadi (mijoz pul to'lab, "allaqachon ishlayapman" eshitadi).
// Botdagi 'cp'/'cn' tugmalari (routes/telegram) va jobStatus (mijoz qidiruvi
// 'not_looking' ni chiqarmaydi, applyReveal tasdiq sanasini hisobga oladi) bor edi —
// faqat savolni hech kim yubormasdi. Endi:
//   • Telegramga ulangan, sinov emas, ishga olinmagan/rad etilmagan, suhbat/sinovda emas;
//   • oxirgi tasdig'i (jobStatusAt, bo'lmasa ro'yxatdan o'tgan sana) 14 kundan eski;
//   • oxirgi 14 kunda ariza bermagan (ariza — o'zi faollik) va so'ralmagan;
//   • faqat kunduzi 10:00–20:00 (Toshkent), bir tick'da 20 ta — bot limitiga tegmaydi.
// lookAskedAt atomik qo'yiladi (ikki instansiya bir odamga ikki marta yozmaydi).
// Javob bermagan nomzod — o'zgarishsiz (14 kundan keyin yana so'raladi).

const Candidate = require('../models/Candidate');
const Application = require('../models/Application');
const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');
const { nameWord } = require('./outreach');

const DAY = 864e5;
const ASK_AFTER_D = 14;
const MAX_PER_TICK = 20;

const askHours = now => { const h = (now.getUTCHours() + 5) % 24; return h >= 10 && h < 20; };

/** Kimga so'rov kerak — yubormasdan */
async function due(now = new Date(), limit = MAX_PER_TICK) {
  const cut = new Date(now.getTime() - ASK_AFTER_D * DAY);
  const rows = await Candidate.find({
    tgState: 'linked', tgChatId: { $nin: ['', null] }, isTest: { $ne: true },
    // Suhbat / sinov bosqichidagidan "hali ish qidiryapsizmi?" deb so'ralmaydi — jarayon bizda
    jobStatus: { $ne: 'not_looking' }, status: { $nin: ['hired', 'rejected', 'interview', 'interview2', 'trial'] },
    createdAt: { $lte: cut },
    $and: [
      { $or: [{ jobStatusAt: null }, { jobStatusAt: { $lte: cut } }] },
      { $or: [{ lookAskedAt: null }, { lookAskedAt: { $lte: cut } }] }
    ]
  }, 'id restaurantId tgChatId fullName lang tgLang jobStatusAt').sort({ jobStatusAt: 1, createdAt: 1 }).limit(limit * 3).lean();
  if (!rows.length) return [];
  const recent = new Set(await Application.distinct('candidateId',
    { candidateId: { $in: rows.map(c => c.id) }, createdAt: { $gt: cut } }));
  return rows.filter(c => !recent.has(c.id)).slice(0, limit);
}

function messageFor(c) {
  const lang = I18N.resolve(c.lang, c.tgLang);
  const nm = nameWord(c.fullName);
  let text = I18N.t(lang, 'lk.ask', { name: nm ? nm + ', ' : '' });
  if (!nm) text = text.replace(/^(👋 )(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());
  return { lang, text, markup: { inline_keyboard: [[
    { text: I18N.t(lang, 'lk.yes'), callback_data: 'cp' },
    { text: I18N.t(lang, 'lk.no'), callback_data: 'cn' }
  ]] } };
}

/** Taymer (server.js, har 2 daqiqa). @returns {{ sent:number }} */
async function tick(now = new Date(), { send } = {}) {
  const out = { sent: 0 };
  if (!askHours(now)) return out;
  const cut = new Date(now.getTime() - ASK_AFTER_D * DAY);
  const doSend = send || ((chat, text, opts) => tg.sendMessage(tg.platformToken(), chat, text, opts));
  for (const c of await due(now)) {
    const own = await Candidate.findOneAndUpdate(
      { _id: c._id, $or: [{ lookAskedAt: null }, { lookAskedAt: { $lte: cut } }] },
      { $set: { lookAskedAt: now } });
    if (!own) continue;
    const m = messageFor(c);
    try { await doSend(c.tgChatId, m.text, { reply_markup: m.markup }); out.sent++; }
    // 403 — telegram servisi nomzodni 'blocked' qiladi; qolganida jim (14 kundan keyin yana)
    catch (e) { console.error('[LOOK] xabar ketmadi:', e.message); }
  }
  return out;
}

module.exports = { tick, due, messageFor, ASK_AFTER_D };
