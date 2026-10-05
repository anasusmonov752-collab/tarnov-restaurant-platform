// ── TABIIY TILDA NOMZOD QIDIRISH ─────────────────────────────
// Admin botga yozadi yoki ovozli xabar yuboradi:
//   "menga menejer topib ber, 2 yildan ortiq tajribali, ingliz tili biladigan"
// Biz uni kriteriyalarga aylantiramiz, bazadan filtrlaymiz va saralaymiz.
//
// Ovoz alohida speech-to-text xizmatisiz ishlaydi — Gemini audioni
// to'g'ridan tushunadi, shuning uchun bitta chaqiruvda ham matnni, ham
// kriteriyani qaytaradi.

const Candidate = require('../models/Candidate');
const ai = require('./ai');
const { ROLES, ROLE_KEYS, roleLabel } = require('../data/roles');

const ROLE_HINT = ROLES.map(r => `${r.key} (${r.label})`).join(', ');

const SYSTEM = `Sen HR yordamchisisan. Foydalanuvchi o'zbek yoki rus tilida nomzod
qidirish so'rovini aytadi (matn yoki ovoz). Uni tahlil qilib FAQAT JSON qaytar.

Mavjud lavozim kalitlari: ${ROLE_HINT}.
Agar so'rovda lavozim aniq aytilmasa — role ni null qoldir, O'YLAB TOPMA.

Maydonlar:
  transcript  - ovoz bo'lsa eshitilgan matn; matn bo'lsa o'sha matn
  role        - lavozim kaliti yoki null
  minExp      - eng kam tajriba (yil, butun son) yoki null
  languages   - talab qilingan tillar massivi (masalan ["ingliz"]) yoki []
  location    - hudud/shahar yoki null
  maxSalary   - maosh shifti (son, so'mda) yoki null
  keywords    - qolgan muhim so'zlar (ko'nikma, kompaniya nomi) massivi
  limit       - nechta nomzod so'ralgan (son) yoki null
  summary     - so'rovni o'zbekcha bir jumlada qaytarib ayt (tasdiqlash uchun)

HAR BIR maydonni qaytar. Ma'lumot bo'lmasa null (yoki massiv uchun []) qo'y.

MUHIM: faqat so'rovda AYTILGANINI yoz. Hech narsani o'ylab topma.
Shahar aytilmasa location null bo'lsin — "Toshkent" yoki boshqa shaharni
o'zing qo'shma. Shu qoida barcha maydonlarga tegishli.

Misollar:
  "menga xostes kerak, 2 yildan ortiq tajribali"
  -> role:"xostess", minExp:2, languages:[], location:null, limit:null

  "ingliz tili biladigan zal menejeri topib ber, Toshkentdan 5 ta"
  -> role:"menejer", minExp:null, languages:["ingliz"], location:"Toshkent", limit:5

  "call operator kerak"
  -> role:"operator", minExp:null, languages:[], location:null, limit:null

  "kim bor umuman"
  -> role:null, minExp:null, languages:[], location:null, limit:null

  "нужен официант с опытом работы"
  -> role:"ofitsiant", minExp:null, languages:[], location:null, limit:null
     (shahar aytilmagan - location null)`;

const SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string' },
    role:       { type: 'string', nullable: true },
    minExp:     { type: 'integer', nullable: true },
    languages:  { type: 'array', items: { type: 'string' } },
    location:   { type: 'string', nullable: true },
    maxSalary:  { type: 'integer', nullable: true },
    keywords:   { type: 'array', items: { type: 'string' } },
    limit:      { type: 'integer', nullable: true },
    summary:    { type: 'string' }
  },
  // HAMMASI required — Gemini majburiy bo'lmagan maydonni tashlab ketardi,
  // shuning uchun rol/hudud/limit doim bo'sh kelardi. Noma'lum bo'lsa
  // model null qo'yadi.
  required: ['transcript','role','minExp','languages','location','maxSalary','keywords','limit','summary']
};

/**
 * So'rovni kriteriyalarga aylantiradi.
 * @param {{text?:string, audio?:{mimeType:string,data:string}}} input
 */
