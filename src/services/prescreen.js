// ── ARIZADAN KEYIN BOTDA DASTLABKI TEKSHIRUV ─────────────────
// HR har arizachiga qo'ng'iroq qilib "shartlar mosmi, qachon chiqasiz,
// yo'l qancha" deb so'rardi — nomzod boshiga 5-10 daqiqa. Endi bot o'zi:
//   1/3 shartlar (joy, smena, maosh) mosmi?   ✅ / 💬 maosh / ❌ (nima?)
//   2/3 qachondan chiqa olasiz?
//   3/3 yo'l qancha vaqt oladi?
//   + ixtiyoriy 20-30 soniyalik ovozli tanishuv (mijoz Telegramda eshitadi)
// Javoblar Application.screen'ga, moslik bali (services/matchScore) shundan.
// Faqat Telegramdagi nomzod (anketa/bot orqali kelgan). Ariza oqimi
// yagona — services/applications.submit shu yerni chaqiradi.

const Application = require('../models/Application');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const tg = require('./telegram');
const vac = require('./vacancy');
const I18N = require('../../public/js/th-i18n');

const H = 3600e3;
const T = (lang, k, v) => I18N.t(lang, k, v);
const langOf = c => I18N.resolve(c && c.lang, c && c.tgLang);
const reachable = c => !!(c && c.tgChatId && !['blocked', 'stopped'].includes(c.tgState));
const kb = rows => ({ reply_markup: { inline_keyboard: rows } });
const cb = (op, a, val) => `ps:${op}:${a.id}` + (val ? ':' + val : '');
const send = (chatId, text, opts) => tg.sendMessage(tg.platformToken(), chatId, text, opts || {})
  .catch(e => { console.error('[PS] xabar ketmadi:', e.message); return null; });

// Shartlar qatori: joy · smena · maosh (vakansiyada bori)
function termsOf(v, lang) {
  const shift = v.shift ? T(lang, 'shift.' + v.shift) : '';
  return [[v.location, v.landmark].filter(Boolean).join(', '), shift, vac.salaryText(v, lang)].filter(Boolean).join(' · ');
}

// Savollar ro'yxati: anketada "qachondan" javob berilgan bo'lsa (startPre) — so'ralmaydi
const stepsOf = scr => (scr && scr.startPre) ? ['fit', 'commute'] : ['fit', 'start', 'commute'];
const numOf = (step, scr) => { const L = stepsOf(scr); return { i: L.indexOf(step) + 1, n: L.length }; };

// Anketadagi "qachondan" (Candidate.availableFrom) -> now | week | later
function startFromDate(d, now = new Date()) {
  if (!d) return '';
  const days = (new Date(d).getTime() - now.getTime()) / 864e5;
  return days <= 2 ? 'now' : days <= 8 ? 'week' : 'later';
}

/** Savol xabari (step bo'yicha) */
function question(step, a, v, lang) {
  const num = numOf(step, a.screen);
  if (step === 'fit') {
    const terms = termsOf(v, lang);
    return [T(lang, 'ps.q1', Object.assign({ t: terms || T(lang, 'ps.termsNone') }, num)),
      kb([[{ text: T(lang, 'ps.fitOk'), callback_data: cb('f', a, 'ok') }],
          [{ text: T(lang, 'ps.fitSal'), callback_data: cb('f', a, 'sal') }],
          [{ text: T(lang, 'ps.fitNo'), callback_data: cb('f', a, 'no') }]])];
  }
  if (step === 'fitWhy') {
    return [T(lang, 'ps.qWhy'), kb([
      [{ text: T(lang, 'ps.whySal'), callback_data: cb('w', a, 'sal') }, { text: T(lang, 'ps.whyFar'), callback_data: cb('w', a, 'far') }],
      [{ text: T(lang, 'ps.whyShift'), callback_data: cb('w', a, 'shift') }, { text: T(lang, 'ps.whyOther'), callback_data: cb('w', a, 'other') }]])];
  }
  if (step === 'start') {
    return [T(lang, 'ps.q2', num), kb([
      [{ text: T(lang, 'ps.stNow'), callback_data: cb('s', a, 'now') }, { text: T(lang, 'ps.stWeek'), callback_data: cb('s', a, 'week') }],
      [{ text: T(lang, 'ps.stLater'), callback_data: cb('s', a, 'later') }],
      [{ text: T(lang, 'ps.stBusy'), callback_data: cb('s', a, 'busy') }]])];
  }
  if (step === 'commute') {
    return [T(lang, 'ps.q3', num), kb([
      [{ text: T(lang, 'ps.c30'), callback_data: cb('c', a, '30') }, { text: T(lang, 'ps.c60'), callback_data: cb('c', a, '60') }],
      [{ text: T(lang, 'ps.c90'), callback_data: cb('c', a, '90') }, { text: T(lang, 'ps.cNa'), callback_data: cb('c', a, 'na') }]])];
  }
  if (step === 'voice') {
    return [T(lang, 'ps.qVoice'), kb([[{ text: T(lang, 'ps.skip'), callback_data: cb('v', a, 'skip') }]])];
  }
  return [T(lang, 'ps.done'), {}];
}

