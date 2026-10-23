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
const Vacancy = require('../models/Vacancy');
const Application = require('../models/Application');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const vac = require('../services/vacancy');
const initData = require('../services/tgInitData');
const photoToken = require('../utils/photoToken');
const { isValidRole } = require('../data/roles');
const chat = require('../services/chat');
const contactView = require('../services/contactView');
const applyReveal = require('../services/applyReveal');
const ChatThread = require('../models/ChatThread');
const botRelay = require('../services/botRelay');
const applications = require('../services/applications');
const { publicBase } = require('../utils/publicBase');
const { phoneKey } = require('../utils/candidateKeys');
const appLife = require('../services/appLife');

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
  // expired — Mini App bir kundan ortiq ochiq turgan (initData 24 soat amal
  // qiladi). Kabinet "ilovani yopib qayta oching" deydi — ilgari xato
  // ko'rinmay, tugma jimgina qaytib qolardi (2026-10-22, ariza berilmadi).
  if (!v.ok) return res.status(401).json({ error: 'Avtorizatsiya: ' + v.error, code: v.error === 'imzo eskirgan' ? 'expired' : 'auth' });

  res.set('X-Photo-Token', photoToken.sign(v.user.id));   // rasm havolasi uchun (utils/photoToken)
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
    experienceYears: c.experienceYears, experienceMonths: c.experienceMonths || 0, experienceSummary: c.experienceSummary,
    education: c.education, salaryExpectation: c.salaryExpectation,
    languages: c.languages || [], skills: c.skills || [],
    workHistory: (c.workHistory || []).map(w => ({
      company: w.company, position: w.position, period: w.period
    })),
    hasPhoto: !!c.hasPhoto,
    source: c.source,                 // anketa nomzodida tajriba yozuvi tizimniki (profil.html autoSummary)
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
      // revealedAt bo'yicha, holat bo'yicha EMAS: mijoz "suhbat belgilandi"
      // yoki "ishga oldim" qo'ygach holat o'zgaradi, kontakt esa ochiqligicha
      // qoladi (mijoz kabinetidagi 3c6caca tuzatishi bilan bir xil mantiq)
      if (it.candidateId === c.id && it.revealedAt && it.state !== 'refunded') opened++;
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

  const phoneBefore = phoneKey(c.phone);
  for (const [k, max] of Object.entries(TEXT)) {
    if (b[k] !== undefined) c[k] = String(b[k]).trim().slice(0, max);
  }
  // Boshqa raqam yozilsa — u Telegram tasdiqlagan raqam emas: panelda
  // "✓" turib qolmasin (format o'zgarishi — "+998 90..." -> "90..." — emas)
  if (phoneKey(c.phone) !== phoneBefore) c.phoneVerifiedAt = null;
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

