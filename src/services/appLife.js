// ── ARIZANING HAYOT YO'LI ────────────────────────────────────
// Nomzod "Ariza berish"ni bosgach nima bo'layotganini bilishi kerak.
// Ilgari "Arizalarim"da faqat "Ko'rib chiqilmoqda" turardi va uni faqat
// mijoz o'zgartirardi — kanaldan olingan (tizimga kirmaydigan) restoran
// vakansiyasida u abadiy qotib qolardi. Agentlikning ishi esa ko'rinmasdi.
//
// Bosqichlar ikki manbadan YIG'ILADI, alohida saqlanmaydi:
//   Application — yuborildi, HR ko'rdi, HR bog'landi, taklif / rad
//   Shortlist elementi (tanlovga o'tgach) — suhbat, natija
// Shunda panel, mijoz Mini App va nomzod bir xil haqiqatni ko'radi.

const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');

// O'zbekcha — panel va eski chaqiruvlar uchun; nomzodga til bo'yicha (lug'at 'al.*')
const STEP_LABEL = {
  sent:      'Ariza yuborildi',
  // agentlik (agencySeenAt) yoki mijoz (seenAt) ko'rgan — kim ekanini nomzodga aytmaymiz
  reviewed:  'Arizangiz ko\'rib chiqildi',
  contacted: 'HR siz bilan bog\'landi',
  proposed:  'Ish beruvchiga taklif qilindi',
  interview: 'Suhbat',
  hired:     'Ishga qabul qilindingiz',
  closed:    'Bu safar boshqa nomzod tanlandi',
  withdrawn: 'Ariza qaytarib olindi',       // nomzod o'zi (kabinet) — panel va nomzodga bir xil gap
  vacClosed: 'O\'rin yopildi'                // vakansiya yopildi, arizaga qaror qilinmagan edi
};
// Tanlovdagi holatdan nomzod ko'radigan natija (pipeline.STATES)
const FINAL_BAD = ['candidate_no', 'not_fit', 'refunded'];

/**
 * Nomzod uchun bosqichlar: [{ key, label, at, done }] va joriy holat.
 * @param {object} a     Application (lean)
 * @param {object} item  Shortlist elementi (ixtiyoriy)
 * @param {string} lang  'uz' | 'ru' — nomzod tili
 */
function stepsFor(a, item, lang = 'uz') {
  const s = [];
  const L = key => I18N.t(lang, 'al.' + key);
  const add = (key, at, label) => s.push({ key, label: label || L(key), at: at || null, done: true });
  add('sent', a.createdAt);
  const seen = a.agencySeenAt || a.seenAt;
  // Nomzod o'zi qaytarib olgan (reason 'withdrawn') — "ko'rib chiqildi" deb yozilmaydi
  const withdrawn = a.state === 'rejected' && a.reason === 'withdrawn';
  // Vakansiya yopilgani uchun yakunlangan — hech kim "tanlanmagan", "ko'rib chiqildi" ham deyilmaydi
  const vacClosed = a.state === 'rejected' && a.reason === 'vac_closed';
  if (seen || a.contactedAt || a.state === 'shortlisted' || (a.state === 'rejected' && !withdrawn && !vacClosed)) add('reviewed', seen);
  if (a.contactedAt) add('contacted', a.contactedAt);

  let final = '';
  if (a.state === 'rejected') final = withdrawn ? 'withdrawn' : vacClosed ? 'vacClosed' : 'closed';
  if (a.state === 'shortlisted') {
    add('proposed', a.decidedAt);
    if (item) {
      if (item.interviewAt && ['interview', 'hired', 'not_fit'].includes(item.state)) add('interview', item.interviewAt);
      if (item.state === 'hired') final = 'hired';
      else if (FINAL_BAD.includes(item.state)) final = 'closed';
    }
  }
  if (final) add(final, a.state === 'rejected' ? a.decidedAt : (item && item.decidedAt));

  const last = s[s.length - 1];
  return {
    steps: s,
    stage: last.key,
    stageLabel: last.key === 'interview' && last.at ? `${L('interview')}: ${fmt(last.at, lang)}` : last.label,
    final: !!final,
    tone: final === 'hired' ? 'ok' : ['closed', 'vacClosed'].includes(final) ? 'no' : (last.key === 'sent' ? 'wait' : 'go')
  };
}

