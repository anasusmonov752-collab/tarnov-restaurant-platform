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

async function run() {
  const n = await backfillExperienceMonths();
  if (n) console.log(`✦ Ko'chirish: ${n} ta anketa nomzodiga tajriba oylari yozildi`);
}

module.exports = { run, backfillExperienceMonths, PERIOD_MONTHS };
