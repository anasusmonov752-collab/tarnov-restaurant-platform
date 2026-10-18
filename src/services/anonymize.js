// ── NOMZODNI MIJOZ UCHUN TAYYORLASH ──────────────────────────
// Mijoz nomzod haqida deyarli hamma narsani ko'radi — lavozim, ish
// joylari (nomi bilan), ko'nikmalar, tillar, maosh, foto. Yashiriladigan
// narsa atigi ikkita: ISM-FAMILIYA va KONTAKT.
//
// Nega to'liq niqoblash shart emas: mijoz nomzodni hh.uz'da tanib olsa
// ham, u yerda kontakt ochishning eng arzon tarifi ~18 mln so'm. Bitta
// ofitsiant uchun unga kirmaydi. Himoya sir saqlashda emas, narx
// to'sig'ida.
//
// MUHIM: mijozga ketadigan HAR QANDAY ma'lumot shu fayldan o'tsin.
// Boshqa joyda qo'lda obyekt yig'ilsa, bir kun kontakt sizib chiqadi.

const { roleLabel } = require('../data/roles');

// Mijozga chiqariladigan maydonlar — oq ro'yxat.
// Qora ro'yxat ishlatmaymiz: modelga yangi maydon qo'shilganda u
// avtomatik sizib chiqmasligi kerak.
const PUBLIC_FIELDS = [
  'publicCode', 'role', 'desiredPosition', 'experienceYears', 'experienceSummary',
  'workHistory', 'skills', 'languages', 'location', 'age', 'education',
  'salaryExpectation', 'summary', 'fitScore', 'fitReason', 'shift',
  'jobStatus', 'hasPhoto', 'source'
];

const JOB_STATUS_LABEL = {
  active:      'Faol ish qidirmoqda',
  considering: "Takliflarni ko'rib chiqmoqda",
  not_looking: 'Ish qidirmayapti',
  unknown:     "Holati noma'lum"
};

// Qisqa, odam o'qiy oladigan kod: "A-3F7C".
// Mijoz suhbatda nomzodga shu bilan murojaat qiladi.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // O/0, I/1 chiqarilgan
function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return 'A-' + s;
}

/**
 * Nomzodni mijoz ko'radigan ko'rinishga keltiradi.
 * @param {object} c  Candidate hujjati (lean yoki mongoose)
 * @returns {object}  ism va kontaktsiz nusxa
 */
function forClient(c) {
  if (!c) return null;
  const src = typeof c.toObject === 'function' ? c.toObject() : c;

  const out = {};
  for (const f of PUBLIC_FIELDS) {
    if (src[f] !== undefined) out[f] = src[f];
  }

  // Mini App kartani shu id bo'yicha tanlaydi. Bu uuid — ichida
  // hech qanday ma'lumot yo'q, shuning uchun berish xavfsiz.
  out.id = src.id;
  out.roleLabel = roleLabel(src.role);
  out.jobStatusLabel = JOB_STATUS_LABEL[src.jobStatus] || JOB_STATUS_LABEL.unknown;

  // Ism o'rniga kod. Kod hali yo'q bo'lsa — ro'yxatda bo'sh ko'rinmasin.
  out.publicCode = src.publicCode || '—';

  // Erkin matnli maydonlarda ism qolib ketadi. Buning uch manbasi bor va
  // faqat bittasini AI prompt'i hal qiladi:
  //   1. AI yozgan summary/fitReason — prompt ismni taqiqlamaydi
  //   2. experienceSummary — nomzodning O'ZI yozadi (routes/candidate.js)
  //   3. bazadagi ~799 eski yozuv — prompt o'zgarsa ham tozalanmaydi
  // Shuning uchun redaksiya CHIQISHDA, kod bilan qilinadi: uchalasini ham
  // qamrab oladi. Bu blok out.publicCode dan KEYIN turishi shart.
  const FREE_TEXT = ['summary', 'experienceSummary', 'fitReason', 'education'];
  const nameParts = String(src.fullName || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 3);        // qisqa bo'laklar noto'g'ri mos keladi
  if (nameParts.length) {
    const rx = new RegExp(nameParts.join('|'), 'giu');
    for (const f of FREE_TEXT) {
      if (typeof out[f] === 'string') out[f] = out[f].replace(rx, out.publicCode);
    }
    if (Array.isArray(out.workHistory)) {
      out.workHistory = out.workHistory.map(w => {
        if (!w || typeof w !== 'object') return w;
        const n = Object.assign({}, w);
        if (typeof n.position === 'string')    n.position    = n.position.replace(rx, out.publicCode);
        if (typeof n.description === 'string') n.description = n.description.replace(rx, out.publicCode);
        return n;
      });
    }
  }

  return out;
}

function forClientList(rows) {
  return (rows || []).map(forClient);
}

module.exports = { forClient, forClientList, makeCode, PUBLIC_FIELDS, JOB_STATUS_LABEL };