// ── Kimlik qoidasi nomzod tomonida ──
// Mijoz tomonidagi whoOf() ning juftligi: kontakt ochilgan mijozning
// vakansiyasi — kompaniya NOMI bilan; ochilmagan — faqat hudud
// ("Chilonzorda restoran"). Ro'yxatlar shundan o'tadi.
async function openClientIds(c) {
  const pairs = await contactView.openPairs({ agencyId: c.restaurantId, candidateId: c.id });
  return new Set(pairs.map(p => p.clientId));
}
function vacFor(v, cl, openSet) {
  const out = vac.forCandidate(v, cl);
  const open = !!(cl && openSet.has(cl.id));
  if (open && cl.name) out.place = [cl.name, v.location || cl.location].filter(Boolean).join(' · ');
  out.companyOpen = open;
  out.clientId = open ? cl.id : '';           // kompaniya kartasini ochish uchun
  return out;
}

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
    listed: { $ne: false },            // avtomatik (yopiq) vakansiyalar ko'rinmaydi
    confirmedAt: { $gte: fresh },
    ...(c.isTest ? {} : { isTest: { $ne: true } })      // sinov mijozining vakansiyasi — faqat sinov nomzodiga
  }).sort({ confirmedAt: -1 }).limit(60).lean();

  if (!rows.length) return res.json([]);

  // Hudud uchun mijoz ma'lumoti; NOM faqat kontakt ochilgan mijozda (vacFor)
  const cids = [...new Set(rows.map(r => r.clientId))];
  const [clients, openSet] = await Promise.all([
    Client.find({ agencyId: c.restaurantId, id: { $in: cids } }, 'id name location status').lean(),
    openClientIds(c)
  ]);
  const byId = Object.fromEntries(clients.map(x => [x.id, x]));

  // Qaysilariga allaqachon ariza berganini belgilaymiz
  const mine = await Application.find(
    { agencyId: c.restaurantId, candidateId: c.id }, 'vacancyId state').lean();
  const appMap = Object.fromEntries(mine.map(a => [a.vacancyId, a.state]));

  const out = rows.map(v => Object.assign(vacFor(v, byId[v.clientId], openSet), {
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
  const v = await Vacancy.findOne({
    agencyId: c.restaurantId, id: req.params.id, status: 'open', listed: { $ne: false },
    ...(c.isTest ? {} : { isTest: { $ne: true } })
  }).lean();
  // code — kabinet xatoni tushunarli qilib ko'rsatadi va kerakli joyga yo'naltiradi
  if (!v) return res.status(404).json({ error: 'Bu vakansiya yopilgan yoki o\'chirilgan', code: 'closed' });

  // Ism va telefonsiz ariza befoyda — HR kimga qo'ng'iroq qilishini bilmaydi.
  // Format ham tekshiriladi: arizadan mijoz kontaktni o'zi ochadi (kredit
  // bilan) — bitta harf yozilgan "telefon" uchun pul ketmasin (audit #20).
  if (!String(c.fullName || '').trim()) {
    return res.status(400).json({ error: 'Avval profilingizga ismingizni yozing', code: 'no_name' });
  }
  if (!c.phone) {
    return res.status(400).json({ error: 'Avval profilingizga telefon raqamini kiriting', code: 'no_phone' });
  }
  if (!applyReveal.validPhone(c.phone)) {
    return res.status(400).json({ error: 'Telefon raqamingizni to\'g\'ri kiriting: +998 90 123 45 67', code: 'bad_phone' });
  }

  try {
    // Ariza, holat va ikki xabar — yagona yo'l (anketa ham shundan o'tadi)
    const a = await applications.submit({ cand: c, vacancy: v,
      message: (req.body || {}).message, appBase: publicBase(req), via: 'kabinet' });
    res.json({ ok: true, id: a.id, stageLabel: appLife.STEP_LABEL.sent });
  } catch (e) {
    // unique indeks: takroriy ariza
    if (e.code === 11000) return res.status(409).json({ error: 'Bu vakansiyaga allaqachon ariza bergansiz', code: 'duplicate' });
    throw e;
  }
}));

// ── Arizalarim ── (bosqichlar — services/appLife)
router.get('/applications', guard, asyncHandler(async (req, res) => {
  const c = req.cand;
  const rows = await Application.find({ agencyId: c.restaurantId, candidateId: c.id })
    .sort({ createdAt: -1 }).limit(50).lean();
  if (!rows.length) return res.json([]);

  const vids = rows.map(r => r.vacancyId);
  const vs = await Vacancy.find({ agencyId: c.restaurantId, id: { $in: vids } }).lean();
  const vById = Object.fromEntries(vs.map(v => [v.id, v]));

  const cids = [...new Set(vs.map(v => v.clientId))];
  const [clients, openSet] = await Promise.all([
    Client.find({ agencyId: c.restaurantId, id: { $in: cids } }, 'id name location status').lean(),
    openClientIds(c)
  ]);
  const clById = Object.fromEntries(clients.map(x => [x.id, x]));
  // Tanlovga o'tganlarining bosqichi (suhbat, natija) — Shortlist elementidan
  const sls = await Shortlist.find({ agencyId: c.restaurantId, id: { $in: rows.map(r => r.shortlistId).filter(Boolean) } }, 'id items').lean();
  const slById = Object.fromEntries(sls.map(s => [s.id, s]));

  res.json(rows.map(a => {
    const v = vById[a.vacancyId];
    const vv = v ? vacFor(v, clById[v.clientId], openSet) : null;
    const sl = slById[a.shortlistId];
    const item = sl ? (sl.items || []).find(i => i.candidateId === c.id) : null;
    const life = appLife.stepsFor(a, item);
    return {
      id: a.id,
      state: a.state,
      // Kontakt ochilgan bo'lsa — aniq holat; aks holda bosqichlar yo'li
      stateLabel: vv && vv.companyOpen && !life.final ? 'Kontakt ochildi — ish beruvchi bog\'lanadi' : life.stageLabel,
      tone: life.tone,
      steps: life.steps,
      final: life.final,
      message: a.message,
      createdAt: a.createdAt,
      vacancy: vv
    };
  }));
}));

