// ── TANLOV BOSQICHLARI ───────────────────────────────────────
// Mijoz tanlaydi -> siz nomzod bilan gaplashasiz -> rozi bo'lsa kontakt
// ochiladi -> restoranda suhbat -> natija.
//
// Oltitadan ortiq holat bo'lsa hech kim yangilamaydi. Shuning uchun
// ro'yxat ataylab qisqa: har bosqich kimdir haqiqatan qiladigan ish.
//
// Bu fayl SERVER va IKKALA frontend uchun yagona manba. O'zgartirilsa
// mijozlar.html va miniapp.html dagi nusxalar ham yangilanishi kerak.

const STATES = [
  // key              label                     kim qo'yadi   yakuniymi
  { key: 'selected',   label: 'Tanlandi',          by: 'client', final: false },
  { key: 'contacting', label: 'Bog\'lanilmoqda',   by: 'agency', final: false },
  { key: 'candidate_no', label: 'Nomzod rad etdi', by: 'agency', final: true  },
  { key: 'candidate_ok', label: 'Nomzod rozi',     by: 'agency', final: false },
  { key: 'revealed',   label: 'Kontakt ochilgan',  by: 'agency', final: false },
  { key: 'interview',  label: 'Suhbat belgilandi', by: 'client', final: false },
  { key: 'hired',      label: 'Ishga olindi',      by: 'client', final: true  },
  { key: 'not_fit',    label: 'Mos kelmadi',       by: 'client', final: true  },
  { key: 'refunded',   label: 'Kredit qaytarildi', by: 'system', final: true  }
];

const STATE_KEYS = STATES.map(s => s.key);
const byKey = Object.fromEntries(STATES.map(s => [s.key, s]));

function stateLabel(k) { return (byKey[k] || {}).label || k; }
function isFinal(k)    { return !!(byKey[k] || {}).final; }

// Siz qo'lda qo'yadigan holatlar. 'revealed' bu yerda yo'q — u kontakt
// ochilganda avtomatik qo'yiladi va kredit yechiladi.
const AGENCY_STATES = ['selected', 'contacting', 'candidate_ok', 'candidate_no'];

// Mijoz qo'yadigan holatlar. Faqat kontakt ochilgandan keyin mantiqiy:
// ochilmagan nomzodni suhbatga chaqirib bo'lmaydi.
const CLIENT_STATES = ['interview', 'hired', 'not_fit'];

// ── Rad sabablari ────────────────────────────────────────────
// Eng qimmatli ma'lumot shu. 50 ta qo'ng'iroqdan keyin mijozga aniq
// gapirish mumkin bo'ladi: "6 tasi maosh sababli rad etdi".

// Nomzod rad etganda — siz qo'yasiz
const CAND_REASONS = [
  { key: 'salary',     label: 'Maosh past' },
  { key: 'far',        label: 'Joy uzoq' },
  { key: 'found_job',  label: 'Boshqa ish topdi' },
  { key: 'schedule',   label: 'Smena mos emas' },
  { key: 'no_answer',  label: 'Javob bermadi' },
  { key: 'not_interested', label: 'Qiziqmadi' },
  { key: 'other',      label: 'Boshqa sabab' }
];

// Mijoz rad etganda — mijoz qo'yadi
const CLIENT_REASONS = [
  { key: 'experience', label: 'Tajriba yetarli emas' },
  { key: 'language',   label: 'Til darajasi' },
  { key: 'no_show',    label: 'Suhbatga kelmadi' },
  { key: 'salary_ask', label: 'Maosh talabi yuqori' },
  { key: 'other',      label: 'Boshqa sabab' }
];

const CAND_REASON_KEYS   = CAND_REASONS.map(r => r.key);
const CLIENT_REASON_KEYS = CLIENT_REASONS.map(r => r.key);

const reasonLabel = k =>
  (CAND_REASONS.find(r => r.key === k) || CLIENT_REASONS.find(r => r.key === k) || {}).label || '';

// ── Ikki voronkani bog'lash ──────────────────────────────────
// Platformada IKKI xil bosqich bor va ular boshqa narsani o'lchaydi:
//
//   Candidate.status        — nomzod SIZNING umumiy voronkangizda qayerda
//   Shortlist.items[].state — nomzod SHU MIJOZ uchun qayerda
//
// Bittasini ikkinchisiga almashtirib bo'lmaydi: bir nomzod bir nechta
// mijozning tanlovida bo'lishi mumkin. Lekin ular bir-birini bilishi
// shart — aks holda kanbanda "yangi" bo'lib turgan odam aslida allaqachon
// suhbatdan o'tgan bo'ladi.
//
// Yechim: tanlovdagi harakat kanbanni OLDINGA suradi, orqaga hech qachon.

// Kanban tartibi. reserve va rejected — yon holatlar, tartibda emas.
const KANBAN_ORDER = ['new', 'phone', 'interview', 'interview2', 'trial', 'hired'];

// Tanlov holati -> kanban bosqichi. null = kanbanga tegilmaydi.
// candidate_no va not_fit ataylab null: nomzod SHU ishdan bosh tortdi,
// bu uni umumiy bazadan chiqarmaydi.
const STATE_TO_KANBAN = {
  selected:     null,
  contacting:   'phone',
  candidate_ok: 'phone',
  candidate_no: null,
  revealed:     'phone',
  interview:    'interview',
  hired:        'hired',
  not_fit:      null,
  refunded:     null
};

/** Yangi bosqich eskisidan oldindami? Faqat shunda suriladi. */
function isForward(fromStatus, toStatus) {
  const a = KANBAN_ORDER.indexOf(fromStatus);
  const b = KANBAN_ORDER.indexOf(toStatus);
  if (b < 0) return false;            // noma'lum bosqichga surmaymiz
  if (a < 0) return true;             // reserve/rejected dan ko'tarilsa — mayli
  return b > a;
}

module.exports = {
  STATES, STATE_KEYS, stateLabel, isFinal,
  AGENCY_STATES, CLIENT_STATES,
  CAND_REASONS, CLIENT_REASONS,
  CAND_REASON_KEYS, CLIENT_REASON_KEYS, reasonLabel,
  KANBAN_ORDER, STATE_TO_KANBAN, isForward
};
