// ── AVTOMATIK VAKANSIYA ──────────────────────────────────────
// Mijoz botda qidirib nomzod tanlasa, vakansiya o'zi paydo bo'ladi:
//   TALAB  — qidiruv kriteriyalaridan (lavozim, smena, hudud, tajriba)
//   TAKLIF — bot "nima taklif qilasiz?" deb so'raganda berilgan javobdan
//
// Shunda har bir tanlovning vakansiyasi bor va nomzod kontakt ochilgach
// "qayerga, qanday shartda" degan savolga doim javob ko'radi.
//
// QAT'IY SHABLON: mijoz qanday yozsa shunday qo'yilmaydi. AI matnni
// tahlil qilib maydonlarga ajratadi, satrlarni esa SERVER bir xil
// formatda yig'adi (sarlavha, jadval, sharoit). AI faqat raqam va
// kalit qaytaradi — ko'rinadigan matnni u yozmaydi. Natijada barcha
// vakansiyalar bir xil ko'rinadi va nomzod ularni solishtira oladi.
//
// Avtomatik vakansiya YOPIQ (listed:false) yaratiladi: mijoz uni e'lon
// qilmoqchi bo'lmagan, shunchaki qidirgan. Ochiq ro'yxatga qo'ysak, u
// tez orada eskirgan e'lonlarga to'lib ketardi. Mijoz xohlasa bitta
// tugma bilan e'lon qiladi.

const { v4: uuidv4 } = require('uuid');
const Vacancy = require('../models/Vacancy');
const Shortlist = require('../models/Shortlist');
const ai = require('./ai');
const vac = require('./vacancy');
const { isValidRole, roleLabel } = require('../data/roles');

// ── Shablon ──────────────────────────────────────────────────

const SHIFT_TITLE = {
  kunduzgi: 'kunduzgi smena',
  kechki:   'kechki smena',
  ikkalasi: 'kunduzgi/kechki smena'
};

/** "Ofitsiant, kechki smena" — sarlavha faqat shu qoida bilan yasaladi. */
function makeTitle(role, shift) {
  const base = isValidRole(role) ? roleLabel(role) : 'Xodim';
  return SHIFT_TITLE[shift] ? `${base}, ${SHIFT_TITLE[shift]}` : base;
}

// Sharoitlar — yopiq lug'at. AI faqat kalitni qaytaradi, matnni biz
// qo'yamiz: "obed beramiz", "ovqat bepul", "kormit" — hammasi "Ovqat".
const PERKS = {
  ovqat:     'Ovqat',
  forma:     'Forma',
  yol:       'Yo\'l kira',
  transport: 'Xizmat transporti',
  rasmiy:    'Rasmiy ishga joylashtirish',
  bonus:     'Bonus',
  choy:      'Choy puli',
  turar:     'Turar joy',
  oqitish:   'O\'qitish'
};

// 24:00 ham to'g'ri — restoran smenasi ko'pincha yarim tunda tugaydi
const TIME = /^(([01]?\d|2[0-3]):[0-5]\d|24:00)$/;
const pad = t => t.length === 4 ? '0' + t : t;

/** "6/1, 10:00–22:00" */
function makeSchedule(p) {
  const days = p.workDays >= 1 && p.workDays <= 7 && p.restDays >= 0 && p.restDays <= 6
    ? `${p.workDays}/${p.restDays}` : '';
  // Boshi va oxiri bir xil ("11:00–11:00") — AI soatni ajrata olmagan;
  // noto'g'ri jadvaldan ko'ra bo'sh joy yaxshiroq
  const hours = TIME.test(p.hoursFrom || '') && TIME.test(p.hoursTo || '') &&
    pad(p.hoursFrom) !== pad(p.hoursTo)
    ? `${pad(p.hoursFrom)}–${pad(p.hoursTo)}` : '';
  return [days, hours].filter(Boolean).join(', ');
}