/** Ariza berilgach — birinchi savol. Yiqilsa jim: ariza allaqachon tushgan. */
async function start({ app, cand, vacancy, now = new Date() }) {
  try {
    if (!reachable(cand)) return false;
    const pre = startFromDate(cand.availableFrom, now);
    const set = { 'screen.step': 'fit', 'screen.startedAt': now };
    if (pre) Object.assign(set, { 'screen.start': pre, 'screen.startPre': true });
    const up = await Application.findOneAndUpdate({ _id: app._id, 'screen.step': { $in: ['', null] } },
      { $set: set }, { new: true }).lean();
    if (!up) return false;
    const lang = langOf(cand);
    const [q, opts] = question('fit', up, vacancy, lang);
    await send(cand.tgChatId, T(lang, 'ps.intro', { v: vac.titleFor(vacancy, lang), n: stepsOf(up.screen).length }) + '\n\n' + q, opts);
    return true;
  } catch (e) { console.error('[PS] boshlanmadi:', e.message); return false; }
}

// Keyingi savol (step -> step)
const NEXT = { fit: 'start', fitWhy: 'done', start: 'commute', commute: 'voice', voice: 'done' };
const OPS = {
  f: { step: 'fit', field: 'fit', vals: ['ok', 'sal', 'no'] },
  w: { step: 'fitWhy', field: 'fitWhy', vals: ['sal', 'far', 'shift', 'other'] },
  s: { step: 'start', field: 'start', vals: ['now', 'week', 'later', 'busy'] },
  c: { step: 'commute', field: 'commute', vals: ['30', '60', '90', 'na'] },
  v: { step: 'voice', field: null, vals: ['skip'] }
};
const CB_RE = /^ps:([a-z]):([0-9a-f-]{36}):([a-z0-9]{1,6})$/;

/**
 * Bot tugmasi. @returns {{ok, text, alert?, edit?, keyboard?}} — iv bilan bir xil shakl
 */
async function handleCallback({ data, chatId, appBase = '', now = new Date() }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, id, val] = m;
  const spec = OPS[op];
  if (!spec || !spec.vals.includes(val)) return { ok: false, text: '' };
  const a = await Application.findOne({ id }).lean();
  if (!a) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };
  const cand = await Candidate.findOne({ restaurantId: a.agencyId, id: a.candidateId }, 'id tgChatId tgState lang tgLang').lean();
  const lang = langOf(cand);
  if (!cand || String(cand.tgChatId) !== String(chatId)) return { ok: false, text: T(lang, 'ivx.notYours'), alert: true };
  if ((a.screen || {}).step !== spec.step) return { ok: true, text: '✓' };          // allaqachon javob bergan

  // "Mos emas" — sababini so'raymiz, keyin tugaydi (qolgan savollar ortiqcha)
  let next = NEXT[spec.step];
  if (op === 'f' && val === 'no') next = 'fitWhy';
  else if (next === 'start' && a.screen.startPre) next = 'commute';
  const set = { 'screen.step': next };
  if (spec.field) set['screen.' + spec.field] = val;
  if (next === 'done') set['screen.doneAt'] = now;
  const up = await Application.findOneAndUpdate({ _id: a._id, 'screen.step': spec.step }, { $set: set }, { new: true }).lean();
  if (!up) return { ok: true, text: '✓' };

  const v = await Vacancy.findOne({ agencyId: a.agencyId, id: a.vacancyId }).lean() || {};
  const [q, opts] = question(next, up, v, lang);
  let edit = q, keyboard = opts.reply_markup ? opts.reply_markup.inline_keyboard : undefined;
  if (next === 'done') {
    edit = T(lang, up.screen.fit === 'no' ? 'ps.doneNo' : 'ps.done');
    keyboard = appBase ? [[{ text: T(lang, 'al.bApps'), web_app: { url: `${appBase}/profil.html#apps` } }]] : undefined;
  }
  return { ok: true, text: '✓', edit, keyboard };
}

