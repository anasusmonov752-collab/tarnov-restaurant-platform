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
  summary     - so'rovni o'zbekcha bir jumlada qaytarib ayt (tasdiqlash uchun)`;

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
  required: ['transcript', 'summary']
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

  // Model mavjud bo'lmagan rol qaytarishi mumkin — tozalaymiz
  if (r.role && !ROLE_KEYS.includes(r.role)) r.role = null;
  if (!Array.isArray(r.languages)) r.languages = [];
  if (!Array.isArray(r.keywords))  r.keywords = [];
  return r;
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Kriteriyadan Mongo so'rovini quradi va nomzodlarni qaytaradi. */
async function search(criteria, restaurantId, { limit = 8 } = {}) {
  const q = { restaurantId };
  const and = [];

  if (criteria.role) q.role = criteria.role;
  if (Number.isFinite(criteria.minExp) && criteria.minExp > 0) {
    q.experienceYears = { $gte: criteria.minExp };
  }
  if (criteria.location) {
    q.location = { $regex: escapeRegex(criteria.location), $options: 'i' };
  }
  // Har bir til ALOHIDA shart — "ingliz va rus" ikkalasini ham talab qiladi
  for (const lang of criteria.languages.slice(0, 4)) {
    and.push({ languages: { $elemMatch: { $regex: escapeRegex(lang), $options: 'i' } } });
  }
  // Kalit so'zlar — istalgan joyda uchrasa bo'ladi
  for (const kw of criteria.keywords.slice(0, 4)) {
    const rx = { $regex: escapeRegex(kw), $options: 'i' };
    and.push({ $or: [
      { skills: rx }, { desiredPosition: rx }, { experienceSummary: rx },
      { summary: rx }, { education: rx }, { rawText: rx }
    ]});
  }
  if (and.length) q.$and = and;

  // Rad etilganlarni chiqarmaymiz — ular bo'yicha qaror qabul qilingan
  q.status = { $ne: 'rejected' };

  const n = Math.min(Math.max(criteria.limit || limit, 1), 15);
  return Candidate.find(q, 'id fullName phone email role desiredPosition experienceYears languages location salaryExpectation fitScore fitReason summary status tgState')
    .sort({ fitScore: -1, experienceYears: -1, createdAt: -1 })
    .limit(n)
    .lean();
}

/** Natijani Telegram uchun matnga aylantiradi. */
function format(criteria, rows) {
  if (!rows.length) {
    return `Topilmadi.\n\nSo'rov: ${criteria.summary}\n\n`
         + `Shartlarni yumshatib ko'ring — masalan tajriba yilini kamaytiring `
         + `yoki tilni olib tashlang.`;
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

  return `So'rov: ${criteria.summary}\n`
       + `Topildi: ${rows.length} ta\n`
       + `${'—'.repeat(22)}\n\n`
       + lines.join('\n');
}

module.exports = { parseQuery, search, format };
