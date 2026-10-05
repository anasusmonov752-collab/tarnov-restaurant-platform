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

  return out;
}

function forClientList(rows) {
  return (rows || []).map(forClient);
}

module.exports = { forClient, forClientList, makeCode, PUBLIC_FIELDS, JOB_STATUS_LABEL };