async function parseQuery(input, restaurantId) {
  const content = input.audio
    ? [{ audio: input.audio }, 'Shu ovozli so\'rovni tahlil qil.']
    : String(input.text || '');

  const r = await ai.complete({
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    json: true,
    schema: SCHEMA,
    maxTokens: 700,
    tier: 'smart',          // ovoz va til tahlili uchun kuchliroq model
    restaurantId
  });

  r.role = normalizeRole(r.role);
  if (!Array.isArray(r.languages)) r.languages = [];
  if (!Array.isArray(r.keywords))  r.keywords = [];
  return r;
}

// Model lavozimni har xil yozishi mumkin: "xostes", "Хостес", "hostess".
// Hammasini bitta kalitga keltiramiz — aks holda filtr ishlamaydi.
const ROLE_ALIAS = {
  ofitsiant: ['ofitsiant','ofitsiyant','официант','оффициант','waiter','waitress'],
  barmen:    ['barmen','бармен','bartender','barista','бариста'],
  xostess:   ['xostess','xostes','hostess','хостес','хостесс','host'],
  oshpaz:    ['oshpaz','повар','cook','chef','shef'],
  kassir:    ['kassir','кассир','cashier'],
  menejer:   ['menejer','manager','менеджер','administrator','administrator zali','админ','администратор','zal menejeri','supervayzer','супервайзер'],
  operator:  ['operator','оператор','call operator','call-operator','call markaz','колл-центр','call center','call-центра','callcenter']
};
function normalizeRole(v) {
  if (!v) return null;
  const s = String(v).toLowerCase().trim();
  if (ROLE_KEYS.includes(s)) return s;
  for (const key of Object.keys(ROLE_ALIAS)) {
    if (ROLE_ALIAS[key].some(a => s === a || s.includes(a))) return key;
  }
  return null;
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Bitta til bazada bir necha xil yozilgan: "Ingliz" / "Английский" / "English".
// Apostrof va qo'shimchalardan qochish uchun o'zak bo'laklar ishlatiladi
// (masalan "zbek" — "O'zbek" ham, "Узбекский" ham tushadi).
const LANG_ALIAS = [
  ['zbek', 'узбек', 'uzbek'],
  ['rus', 'русск', 'russian'],
  ['ngliz', 'нгли', 'english', 'inglis'],
  ['qozoq', 'kazax', 'казах', 'kazakh'],
  ['turk', 'турец', 'turkish'],
  ['koreys', 'корей', 'korean'],
  ['tojik', 'тадж', 'tajik'],
  ['arab', 'араб', 'arabic'],
  ['nemis', 'немец', 'german', 'deutsch'],
  ['fransuz', 'француз', 'french'],
  ['xitoy', 'китай', 'chinese'],
  ['ozarbayjon', 'азербайдж', 'azerbaijani']
];
function langPattern(lang) {
  const s = String(lang || '').toLowerCase().trim();
  if (!s) return '.^';                       // hech narsaga mos kelmaydi
  const group = LANG_ALIAS.find(g => g.some(a => s.includes(a) || a.includes(s)));
  const parts = group || [s];
  return parts.map(escapeRegex).join('|');
}

const FIELDS = 'id fullName phone email role desiredPosition experienceYears languages location salaryExpectation fitScore fitReason summary status tgState';

// Shartlarni bosqichma-bosqich yumshatish tartibi.
// Rol — asosiy niyat, u hech qachon tashlanmaydi. Qolganlari
// ishonchsizligi bo'yicha: kalit so'zlar AI o'ylab topishi oson
// ("zal menejeri" dan "zal" chiqib, hamma natijani o'ldirgan edi),
// shahar ham xato aniqlanishi mumkin.
const RELAX_ORDER = ['keywords', 'location', 'languages', 'minExp'];
const RELAX_LABEL = {
  keywords:  'kalit so\'zlar',
  location:  'hudud',
  languages: 'til',
  minExp:    'tajriba yili'
};

function buildQuery(criteria, restaurantId, skip) {
  const q = { restaurantId, status: { $ne: 'rejected' } };  // rad etilganlar chiqmaydi
  const and = [];

  if (criteria.role) q.role = criteria.role;

  if (!skip.has('minExp') && Number.isFinite(criteria.minExp) && criteria.minExp > 0) {
    q.experienceYears = { $gte: criteria.minExp };
  }
  if (!skip.has('location') && criteria.location) {
    q.location = { $regex: escapeRegex(criteria.location), $options: 'i' };
  }
  if (!skip.has('languages')) {
    // Har bir til ALOHIDA shart — "ingliz va rus" ikkalasi ham talab qilinadi.
    // Baza bir tilni ikki xil yozadi ("Ingliz" / "Английский") — ikkalasini izlaymiz.
    for (const lang of criteria.languages.slice(0, 4)) {
      and.push({ languages: { $elemMatch: { $regex: langPattern(lang), $options: 'i' } } });
    }
  }
  if (!skip.has('keywords')) {
    for (const kw of criteria.keywords.slice(0, 4)) {
      const rx = { $regex: escapeRegex(kw), $options: 'i' };
      and.push({ $or: [
        { skills: rx }, { desiredPosition: rx }, { experienceSummary: rx },
        { summary: rx }, { education: rx }, { rawText: rx }
      ]});
    }
  }
  if (and.length) q.$and = and;
  return q;
}

/**
 * Nomzodlarni qidiradi. Qattiq shartlar bilan hech narsa topilmasa,
 * ularni birin-ketin yumshatadi — "topilmadi" deyishdan ko'ra, nimani
 * hisobga olmaganini aytib natija bergan foydaliroq.
 * @returns {{rows:Array, relaxed:string[]}}
 */
async function search(criteria, restaurantId, { limit = 8 } = {}) {
  const n = Math.min(Math.max(criteria.limit || limit, 1), 15);
  const skip = new Set();
  const relaxed = [];

  for (let step = 0; step <= RELAX_ORDER.length; step++) {
    const rows = await Candidate
      .find(buildQuery(criteria, restaurantId, skip), FIELDS)
      .sort({ fitScore: -1, experienceYears: -1, createdAt: -1 })
      .limit(n)
      .lean();

    if (rows.length) return { rows, relaxed };
    if (step === RELAX_ORDER.length) return { rows: [], relaxed };

    // Keyingi shartni tashlaymiz — faqat u haqiqatan qo'llangan bo'lsa
    const field = RELAX_ORDER[step];
    const used = field === 'keywords'  ? criteria.keywords.length
               : field === 'languages' ? criteria.languages.length
               : field === 'location'  ? !!criteria.location
               : Number.isFinite(criteria.minExp) && criteria.minExp > 0;
    skip.add(field);
    if (used) relaxed.push(RELAX_LABEL[field]);
  }
  return { rows: [], relaxed };
}

/** Natijani Telegram uchun matnga aylantiradi. */
function format(criteria, result) {
  const rows = result.rows || [];
  const relaxed = result.relaxed || [];

  if (!rows.length) {
    return `Topilmadi.\n\nSo'rov: ${criteria.summary}\n\n`
         + `Bazada bu lavozimda mos nomzod yo'q. Boshqacha so'rab ko'ring.`;
  }

  const lines = rows.map((c, i) => {
    const bits = [];
    if (c.experienceYears) bits.push(`${c.experienceYears} yil tajriba`);
    if (c.languages && c.languages.length) bits.push(c.languages.slice(0, 3).join(', '));
    if (c.salaryExpectation) bits.push(c.salaryExpectation);

    const tg = c.tgState === 'linked' ? ' · Telegramda' : '';
    return `${i + 1}. ${c.fullName || 'Nomsiz'}\n`
         + `   ${c.desiredPosition || roleLabel(c.role)}${tg}\n`
         + (bits.length ? `   ${bits.join(' · ')}\n` : '')
         + (c.phone ? `   ${c.phone}\n` : '   telefon yo\'q\n')
         + (c.fitScore ? `   AI moslik ${c.fitScore}/5\n` : '');
  });

  const note = relaxed.length
    ? `\nQat'iy mos kelmadi — ${relaxed.join(', ')} hisobga olinmadi.\n` : '';

  return `So'rov: ${criteria.summary}\n`
       + `Topildi: ${rows.length} ta${note}\n`
       + `${'—'.repeat(22)}\n\n`
       + lines.join('\n');
}

module.exports = { parseQuery, search, format };
