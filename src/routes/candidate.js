// ── NOMZOD KABINETI ──────────────────────────────────────────
// Nomzod o'z profilini ko'radi va tahrirlaydi.
//
// Nega alohida route oilasi: bu yerda nomzod O'Z yozuvini o'zgartiradi.
// Agentlik route'lari (recruitment) bilan aralashtirsak, bir kun nomzod
// boshqa nomzodning ma'lumotini ko'rib qolishi mumkin. Chegara
// arxitektura darajasida.
//
// Avtorizatsiya: cookie emas, Telegram initData imzosi. Nomzod tgChatId
// bo'yicha topiladi — ya'ni u faqat o'zi bo'la oladi.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const Candidate = require('../models/Candidate');
const Shortlist = require('../models/Shortlist');
const Vacancy = require('../models/Vacancy');
const Application = require('../models/Application');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const vac = require('../services/vacancy');
const tg = require('../services/telegram');
const initData = require('../services/tgInitData');
const { isValidRole } = require('../data/roles');

const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p so\'rov' }
}));

const guard = asyncHandler(async (req, res, next) => {
  const raw = req.get('X-Telegram-Init-Data') || (req.body && req.body.initData) || '';
  const v = initData.verify(raw);
  if (!v.ok) return res.status(401).json({ error: 'Avtorizatsiya: ' + v.error });

  const cand = await Candidate.findOne({ tgChatId: String(v.user.id) });
  if (!cand) return res.status(403).json({ error: 'Profil topilmadi' });
  if (cand.tgState === 'blocked' || cand.tgState === 'stopped') {
    return res.status(403).json({ error: 'Profil faol emas' });
  }
  req.cand = cand;
  next();
});

// Nomzodga qaytariladigan maydonlar. Ichki narsalar (fitScore, rawText,
// notes, shownToClients) KO'RSATILMAYDI — ular agentlikning ishchi
// ma'lumoti, nomzod ko'rishi shart emas va noto'g'ri tushuniladi.
function profileOf(c) {
  return {
    fullName: c.fullName, phone: c.phone, email: c.email,
    desiredPosition: c.desiredPosition, role: c.role,
    age: c.age, location: c.location, shift: c.shift,
    experienceYears: c.experienceYears, experienceSummary: c.experienceSummary,
    education: c.education, salaryExpectation: c.salaryExpectation,
    languages: c.languages || [], skills: c.skills || [],
    workHistory: (c.workHistory || []).map(w => ({
      company: w.company, position: w.position, period: w.period
    })),
    hasPhoto: !!c.hasPhoto,
    jobStatus: c.jobStatus,
    sanitaryBook: c.sanitaryBook,
    sanitaryBookUntil: c.sanitaryBookUntil,
    confirmedAt: c.jobStatusAt
  };
}

// Profil to'ldirilganligi. Nomzodni oxirigacha olib borish uchun —
// "70% to'ldirilgan" ko'rsatkichi bo'sh joyni ko'rsatadi va odam uni
// yopgisi keladi. Og'irlik muhimlikka qarab: telefon va sanitar
// kitobcha restoran uchun hal qiluvchi.
const WEIGHTS = [
  ['fullName',          12],
  ['phone',             18],
  ['desiredPosition',   12],
  ['location',          10],
  ['age',                6],
  ['shift',              8],
  ['salaryExpectation',  8],
  ['experienceSummary', 10],
  ['languages',          8]
  // Sanitar kitobcha hozircha hisobga olinmaydi — O'zbekistonda
  // amalda har doim ham talab qilinmayapti. Maydon modelda qoldi,
  // kerak bo'lsa shu ro'yxatga qaytariladi.
];

function completeness(c) {
  let got = 0, total = 0;
  const missing = [];
  for (const [k, w] of WEIGHTS) {
    total += w;
    let filled;
    if (k === 'languages') filled = (c.languages || []).length > 0;
    else if (k === 'sanitaryBook') filled = !!c.sanitaryBook;
    else filled = !!c[k];
    if (filled) got += w; else missing.push(k);
  }
  return { percent: Math.round((got / total) * 100), missing };
}