/**
 * Nomzod ovozli xabar yubordi — oxirgi savol "ovozli tanishuv" bo'lgan
 * arizaga yoziladi (48 soat ichida). @returns true — qabul qilindi
 */
async function takeVoice({ cand, voice, now = new Date() }) {
  if (!cand || !voice || !voice.file_id) return false;
  const up = await Application.findOneAndUpdate(
    { agencyId: cand.restaurantId, candidateId: cand.id, 'screen.step': 'voice', 'screen.startedAt': { $gte: new Date(now.getTime() - 48 * H) } },
    { $set: { 'screen.step': 'done', 'screen.doneAt': now, 'screen.voiceFileId': voice.file_id,
      'screen.voiceDur': Math.min(600, Number(voice.duration) || 0) } },
    { new: true, sort: { 'screen.startedAt': -1 } }).lean();
  return !!up;
}

/** Mijozga ovozni Telegram chatiga yuborish (Mini App'da OGG har doim o'ynamaydi). */
async function sendVoiceTo({ app, chatId, caption = '' }) {
  const fid = app && app.screen && app.screen.voiceFileId;
  if (!fid) throw new Error('Ovozli tanishuv yo\'q');
  return tg.sendVoice(tg.platformToken(), chatId, fid, caption ? { caption } : {});
}

/** Javob bermagan nomzodga bitta eslatma (3 soatdan keyin, kunduzi) */
async function tick(now = new Date()) {
  const h = (now.getUTCHours() + 5) % 24;
  if (h < 9 || h >= 21) return { reminded: 0 };
  const t = now.getTime();
  let reminded = 0;
  const rows = await Application.find({ 'screen.step': { $in: ['fit', 'fitWhy', 'start', 'commute', 'voice'] },
    'screen.remindedAt': null, 'screen.startedAt': { $lte: new Date(t - 3 * H), $gte: new Date(t - 48 * H) } }).limit(50).lean();
  for (const a of rows) {
    const up = await Application.findOneAndUpdate({ _id: a._id, 'screen.remindedAt': null }, { $set: { 'screen.remindedAt': now } }, { new: true }).lean();
    if (!up) continue;
    const cand = await Candidate.findOne({ restaurantId: a.agencyId, id: a.candidateId }, 'id tgChatId tgState lang tgLang').lean();
    if (!reachable(cand)) continue;
    const v = await Vacancy.findOne({ agencyId: a.agencyId, id: a.vacancyId }).lean() || {};
    const lang = langOf(cand);
    const [q, opts] = question(up.screen.step, up, v, lang);
    await send(cand.tgChatId, T(lang, 'ps.remind', { v: vac.titleFor(v, lang) }) + '\n\n' + q, opts);
    reminded++;
  }
  return { reminded };
}

/** Mini App / panel uchun qisqa ko'rinish */
function view(scr = {}) {
  if (!scr || !scr.step) return null;
  const done = scr.step === 'done';
  return { done, waiting: !done && !!scr.startedAt && Date.now() - new Date(scr.startedAt).getTime() < 48 * H, fit: scr.fit || '', fitWhy: scr.fitWhy || '', start: scr.start || '',
    commute: scr.commute || '', voice: !!scr.voiceFileId, voiceDur: scr.voiceDur || 0 };
}

module.exports = { start, handleCallback, takeVoice, sendVoiceTo, tick, view, termsOf, startFromDate, CB_RE };