// "24-oktabr, 15:00" / "24 октября, 15:00" — Toshkent vaqti (+5), server qayerda bo'lmasin
function fmt(d, lang = 'uz') {
  const x = new Date(new Date(d).getTime() + 5 * 3600e3);
  const hh = String(x.getUTCHours()).padStart(2, '0'), mm = String(x.getUTCMinutes()).padStart(2, '0');
  const m = I18N.t(lang, 'cb.months').split(',')[x.getUTCMonth()];
  return `${I18N.t(lang, 'cb.dateFmt', { d: x.getUTCDate(), m })}, ${hh}:${mm}`;
}

// ── Nomzodga xabar ──
// Faqat nomzod uchun ma'noli o'zgarishlarda: taklif qilindi va rad.
// Rad matni yumshoq va keyingi qadam bilan — "rad etildi" deb tashlab
// qo'ymaymiz. Yiqilsa throw qilmaydi: asosiy amal allaqachon bajarilgan.
async function notify(cand, kind, { vacancy = null, vacTitle = '', appBase = '', openJobs = 0 } = {}) {
  try {
    if (!cand || !cand.tgChatId || ['blocked', 'stopped'].includes(cand.tgState)) return false;
    // Nomzod tili: kabinetda tanlagani, aks holda Telegram tili (Candidate.tgLang)
    const lang = I18N.resolve(cand.lang, cand.tgLang);
    // Avtomatik sarlavha bazada o'zbekcha — o'quvchi tilida (vacancy.titleFor)
    const title = vacancy && vacancy.title ? require('./vacancy').titleFor(vacancy, lang) : vacTitle;
    const key = kind === 'proposed' ? 'al.nProposed' : kind === 'vacClosed' ? 'al.nVacClosed' : 'al.nClosed';
    let text = I18N.t(lang, key, { v: title });
    // Hozir nechta ochiq ish bor — bazadan; nol bo'lsa umuman aytilmaydi (to'qima raqam yo'q)
    if (kind === 'vacClosed' && openJobs > 0) text += '\n\n' + I18N.t(lang, 'al.nOpenJobs', { n: openJobs });
    const opts = appBase ? { reply_markup: { inline_keyboard: [[
      { text: I18N.t(lang, kind === 'proposed' ? 'al.bApps' : 'al.bJobs'), web_app: { url: `${appBase}/profil.html#${kind === 'proposed' ? 'apps' : 'jobs'}` } }
    ]] } } : {};
    await tg.sendMessage(tg.platformToken(), cand.tgChatId, text, opts);
    return true;
  } catch (e) {
    console.error('[APP] nomzodga holat xabari ketmadi:', e.message);
    return false;
  }
}

// Nomzodga ko'rinadigan ochiq ishlar soni — nomzod kabineti ro'yxati qoidasi
async function openJobsCount(agencyId) {
  const Vacancy = require('../models/Vacancy');
  const fresh = new Date(Date.now() - require('./vacancy').STALE_DAYS * 864e5);
  return Vacancy.countDocuments({ agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh }, isTest: { $ne: true } });
}