/** "Ovqat · Forma · Yo'l kira" (+ bitta qisqa izoh oxirida) */
function makeConditions(p) {
  const perks = [...new Set((p.perks || []).filter(k => PERKS[k]))].map(k => PERKS[k]);
  const other = String(p.other || '').trim().replace(/\s+/g, ' ').slice(0, 90);
  return [...perks, other].filter(Boolean).join(' · ');
}

// Maosh oylik so'mda bo'lishi kerak. AI "4" (million nazarda tutib)
// yoki dollar qaytarsa — qabul qilmaymiz, bo'sh qolgani yaxshiroq.
const salary = n => Number.isInteger(n) && n >= 300000 && n <= 100000000 ? n : null;

// ── Taklifni tahlil qilish ───────────────────────────────────

const OFFER_SCHEMA = {
  type: 'object',
  properties: {
    salaryFrom: { type: 'integer', nullable: true },
    salaryTo:   { type: 'integer', nullable: true },
    shift:      { type: 'string',  nullable: true },
    workDays:   { type: 'integer', nullable: true },
    restDays:   { type: 'integer', nullable: true },
    hoursFrom:  { type: 'string',  nullable: true },
    hoursTo:    { type: 'string',  nullable: true },
    perks:      { type: 'array', items: { type: 'string' } },
    startDate:  { type: 'string',  nullable: true },
    headcount:  { type: 'integer', nullable: true },
    minAge:     { type: 'integer', nullable: true },
    maxAge:     { type: 'integer', nullable: true },
    other:      { type: 'string',  nullable: true }
  },
  required: ['salaryFrom', 'salaryTo', 'shift', 'workDays', 'restDays', 'hoursFrom',
             'hoursTo', 'perks', 'startDate', 'headcount', 'minAge', 'maxAge', 'other']
};

const OFFER_SYSTEM = `Sen ish beruvchining erkin matnli taklifini vakansiya
maydonlariga ajratasan. Matn o'zbek yoki rus tilida, xatolar bilan bo'lishi mumkin.

QOIDALAR:
- Faqat matnda AYTILGAN narsani yoz. Aytilmagan maydon — null (perks — []).
  Taxmin qilma, o'ylab topma.
- salaryFrom/salaryTo — OYLIK maosh, butun so'mda: "4 mln" -> 4000000,
  "4-5 million" -> 4000000 va 5000000, "5 mln gacha" -> salaryTo=5000000.
  Bitta summa aytilsa — ikkalasiga ham shu summa.
  Dollar, kunlik yoki smenalik to'lov bo'lsa — salary null, uni "other" ga yoz.
- shift: "kunduzgi" | "kechki" | "ikkalasi" | null.
- workDays/restDays: "6/1" -> 6 va 1; "2/2" -> 2 va 2; "haftada 5 kun" -> 5 va 2.
- hoursFrom/hoursTo: "HH:MM" formatida, "10 dan 22 gacha" -> "10:00", "22:00".
  Faqat bittasi aytilsa ikkinchisi null — uni TAKRORLAMA va taxmin qilma.
- perks — FAQAT shu kalitlardan: ${Object.keys(PERKS).join(', ')}.
  ovqat=ovqat/obed; forma=forma/kiyim; yol=yo'l kira puli; transport=xizmat
  avtobusi; rasmiy=rasmiy/trudovoy; bonus=bonus/premiya/foiz; choy=choy puli;
  turar=yotoqxona/turar joy; oqitish=o'qitamiz/tajribasiz ham bo'ladi.
- startDate: "YYYY-MM-DD". "darhol"/"hoziroq"/"ertadan" — bugungi yoki ertangi
  sana. Bugun: {TODAY}. Aytilmasa null.
- headcount: nechta odam kerak, aytilmasa null.
- minAge/maxAge: yosh talabi aytilsa.
- other: yuqoridagilarga sig'magan MUHIM shart, o'zbekcha, 8 so'zdan oshmasin,
  bosh harf bilan, nuqtasiz. Masalan: "Kunlik 200 000 so'm" yoki
  "Rus tili shart". Bo'lmasa null. Mijozning jumlasini ko'chirma.`;

