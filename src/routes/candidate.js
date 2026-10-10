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
const Candidate = require('../models/Candidate');
const Shortlist = require('../models/Shortlist');
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
  ['languages',          8],
  ['sanitaryBook',       8]
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
