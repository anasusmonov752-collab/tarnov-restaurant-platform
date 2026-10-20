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
const { ROLES, ROLE_KEYS, roleLabel, guessRole } = require('../data/roles');

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
  shift       - "kunduzgi" | "kechki" yoki null (smena aytilmasa null)
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
    shift:      { type: 'string', nullable: true },
    maxSalary:  { type: 'integer', nullable: true },
    keywords:   { type: 'array', items: { type: 'string' } },
    limit:      { type: 'integer', nullable: true },
    summary:    { type: 'string' }
  },
  // HAMMASI required — Gemini majburiy bo'lmagan maydonni tashlab ketardi,
  // shuning uchun rol/hudud/limit doim bo'sh kelardi. Noma'lum bo'lsa
  // model null qo'yadi.
  required: ['transcript','role','minExp','languages','location','shift','maxSalary','keywords','limit','summary']
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
  r.shift = normalizeShift(r.shift);
  if (!Array.isArray(r.languages)) r.languages = [];
  if (!Array.isArray(r.keywords))  r.keywords = [];
  return r;
}

// Smena uch xil yoziladi. Faqat ikki qiymatga keltiramiz: nomzodning
// "ikkalasi" qiymati har ikkala so'rovga ham mos keladi (quyida, buildQuery).
function normalizeShift(v) {
  const s = String(v || '').toLowerCase();
  if (/kech|вечер|night|evening/.test(s)) return 'kechki';
  if (/kun|день|дневн|morning|day/.test(s)) return 'kunduzgi';
  return null;
}