async function parseOffer(text, agencyId) {
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   // Toshkent
  const r = await ai.complete({
    system: OFFER_SYSTEM.replace('{TODAY}', today),
    messages: [{ role: 'user', content: String(text).slice(0, 600) }],
    json: true,
    schema: OFFER_SCHEMA,
    maxTokens: 400,
    tier: 'fast',
    restaurantId: agencyId
  });
  return r && typeof r === 'object' ? r : null;
}

// AI javobini vakansiya maydonlariga aylantiradi. Har maydon alohida
// tekshiriladi — AI bitta maydonda adashsa, qolganlari baribir yoziladi.
function offerFields(p) {
  const out = {};
  const from = salary(p.salaryFrom), to = salary(p.salaryTo);
  if (from || to) {
    out.salaryFrom = from && to ? Math.min(from, to) : from;
    out.salaryTo   = from && to ? Math.max(from, to) : to;
  }
  if (vac.SHIFTS.includes(p.shift)) out.shift = p.shift;

  const schedule = makeSchedule(p);
  if (schedule) out.schedule = schedule;
  const conditions = makeConditions(p);
  if (conditions) out.conditions = conditions;

  if (p.startDate && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) {
    const d = new Date(p.startDate + 'T00:00:00+05:00');
    // O'tgan sana — AI adashgan; bir kunlik zaxira vaqt mintaqasi uchun
    if (!isNaN(d.getTime()) && d.getTime() > Date.now() - 864e5) out.startDate = d;
  }
  if (Number.isInteger(p.headcount) && p.headcount >= 1 && p.headcount <= 200) out.headcount = p.headcount;
  if (Number.isInteger(p.minAge) && p.minAge >= 14 && p.minAge <= 80) out.minAge = p.minAge;
  if (Number.isInteger(p.maxAge) && p.maxAge >= 14 && p.maxAge <= 80) out.maxAge = p.maxAge;
  return out;
}

// ── Qidiruvdan vakansiya ─────────────────────────────────────
// Shu lavozimga ochiq vakansiya bo'lsa — yangisini ochmaymiz, tanlov
// unga bog'lanadi. Aks holda har qidiruvdan bittadan vakansiya yig'ilib,
// mijoz kabineti o'nlab mayda nusxalarga to'lib ketardi.
async function ensureFromSearch({ agencyId, client, criteria = {} }) {
  const role = isValidRole(criteria.role) ? criteria.role : '';
  const shift = vac.SHIFTS.includes(criteria.shift) ? criteria.shift : '';
  const minExp = Number.isInteger(criteria.minExp) && criteria.minExp >= 0 && criteria.minExp <= 50
    ? criteria.minExp : null;
  const languages = Array.isArray(criteria.languages)
    ? criteria.languages.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8) : [];
  const location = String(criteria.location || client.location || '').trim().slice(0, 80);
  const salaryTo = salary(criteria.maxSalary);

  if (role) {
    // Lavozimi 'boshqa' bo'lgan eski qo'lda yozilganlarni ham sarlavhasi
    // bo'yicha tanib olamiz ("Xostes" -> xostess). Aks holda mijoz qo'lda
    // ochgan vakansiya yonida xuddi shunday ikkinchisi paydo bo'lardi.
    const open = await Vacancy.find({
      agencyId, clientId: client.id, status: { $ne: 'closed' }
    }).sort({ createdAt: -1 }).limit(50);
    const v = open.find(x => x.role === role) ||
              open.find(x => !isValidRole(x.role) && vac.guessRole(x.title) === role);
    if (v) {
      // Faqat BO'SH maydonlarni to'ldiramiz — mijoz o'zi yozganini bosmaymiz
      let changed = false;
      if (v.role !== role) { v.role = role; changed = true; }   // eski 'boshqa' tuzaladi
      const fill = (k, val) => {
        const empty = v[k] == null || v[k] === '' || (Array.isArray(v[k]) && !v[k].length);
        if (empty && val != null && val !== '' && !(Array.isArray(val) && !val.length)) {
          v[k] = val; changed = true;
        }
      };
      fill('shift', shift); fill('minExp', minExp); fill('languages', languages);
      fill('location', location); fill('salaryTo', salaryTo);
      if (changed) {
        if (v.source === 'search') v.title = makeTitle(v.role, v.shift);
        v.updatedAt = new Date();
        await v.save();
      }
      return v;
    }
  }

  return Vacancy.create({
    id: uuidv4(), agencyId, clientId: client.id,
    source: 'search', listed: false,
    title: makeTitle(role, shift),
    role: role || 'boshqa',
    shift, minExp, languages, location, salaryTo
  });
}

