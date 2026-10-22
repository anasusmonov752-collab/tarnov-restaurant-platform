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
  'jobStatus', 'hasPhoto', 'source',
  'startWhen', 'availableFrom'     // anketadan: "qachondan chiqa oladi" — shaxsni ochmaydi
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

  // Ishonch belgilari — faqat HA/YO'Q (raqamning o'zi emas): mijoz
  // anonim kartalarni shu bilan ham ajratadi (2026-10-20 audit)
  out.phoneVerified = !!src.phoneVerifiedAt;
  out.fromAnketa = src.source === 'anketa';

  // Erkin matnli maydonlarda ism qolib ketadi. Buning uch manbasi bor va
  // faqat bittasini AI prompt'i hal qiladi:
  //   1. AI yozgan summary/fitReason — prompt ismni taqiqlamaydi
  //   2. experienceSummary — nomzodning O'ZI yozadi (routes/candidate.js)
  //   3. bazadagi ~799 eski yozuv — prompt o'zgarsa ham tozalanmaydi
  // Shuning uchun redaksiya CHIQISHDA, kod bilan qilinadi: uchalasini ham
  // qamrab oladi. Bu blok out.publicCode dan KEYIN turishi shart.
  // Kontakt ham xuddi shunday: nomzod o'zi yozgan "tajriba haqida" yoki
  // rezyume matnida telefon, email, @username, t.me havolasi bo'lishi
  // mumkin — mijoz uni kreditsiz olardi (2026-10-20 auditda topildi).
  const FREE_TEXT = ['summary', 'experienceSummary', 'fitReason', 'education'];
  const nameParts = String(src.fullName || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 3)         // qisqa bo'laklar noto'g'ri mos keladi
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nameRx = nameParts.length ? new RegExp(nameParts.join('|'), 'giu') : null;
  const clean = s => {
    if (typeof s !== 'string' || !s) return s;
    if (nameRx) s = s.replace(nameRx, out.publicCode);
    return hideContacts(s);
  };
  for (const f of FREE_TEXT) out[f] = clean(out[f]);
  if (Array.isArray(out.workHistory)) {
    out.workHistory = out.workHistory.map(w => {
      if (!w || typeof w !== 'object') return w;
      const n = Object.assign({}, w);
      n.position = clean(n.position);
      n.description = clean(n.description);
      return n;
    });
  }

  return out;
}

// ── Matndagi kontaktlarni yashirish ──
// Telefon: O'zbekiston formati (+998 90 123 45 67, 90-123-45-67, (90)1234567)
// va har qanday "+" bilan boshlangan 10+ raqamli xalqaro raqam. Yillar
// ("2015-2017"), maosh ("5 000 000") mos kelmaydi: operator kodi 2 raqam,
// keyin 3-2-2 guruh talab qilinadi va oldidan/ortidan raqam turmasligi kerak.
const HIDDEN = '•••';
const CONTACT_RX = [
  /(?<![\d+])(?:\+?998[\s-]*)?\(?\d{2}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g,
  /\+\d[\d\s()-]{8,}\d/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                                       // email
  /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|wa\.me|instagram\.com|facebook\.com)\/[\w./?=&-]+/gi,
  /(?<![\w@])@[A-Za-z][\w]{3,31}\b/g                                     // @username
];
function hideContacts(s) {
  for (const rx of CONTACT_RX) s = s.replace(rx, HIDDEN);
  return s;
}

function forClientList(rows) {
  return (rows || []).map(forClient);
}

module.exports = { forClient, forClientList, makeCode, hideContacts, PUBLIC_FIELDS, JOB_STATUS_LABEL };