router.get('/me', guard, asyncHandler(async (req, res) => {
  const c = req.cand;

  // Nomzodga ko'rsatiladigan statistika. Faqat HAQIQIY o'lchanadigan
  // narsalar: necha restoran uni tanlovga kiritgan va nechtasiga
  // kontakti ochilgan. "Ko'rishlar" ni hisoblamayapmiz — raqam
  // to'qib chiqarilmasin.
  const rows = await Shortlist.find(
    { agencyId: c.restaurantId, 'items.candidateId': c.id },
    'items'
  ).lean();

  let opened = 0;
  for (const r of rows) {
    for (const it of r.items) {
      if (it.candidateId === c.id && it.state === 'revealed') opened++;
    }
  }

  res.json(Object.assign(profileOf(c), {
    stats: { picked: rows.length, opened },
    completeness: completeness(c)
  }));
}));

// ── Profilni tahrirlash ──
// Faqat ro'yxatdagi maydonlar. Qolgani (rol tasnifi, AI bahosi, manba)
// o'zgarmaydi: ular agentlikning tahlili, nomzod qo'li tegmasin.
const TEXT = {
  fullName: 120, phone: 40, desiredPosition: 120, location: 80,
  shift: 40, salaryExpectation: 60, education: 200, experienceSummary: 1500
};
const LIST = { languages: 12, skills: 30 };
const JOB_STATUS = ['active', 'considering', 'not_looking'];

router.patch('/me', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = req.cand;

  for (const [k, max] of Object.entries(TEXT)) {
    if (b[k] !== undefined) c[k] = String(b[k]).trim().slice(0, max);
  }
  for (const [k, maxLen] of Object.entries(LIST)) {
    if (Array.isArray(b[k])) {
      c[k] = b[k].map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, maxLen);
    }
  }
  if (b.age !== undefined) {
    const n = parseInt(b.age, 10);
    c.age = Number.isFinite(n) && n >= 14 && n <= 80 ? n : null;
  }
  if (b.experienceYears !== undefined) {
    const n = parseInt(b.experienceYears, 10);
    c.experienceYears = Number.isFinite(n) && n >= 0 && n <= 60 ? n : 0;
  }
  if (b.role !== undefined && isValidRole(b.role)) c.role = b.role;

  if (b.jobStatus !== undefined && JOB_STATUS.includes(b.jobStatus)) {
    c.jobStatus = b.jobStatus;
    c.jobStatusAt = new Date();
  }
  if (b.sanitaryBook !== undefined && ['', 'yes', 'no', 'expired'].includes(b.sanitaryBook)) {
    c.sanitaryBook = b.sanitaryBook;
  }
  if (b.sanitaryBookUntil !== undefined) {
    const d = b.sanitaryBookUntil ? new Date(b.sanitaryBookUntil) : null;
    c.sanitaryBookUntil = d && !isNaN(d.getTime()) ? d : null;
  }

  // Nomzod o'zi tahrirlagan profil - endi "tasdiqlangan" hisoblanadi
  if (!c.jobStatusAt) c.jobStatusAt = new Date();
  c.updatedAt = new Date();
  await c.save();

  res.json({ ok: true, profile: profileOf(c) });
}));

// ══ ISH O'RINLARI ════════════════════════════════════════════
// Nomzod ochiq vakansiyalarni ko'radi va ariza beradi.
//
// Restoran nomi KO'RINMAYDI — faqat "Chilonzorda restoran". Nomzod
// nomni bilsa to'g'ridan-to'g'ri borib ishga kiradi va vositachilik
// ma'nosini yo'qotadi. Bu mijozni ham himoya qiladi: u nomzod ismini
// faqat kontakt ochilgach ko'radi. Ikki tomon ham teng anonim.

router.get('/vacancies', guard, asyncHandler(async (req, res) => {
  const c = req.cand;

  // Eskirganlarini ko'rsatmaymiz: tasdiqlanmagan vakansiya katta
  // ehtimol allaqachon to'lgan. Soxta e'lon muammosi shunday yopiladi.
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  // Diqqat: Candidate'da maydon `restaurantId`, Vacancy'da esa `agencyId` —
  // ikkalasi ham bitta agentlikni bildiradi.
  const rows = await Vacancy.find({
    agencyId: c.restaurantId,
    status: 'open',
    confirmedAt: { $gte: fresh }
  }).sort({ confirmedAt: -1 }).limit(60).lean();

  if (!rows.length) return res.json([]);

  // Hudud uchun mijoz ma'lumoti kerak — NOMI emas
  const cids = [...new Set(rows.map(r => r.clientId))];
  const clients = await Client.find({ agencyId: c.restaurantId, id: { $in: cids } }, 'id location').lean();
  const byId = Object.fromEntries(clients.map(x => [x.id, x]));

  // Qaysilariga allaqachon ariza berganini belgilaymiz
  const mine = await Application.find(
    { agencyId: c.restaurantId, candidateId: c.id }, 'vacancyId state').lean();
  const appMap = Object.fromEntries(mine.map(a => [a.vacancyId, a.state]));

  const out = rows.map(v => Object.assign(vac.forCandidate(v, byId[v.clientId]), {
    applied: !!appMap[v.id],
    appState: appMap[v.id] || '',
    // "Sizga mos" belgisi: lavozim bir xil va tajriba yetadi
    match: v.role === c.role && (!v.minExp || (c.experienceYears || 0) >= v.minExp)
  }));

  // Mos kelganlari yuqorida
  out.sort((a, b) => (b.match - a.match) || (a.freshDays - b.freshDays));
  res.json(out);
}));