// ── Taklifni vakansiyaga yozish ──────────────────────────────
/**
 * @returns {Promise<{vacancy:object|null, parsed:boolean}>}
 *   parsed=false — AI ishlamadi; xom matn faqat agentlik eslatmasiga tushdi
 */
async function applyOffer({ agencyId, shortlistId, text }) {
  const sl = await Shortlist.findOne({ agencyId, id: shortlistId }, 'vacancyId').lean();
  if (!sl || !sl.vacancyId) return { vacancy: null, parsed: false };
  const v = await Vacancy.findOne({ agencyId, id: sl.vacancyId });
  if (!v) return { vacancy: null, parsed: false };

  let fields = null;
  try {
    const p = await parseOffer(text, agencyId);
    if (p) fields = offerFields(p);
  } catch (e) {
    console.error('[VAC] taklif tahlil qilinmadi:', e.message);
  }

  if (fields && Object.keys(fields).length) {
    Object.assign(v, fields);
    if (v.source === 'search') v.title = makeTitle(v.role, v.shift);
  } else {
    // Xom matn nomzodga KO'RINMAYDI (forCandidate'da notes yo'q) —
    // agentlik qo'ng'iroqda o'qiydi, shablon maydonlari bo'sh qoladi
    v.notes = [v.notes, `Mijoz taklifi: ${String(text).slice(0, 400)}`]
      .filter(Boolean).join('\n').slice(0, 600);
  }
  v.updatedAt = new Date();
  await v.save();
  return { vacancy: v, parsed: !!(fields && Object.keys(fields).length) };
}

// ── Botdagi ko'rinish ────────────────────────────────────────
// Mijozga ham, agentlikka ham bir xil shablon: nima yozib olinganini
// ko'rib, xato bo'lsa kabinetda tuzatadi.
// Oy nomlari qo'lda: 'uz-UZ' lokali ICU'da to'liq bo'lmasa "M10 25"
// chiqaradi. Toshkent vaqti (+5) ham qo'lda: server UTC'da ishlaydi va
// "25-oktabr 00:00 Toshkent" aks holda "24-oktabr" bo'lib ko'rinardi.
const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul',
               'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function dmy(d) {
  const x = new Date(new Date(d).getTime() + 5 * 3600e3);
  return `${x.getUTCDate()}-${OYLAR[x.getUTCMonth()]}`;
}

function templateText(v) {
  return [
    `📋 ${v.title}`,
    vac.salaryText(v) ? `Maosh: ${vac.salaryText(v)}` : '',
    v.schedule   ? `Jadval: ${v.schedule}` : '',
    v.conditions ? `Sharoit: ${v.conditions}` : '',
    v.location   ? `Hudud: ${v.location}` : '',
    v.startDate  ? `Boshlash: ${dmy(v.startDate)}` : '',
    v.headcount > 1 ? `Kerak: ${v.headcount} ta` : ''
  ].filter(Boolean).join('\n');
}

module.exports = {
  makeTitle, makeSchedule, makeConditions, offerFields, PERKS,
  ensureFromSearch, applyOffer, templateText
};