// ── Vakansiya yopildi ──
// Qaror qilinmagan arizalar (new / seen) yakunlanadi va nomzodga halol xabar
// boradi: "o'rin yopildi" (boshqa nomzod tanlanmagan — shunday deyish yolg'on).
// Ilgari ariza abadiy "HR 24 soat ichida qo'ng'iroq qiladi" holatida qolardi
// (2026-11-18: yopilgan 33 ta import vakansiyaning arizachilari 25 kun kutgan).
// Tanlovga o'tgan (shortlisted) arizalar — mijoz qo'lida, bu yerda tegilmaydi.
// Atomik: shu holatdagi arizani faqat BITTA chaqiruv yakunlaydi — xabar ikki marta ketmaydi.
// quiet — xabar yubormaydi, yakunlangan arizalarni qaytaradi (closedSweep o'zi guruhlaydi)
async function closeForVacancy(agencyId, vacancy, { appBase = process.env.APP_URL || '', dry = false, quiet = false } = {}) {
  const Application = require('../models/Application');
  const Candidate = require('../models/Candidate');
  const open = await Application.find({ agencyId, vacancyId: vacancy.id, state: { $in: ['new', 'seen'] } }).lean();
  if (dry || !open.length) return { closed: open.length, notified: 0, apps: open };
  const now = new Date();
  const openJobs = quiet ? 0 : await openJobsCount(agencyId);
  let closed = 0, notified = 0;
  const apps = [];
  for (const a of open) {
    const set = { state: 'rejected', reason: 'vac_closed', decidedAt: now };
    if (a.screen && a.screen.step && !['done', 'stopped'].includes(a.screen.step)) set['screen.step'] = 'stopped';
    const up = await Application.findOneAndUpdate({ _id: a._id, state: a.state }, { $set: set });
    if (!up) continue;
    closed++; apps.push(a);
    if (quiet) continue;
    const cand = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId }).lean();
    if (await notify(cand, 'vacClosed', { vacancy, appBase, openJobs })) notified++;
  }
  return { closed, notified, apps };
}

// ── Avvaldan yopilgan vakansiyalar (bir martalik tozalash) ──
// Bitta odam bir nechta yopilgan o'ringa ariza bergan bo'lishi mumkin (jonli bazada
// 12 kishiga 29 ta ariza, bittasida 7 ta) — har odamga BITTA xabar, o'rinlar ro'yxati bilan.
async function closedSweep(agencyId, { appBase = process.env.APP_URL || '', apply = false } = {}) {
  const Vacancy = require('../models/Vacancy');
  const Candidate = require('../models/Candidate');
  const vs = await Vacancy.find({ agencyId, status: 'closed' }).lean();
  const byCand = new Map();
  let closed = 0;
  for (const v of vs) {
    const r = await closeForVacancy(agencyId, v, { appBase, dry: !apply, quiet: true });
    closed += r.closed;
    for (const a of r.apps) {
      if (!byCand.has(a.candidateId)) byCand.set(a.candidateId, []);
      byCand.get(a.candidateId).push(v);
    }
  }
  const openJobs = await openJobsCount(agencyId);
  let notified = 0;
  if (apply) {
    for (const [cid, list] of byCand) {
      const cand = await Candidate.findOne({ restaurantId: agencyId, id: cid }).lean();
      if (list.length === 1) {
        if (await notify(cand, 'vacClosed', { vacancy: list[0], appBase, openJobs })) notified++;
      } else if (await notifyMany(cand, list, { appBase, openJobs })) notified++;
    }
  }
  return { apply, closed, people: byCand.size, notified, openJobs,
    perPerson: [...byCand.values()].map(l => l.length).sort((a, b) => b - a) };
}

async function notifyMany(cand, list, { appBase = '', openJobs = 0 } = {}) {
  try {
    if (!cand || !cand.tgChatId || ['blocked', 'stopped'].includes(cand.tgState)) return false;
    const lang = I18N.resolve(cand.lang, cand.tgLang);
    const vac = require('./vacancy');
    const titles = [...new Set(list.map(v => vac.titleFor(v, lang)))];
    const lines = titles.slice(0, 5).map(x => '• ' + x).join('\n') + (titles.length > 5 ? '\n…' : '');
    let text = I18N.t(lang, 'al.nVacClosedMany', { list: lines });
    if (openJobs > 0) text += '\n\n' + I18N.t(lang, 'al.nOpenJobs', { n: openJobs });
    const opts = appBase ? { reply_markup: { inline_keyboard: [[
      { text: I18N.t(lang, 'al.bJobs'), web_app: { url: `${appBase}/profil.html#jobs` } }]] } } : {};
    await tg.sendMessage(tg.platformToken(), cand.tgChatId, text, opts);
    return true;
  } catch (e) {
    console.error('[APP] yopilgan o\'rinlar xabari ketmadi:', e.message);
    return false;
  }
}

module.exports = { stepsFor, notify, closeForVacancy, closedSweep, openJobsCount, STEP_LABEL, fmt };
