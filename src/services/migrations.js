// ── KICHIK MA'LUMOT KO'CHIRISHLARI (server ishga tushganda) ──
// Har biri takror xavfsiz: faqat hali to'ldirilmagan yozuvga tegadi.

const Candidate = require('../models/Candidate');
const I18N = require('../../public/js/th-i18n');

// Anketa ish joyi muddati yozuvi ("6 oy – 1 yil") -> oy (pastki chegara;
// "6 oygacha" — 1 oy: tajriba bor, lekin yil emas). survey.toFields bilan bir xil.
const PERIOD_MONTHS = Object.fromEntries(I18N.WORK_DURS.map(k =>
  [I18N.t('uz', 'ank.w.dur.' + k), Math.max(1, I18N.DUR_MONTHS[k] || 0)]));

// experienceMonths (2026-10-23) kelishidan oldin to'ldirilgan anketalar:
// 6–12 oy ishlagan nomzod mijoz kartasida "Tajribasiz" bo'lib chiqardi
async function backfillExperienceMonths() {
  const rows = await Candidate.find(
    { source: 'anketa', experienceMonths: { $in: [null, 0] }, 'workHistory.0': { $exists: true } },
    'id workHistory'
  ).lean();
  let n = 0;
  for (const r of rows) {
    const m = (r.workHistory || []).reduce((s, w) => s + (PERIOD_MONTHS[w.period] || 0), 0);
    if (m > 0) { await Candidate.updateOne({ _id: r._id }, { $set: { experienceMonths: m } }); n++; }
  }
  return n;
}

// 2026-11-18: lavozim tanlanganda ikkinchi anketa yozuvi ochilib, kanali 'bot' bo'lardi
// (survey.openResponse izohi). Natija: story/SMS'dan kelgan nomzod «Botni o'zi topgan»,
// birinchi (javobsiz) yozuv esa «boshladi, tugatmadi» bo'lib statistikada qolgan.
// Bir odamning (agentlik + Telegram) vakansiyasiz yozuvlari ichida javobsizlari asosiysiga
// qo'shiladi: asosiy — javobi bor eng yangisi, bo'lmasa eng yangi javobsizi. Kanal faqat
// asosiysida 'bot'/bo'sh bo'lsa va undan OLDIN ochilgan yozuvda aniq kanal bo'lsa o'tadi
// (birinchi tegish) — nomzod kartasi va hodisalar ham. Javobsizlari O'CHIRILMAYDI:
// status 'merged' (statistikaga kirmaydi, eslatma ketmaydi). Takror xavfsiz.
async function mergeShells() {
  const SurveyResponse = require('../models/SurveyResponse');
  const Event = require('../models/Event');
  const { isShell } = require('./survey');
  const rows = await SurveyResponse.find(
    { vacancyId: '', status: { $in: ['started', 'done'] }, tgUserId: { $nin: ['', null] } },
    // photo (dataURL) ataylab olinmaydi — og'ir; rasm savoliga javob step'ni ham yozadi
    'id agencyId tgUserId status channel refBy step answers mode candidateId startedAt'
  ).sort({ startedAt: 1 }).lean();
  const byUser = new Map();
  for (const r of rows) {
    const k = r.agencyId + '|' + r.tgUserId;
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(r);
  }
  let merged = 0, fixed = 0;
  for (const list of byUser.values()) {
    if (list.length < 2) continue;
    const full = list.filter(r => !isShell(r));
    const shells = list.filter(r => isShell(r));
    const target = full.length ? full[full.length - 1] : shells[shells.length - 1];
    const extra = shells.filter(s => s.id !== target.id);
    if (!extra.length) continue;
    const before = extra.filter(s => new Date(s.startedAt) <= new Date(target.startedAt));
    const set = {};
    const firstCh = before.map(s => s.channel).find(ch => ch && ch !== 'bot');
    if (firstCh && (!target.channel || target.channel === 'bot')) set.channel = firstCh;
    const ref = before.map(s => s.refBy).find(Boolean);
    if (ref && !target.refBy) set.refBy = ref;
    if (Object.keys(set).length) {
      await SurveyResponse.updateOne({ agencyId: target.agencyId, id: target.id }, { $set: set });
      if (set.channel) {
        if (target.candidateId) {
          await Candidate.updateOne({ restaurantId: target.agencyId, id: target.candidateId, channel: { $in: ['', 'bot', null] } },
            { $set: { channel: set.channel } });
        }
        await Event.updateMany({ agencyId: target.agencyId, rid: target.id, channel: { $in: ['', 'bot'] } },
          { $set: { channel: set.channel } });
        fixed++;
      }
    }
    const res = await SurveyResponse.updateMany({ agencyId: target.agencyId, id: { $in: extra.map(s => s.id) }, status: 'started' },
      { $set: { status: 'merged', mergedInto: target.id } });
    merged += res.modifiedCount || 0;
  }
  return { merged, fixed };
}

async function run() {
  const n = await backfillExperienceMonths();
  if (n) console.log(`✦ Ko'chirish: ${n} ta anketa nomzodiga tajriba oylari yozildi`);
  const m = await mergeShells();
  if (m.merged || m.fixed) console.log(`✦ Ko'chirish: ${m.merged} ta javobsiz anketa yozuvi asosiysiga qo'shildi, ${m.fixed} tasida kanal tuzatildi`);
}

module.exports = { run, backfillExperienceMonths, mergeShells, PERIOD_MONTHS };