// Model lavozimni har xil yozishi mumkin: "xostes", "Хостес", "hostess".
// Hammasini bitta kalitga keltiramiz — aks holda filtr ishlamaydi.
// Jadval data/roles.js da (guessRole) — rezyume tahlilchisi ham shundan
// foydalanadi. Ilgari bu yerda alohida ROLE_ALIAS bor edi, tahlilchida esa
// yo'q edi: qidiruv "Хостес"ni tanirdi, rezyume esa 'boshqa' bo'lib qolardi.
function normalizeRole(v) {
  if (!v) return null;
  const s = String(v).toLowerCase().trim();
  if (ROLE_KEYS.includes(s)) return s;
  return guessRole(s) || null;
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
const RELAX_ORDER = ['keywords', 'location', 'shift', 'languages', 'minExp'];
const RELAX_LABEL = {
  keywords:  'kalit so\'zlar',
  location:  'hudud',
  shift:     'smena',
  languages: 'til',
  minExp:    'tajriba yili'
};

function buildQuery(criteria, restaurantId, skip) {
  // Rad etilganlar, ishga olinganlar va "ish qidirmayapman" deganlar
  // chiqmaydi — mijoz ularni tanlab, keyin "band ekan" deb eshitardi
  // (2026-10-20 auditda topildi). Yumshatish bu shartlarga tegmaydi.
  const q = { restaurantId, status: { $nin: ['rejected', 'hired'] }, jobStatus: { $ne: 'not_looking' } };
  const and = [];

  if (criteria.role) q.role = criteria.role;
  // Allaqachon tanlanganlar (vakansiyadan qidiruvda) qayta chiqmasin.
  // Yumshatish bu shartga tegmaydi — u filtr emas, takrorning oldini olish.
  if (Array.isArray(criteria.excludeIds) && criteria.excludeIds.length) {
    q.id = { $nin: criteria.excludeIds.slice(0, 500) };
  }

  if (!skip.has('minExp') && Number.isFinite(criteria.minExp) && criteria.minExp > 0) {
    q.experienceYears = { $gte: criteria.minExp };
  }
  if (!skip.has('location') && criteria.location) {
    q.location = { $regex: escapeRegex(criteria.location), $options: 'i' };
  }
  // Nomzodda "ikkalasi" bo'lsa har qanday smenaga mos keladi.
  // Smenasi ko'rsatilmaganlarni ham tashlamaymiz — bazada ko'pchilikda
  // bu maydon bo'sh, qattiq filtrlasak natija deyarli qolmaydi.
  if (!skip.has('shift') && criteria.shift) {
    and.push({ $or: [
      { shift: { $regex: criteria.shift === 'kechki' ? 'kech|вечер' : 'kun|днев', $options: 'i' } },
      { shift: { $regex: 'ikkala|оба|любая', $options: 'i' } },
      { shift: '' }, { shift: null }
    ]});
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
const SORT = { fitScore: -1, experienceYears: -1, createdAt: -1 };

async function search(criteria, restaurantId, { limit = 8 } = {}) {
  const n = Math.min(Math.max(criteria.limit || limit, 1), 30);
  const skip = new Set();
  const relaxed = [];

  for (let step = 0; step <= RELAX_ORDER.length; step++) {
    const rows = await Candidate
      .find(buildQuery(criteria, restaurantId, skip), FIELDS)
      .sort(SORT)
      .limit(n)
      .lean();

    // relaxFields ham qaytariladi: keyingi sahifa AYNAN shu yumshatish
    // bilan olinishi kerak, aks holda ro'yxat sakrab ketadi.
    if (rows.length) return { rows, relaxed, relaxFields: [...skip] };
    if (step === RELAX_ORDER.length) return { rows: [], relaxed, relaxFields: [...skip] };

    // Keyingi shartni tashlaymiz — faqat u haqiqatan qo'llangan bo'lsa
    const field = RELAX_ORDER[step];
    const used = field === 'keywords'  ? criteria.keywords.length
               : field === 'languages' ? criteria.languages.length
               : field === 'location'  ? !!criteria.location
               : field === 'shift'     ? !!criteria.shift
               : Number.isFinite(criteria.minExp) && criteria.minExp > 0;
    skip.add(field);
    if (used) relaxed.push(RELAX_LABEL[field]);
  }
  return { rows: [], relaxed, relaxFields: [] };
}

/**
 * search() bilan BIR XIL yumshatish bilan sanaydi. Vakansiya kartasidagi
 * "N mos" soni "Mos nomzodlar" tugmasi beradigan natijaga mos kelsin:
 * qat'iy sanoq 0 deb, tugma esa 20 ta ko'rsatsa — ishonch yo'qoladi.
 */
async function countRelaxed(criteria, restaurantId) {
  const skip = new Set();
  for (let step = 0; step <= RELAX_ORDER.length; step++) {
    const n = await Candidate.countDocuments(buildQuery(criteria, restaurantId, skip));
    if (n || step === RELAX_ORDER.length) return n;
    skip.add(RELAX_ORDER[step]);
  }
  return 0;
}

/**
 * Keyingi sahifa. Yumshatish QAYTA hisoblanmaydi — birinchi qidiruvda
 * qaysi shartlar tashlangan bo'lsa (relaxFields), o'shalar bilan davom
 * etadi. Aks holda 2-sahifa boshqa to'plamdan kelib, nomzodlar
 * takrorlanar yoki tushib qolardi.
 */
async function page(criteria, restaurantId, { skip = 0, limit = 20, relaxFields = [] } = {}) {
  const q = buildQuery(criteria, restaurantId, new Set(relaxFields));
  const [rows, total] = await Promise.all([
    Candidate.find(q, FIELDS).sort(SORT).skip(skip).limit(Math.min(limit, 30)).lean(),
    Candidate.countDocuments(q)
  ]);
  return { rows, total, hasMore: skip + rows.length < total };
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

// ── Suhbat uchun: sanoq va toraytirish variantlari ───────────
// Bot "47 ta bor, Chilonzorda 12 tasi" deya olishi uchun. Raqamni
// AI o'ylab topmasin — shuning uchun bazadan sanab olamiz.

const EMPTY = { role:null, minExp:null, languages:[], location:null, shift:null, maxSalary:null, keywords:[], limit:null };

function fill(c) { return Object.assign({}, EMPTY, c || {}); }

async function countFor(criteria, restaurantId) {
  return Candidate.countDocuments(buildQuery(fill(criteria), restaurantId, new Set()));
}

/**
 * Qaysi qo'shimcha shart natijani qanchaga qisqartirishini hisoblaydi.
 * Faqat HALI qo'yilmagan shartlar taklif qilinadi va faqat natijani
 * haqiqatan kamaytirsa — "12 tadan 12 ta qoladi" degan taklif foydasiz.
 * @returns {Promise<Array<{key:string,label:string,count:number,patch:object}>>}
 */
async function facets(criteria, restaurantId, total) {
  const c = fill(criteria);
  const out = [];

  const probe = async (key, label, patch) => {
    const n = await countFor(Object.assign({}, c, patch), restaurantId);
    if (n > 0 && n < total) out.push({ key, label, count: n, patch });
  };

  if (!c.minExp) await probe('minExp', '2 yildan ortiq tajriba', { minExp: 2 });
  if (!c.shift) {
    await probe('shift_k', 'kechki smena',   { shift: 'kechki' });
    await probe('shift_d', 'kunduzgi smena', { shift: 'kunduzgi' });
  }

  // Hudud — eng ko'p uchraydigan uchtasi. Ro'yxatni o'zimiz tuzmaymiz:
  // bazada qaysi tuman ko'p bo'lsa, o'shani taklif qilamiz.
  if (!c.location) {
    const top = await Candidate.aggregate([
      { $match: buildQuery(c, restaurantId, new Set()) },
      { $match: { location: { $nin: ['', null] } } },
      { $group: { _id: '$location', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 3 }
    ]);
    for (const t of top) {
      if (t.n > 0 && t.n < total) {
        out.push({ key: 'loc_' + t._id, label: t._id, count: t.n, patch: { location: t._id } });
      }
    }
  }

  return out.sort((a, b) => b.count - a.count).slice(0, 4);
}

module.exports = { parseQuery, search, page, format, countFor, countRelaxed, facets, normalizeRole, normalizeShift, EMPTY };