// ── O'z fotosi ──
router.get('/photo', asyncHandler(async (req, res) => {
  const uid = photoToken.verify(req.query.t);
  if (!uid) return res.status(401).end();

  const c = await Candidate.findOne({ tgChatId: uid }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ══ SUHBATLAR ═══════════════════════════════════════════════
// Tepada qadalgan "TalentHub ✓", ostida kontaktini ochgan mijozlar.
//
// Qadalgan suhbat ChatThread'da EMAS — u mavjud Telegram yozishmasi
// (BotMessage). Shuning uchun id'si maxsus: chat.AGENCY_THREAD.
// Unga yozilgan xabar botRelay orqali admin chatiga boradi, ya'ni siz
// uni Telegramda ko'rasiz — yangi inbox kuzatish shart emas.

router.get('/chats', guard, asyncHandler(async (req, res) => {
  const agencyId = req.cand.restaurantId;
  // "TalentHub" suhbatining o'qilganlik chegarasi — birinchi ko'rishda qo'yiladi
  let seenAt = req.cand.supportSeenAt;
  if (!seenAt) {
    seenAt = new Date();
    await Candidate.updateOne({ restaurantId: agencyId, id: req.cand.id }, { $set: { supportSeenAt: seenAt } });
  }
  const rows = await chat.inboxForCandidate(agencyId, req.cand.id, seenAt);

  // Mijozni NOMI bilan ko'rsatamiz: kontakt ochilgan, ya'ni tanishish
  // allaqachon bo'lgan. Anonimlik faqat kontaktgacha amal qiladi.
  const ids = rows.filter(r => r.clientId).map(r => r.clientId);
  const cl = ids.length
    ? await Client.find({ agencyId, id: { $in: ids } }, 'id name location logoAt').lean()   // logoAt — bor/yo'q (rasmning o'zi emas)
    : [];
  const by = Object.fromEntries(cl.map(c => [c.id, c]));

  // Kompaniya kartasi faqat ochiq kontaktda (kredit qaytarilmagan)
  const pairs = ids.length
    ? await contactView.openPairs({ agencyId, candidateId: req.cand.id })
    : [];
  const open = new Set(pairs.map(p => p.clientId));

  res.json(rows.map(r => {
    if (!r.clientId) return r;
    const c = by[r.clientId] || {};
    return Object.assign({}, r, {
      title: c.name || 'Ish beruvchi',
      subtitle: r.lastMsgText || c.location || '',
      open: open.has(r.clientId),
      // Logotip faqat ochiq kontaktda (endpoint ham shuni tekshiradi)
      hasLogo: open.has(r.clientId) && !!c.logoAt, logoAt: open.has(r.clientId) ? c.logoAt : null
    });
  }));
}));

// ── Kompaniya logotipi — faqat kontakt ochilgan bo'lsa (kartadagi qoida) ──
// <img> sarlavha yubora olmaydi — rasm tokeni (?t=, utils/photoToken).
router.get('/companies/:clientId/logo', asyncHandler(async (req, res) => {
  const uid = photoToken.verify(req.query.t);
  if (!uid) return res.status(401).end();
  const cand = await Candidate.findOne({ tgChatId: uid }, 'id restaurantId').lean();
  if (!cand) return res.status(403).end();
  if (!await contactView.isOpenPair({ agencyId: cand.restaurantId, clientId: req.params.clientId, candidateId: cand.id })) {
    return res.status(403).end();
  }
  const cl = await Client.findOne({ agencyId: cand.restaurantId, id: req.params.clientId }, 'logo').lean();
  const m = cl && /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(cl.logo || '');
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ── Kompaniya kartasi va vakansiya — faqat kontakt ochilgan bo'lsa ──
// Vakansiya tanlovdan olinadi: qidiruvdan kelgan tanlovda u avtomatik
// yaratilgan (vacancyAuto), arizadan kelganda — nomzod ariza bergani.
// Kontakt ochilgan, shuning uchun vakansiya yopiq (listed:false)
// bo'lsa ham ko'rsatiladi: u aynan shu nomzod uchun.
router.get('/companies/:clientId', guard, asyncHandler(async (req, res) => {
  const agencyId = req.cand.restaurantId;
  const pairs = (await contactView.openPairs({ agencyId, candidateId: req.cand.id }))
    .filter(p => p.clientId === req.params.clientId);
  if (!pairs.length) return res.status(403).json({ error: 'Kontakt ochilmagan' });

  const cl = await Client.findOne({ agencyId, id: req.params.clientId }).lean();
  if (!cl) return res.status(404).json({ error: 'Kompaniya topilmadi' });

  const vids = [...new Set(pairs.map(p => p.vacancyId).filter(Boolean))];
  const vs = vids.length
    ? await Vacancy.find({ agencyId, id: { $in: vids } }).lean()
    : [];

  res.json({
    company: contactView.companyOf(cl),
    // forCandidate ishlatamiz, lekin "place" endi nom bilan: kontakt ochilgan
    vacancies: vs.map(v => Object.assign(vac.forCandidate(v, cl), {
      place: [cl.name, v.location || cl.location].filter(Boolean).join(' · '),
      closed: v.status === 'closed'
    }))
  });
}));

// ── O'qilmaganlar soni — pastki paneldagi belgi uchun ──
// Mijoz suhbatlari (ChatThread) + qadalgan "TalentHub" (BotMessage, vaqt bo'yicha)
router.get('/unread', guard, asyncHandler(async (req, res) => {
  const [r, sup] = await Promise.all([
    ChatThread.aggregate([
      { $match: { agencyId: req.cand.restaurantId, candidateId: req.cand.id, kind: 'cc', unreadCandidate: { $gt: 0 } } },
      { $group: { _id: null, n: { $sum: '$unreadCandidate' } } }
    ]),
    chat.supportUnread(req.cand.restaurantId, req.cand.id, req.cand.supportSeenAt)
  ]);
  res.json({ chats: ((r[0] && r[0].n) || 0) + sup });
}));

router.get('/chats/:id/messages', guard, asyncHandler(async (req, res) => {
  const agencyId = req.cand.restaurantId;

  if (req.params.id === chat.AGENCY_THREAD) {
    const msgs = await chat.messages({ agencyId, threadId: chat.AGENCY_THREAD, candidateId: req.cand.id });
    // Ochdi — o'qildi
    await Candidate.updateOne({ restaurantId: agencyId, id: req.cand.id }, { $set: { supportSeenAt: new Date() } });
    return res.json({ id: chat.AGENCY_THREAD, kind: 'ca', state: 'open', messages: msgs });
  }

  // candidateId shart: boshqa nomzodning suhbatini ocholmasin
  const th = await ChatThread.findOne({ agencyId, id: req.params.id, candidateId: req.cand.id });
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  const msgs = await chat.messages({ agencyId, threadId: th.id });
  await chat.markRead({ agencyId, threadId: th.id, side: 'candidate' });
  res.json({ id: th.id, kind: th.kind, state: th.state, messages: msgs });
}));

router.post('/chats/:id/messages', guard, asyncHandler(async (req, res) => {
  const agencyId = req.cand.restaurantId;
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Xabar bo\'sh' });

  // Agentlikka — Telegram webhook bilan BIR XIL yo'l: BotMessage yoziladi
  // (nomzod o'z xabarini suhbatda ko'radi) va adminMsgId saqlanadi
  // (admin reply qilsa javob shu nomzodga qaytadi)
  if (req.params.id === chat.AGENCY_THREAD) {
    const rest = await Restaurant.findOne({ id: agencyId });
    if (!rest) return res.status(404).json({ error: 'Agentlik topilmadi' });
    const m = await botRelay.receiveFromCandidate(rest, req.cand, text.slice(0, 3800),
      { sentBy: 'miniapp' });
    return res.json({ ok: true, id: m.id, createdAt: m.createdAt });
  }

  const th = await ChatThread.findOne({ agencyId, id: req.params.id, candidateId: req.cand.id });
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  try {
    const m = await chat.post({ agencyId, threadId: th.id, from: 'candidate', text,
      appBase: publicBase(req) });
    res.json({ ok: true, id: m.id, createdAt: m.createdAt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

module.exports = router;