router.post('/vacancies/:id/apply', guard, asyncHandler(async (req, res) => {
  const c = req.cand;
  const v = await Vacancy.findOne({ agencyId: c.restaurantId, id: req.params.id, status: 'open' }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi yoki yopilgan' });

  // Telefon bo'lmasa ariza befoyda — mijoz tanlasa ham bog'lana olmaymiz
  if (!c.phone) {
    return res.status(400).json({ error: 'Avval profilingizga telefon raqamini kiriting' });
  }

  try {
    const a = await Application.create({
      id: uuidv4(),
      agencyId: c.restaurantId,
      vacancyId: v.id,
      candidateId: c.id,
      clientId: v.clientId,
      message: String((req.body || {}).message || '').trim().slice(0, 500)
    });

    // Ariza bergan odam ish qidiryapti — holatini shunga keltiramiz
    if (c.jobStatus !== 'active') {
      c.jobStatus = 'active';
      c.jobStatusAt = new Date();
      await c.save();
    }

    // Sizga xabar
    try {
      const agency = await Restaurant.findOne({ id: c.restaurantId });
      const chat = agency && agency.telegram && agency.telegram.adminChatId;
      if (chat) {
        await tg.sendMessage(tg.platformToken(), chat,
          `📨 Yangi ariza\n\n${c.fullName || 'Nomsiz'} — ${v.title}\n` +
          `${c.desiredPosition || ''}${c.experienceYears ? ' · ' + c.experienceYears + ' yil' : ''}\n` +
          `${c.phone || ''}`);
      }
    } catch (e) { console.error('[CAND] ariza xabari ketmadi:', e.message); }

    res.json({ ok: true, id: a.id });
  } catch (e) {
    // unique indeks: takroriy ariza
    if (e.code === 11000) return res.status(409).json({ error: 'Bu vakansiyaga allaqachon ariza bergansiz' });
    throw e;
  }
}));

// ── Arizalarim ──
const APP_LABEL = {
  new:         'Ko\'rib chiqilmoqda',
  seen:        'Ko\'rildi',
  shortlisted: 'Tanlandi — HR bog\'lanadi',
  rejected:    'Rad etildi'
};

router.get('/applications', guard, asyncHandler(async (req, res) => {
  const c = req.cand;
  const rows = await Application.find({ agencyId: c.restaurantId, candidateId: c.id })
    .sort({ createdAt: -1 }).limit(50).lean();
  if (!rows.length) return res.json([]);

  const vids = rows.map(r => r.vacancyId);
  const vs = await Vacancy.find({ agencyId: c.restaurantId, id: { $in: vids } }).lean();
  const vById = Object.fromEntries(vs.map(v => [v.id, v]));

  const cids = [...new Set(vs.map(v => v.clientId))];
  const clients = await Client.find({ agencyId: c.restaurantId, id: { $in: cids } }, 'id location').lean();
  const clById = Object.fromEntries(clients.map(x => [x.id, x]));

  res.json(rows.map(a => {
    const v = vById[a.vacancyId];
    return {
      id: a.id,
      state: a.state,
      stateLabel: APP_LABEL[a.state] || a.state,
      createdAt: a.createdAt,
      vacancy: v ? vac.forCandidate(v, clById[v.clientId]) : null
    };
  }));
}));

// ── O'z fotosi ──
router.get('/photo', asyncHandler(async (req, res) => {
  const v = initData.verify(req.query.i || '');
  if (!v.ok) return res.status(401).end();

  const c = await Candidate.findOne({ tgChatId: String(v.user.id) }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

module.exports = router;
