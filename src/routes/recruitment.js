// ── NOMZODLAR BAZASI (REKRUTING) ─────────────────────────────
// Restoran admini hh.uz'dan (yoki boshqa manbadan) O'ZI yuklab olgan
// rezyume fayllarini bu yerga yuklaydi. Platforma ularni o'qiydi
// (PDF matn -> AI tahlil), bazaga saqlaydi va keyin filtr/qidiruv
// beradi. Hech qanday tashqi saytga ulanish yo'q.

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Candidate = require('../models/Candidate');
const Restaurant = require('../models/Restaurant');
const BotMessage = require('../models/BotMessage');
const Shortlist = require('../models/Shortlist');
const Application = require('../models/Application');
const relay = require('../services/botRelay');
const candidateSearch = require('../services/candidateSearch');
const resumeParser = require('../services/resumeParser');
const ai = require('../services/ai');
const aiQuota = require('../services/aiQuota');
const { isValidRole, guessRole } = require('../data/roles');
const { mergeParsed } = require('../utils/mergeParsed');
const { phoneKey, emailKey, textHash } = require('../utils/candidateKeys');
const contactLog = require('../services/contactLog');
const SurveyResponse = require('../models/SurveyResponse');

const router = express.Router();
// Faqat TalentHub agentligi (middleware/agency — o'tish rejimi bilan)
const guard = require('../middleware/agency').agencyAuth;

const MAX_RAW = 20000;                 // saqlanadigan xom matn chegarasi
const MAX_FILE_STORE = 5 * 1024 * 1024; // 5 MB dan katta faylni base64 saqlmaymiz
// Kanban bosqichlari (recruiting voronka) — frontend ustunlari shu tartibda.
const VALID_STATUS = ['new', 'phone', 'interview', 'interview2', 'trial', 'hired', 'reserve', 'rejected'];
const VALID_SOURCE = ['hh', 'manual', 'referral', 'telegram', 'anketa', 'other'];   // anketa — services/survey

// Fayllar xotirada (buffer) — PDF matnini ajratamiz va (kerak bo'lsa) base64 saqlaymiz.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|text|plain/i.test(file.mimetype) || /\.(pdf|txt)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Faqat PDF yoki matn (.txt) fayl yuklash mumkin'), ok);
  }
});

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Ish tarixi massivini tozalab, tipli qiladi (PATCH va qo'lda qo'shishda ishlatiladi)
function sanitizeWork(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.slice(0, 12).map(w => ({
    company:     String((w && w.company)     || '').slice(0, 100),
    position:    String((w && w.position)    || '').slice(0, 100),
    period:      String((w && w.period)      || '').slice(0, 60),
    description: String((w && w.description) || '').slice(0, 600)
  })).filter(w => w.company || w.position || w.period || w.description);
}

// Bitta xom matndan (yoki fayldan) Candidate hujjati yasaydi va saqlaydi.
async function buildAndSave({ restaurantId, rawText, fileName, fileType, fileBuffer, source, branch }) {
  // Dublikat tekshiruvi — bir nomzod ikki marta kirmasin (utils/candidateKeys).
  // 1) Matn izi AI'DAN OLDIN: bitta PDF qayta yuklansa kvota sarflanmaydi,
  //    hh anonim rezyumelari (ism/telefonsiz) ham shu bilan tutiladi.
  const tHash = textHash(rawText);
  if (tHash) {
    const same = await Candidate.findOne({ restaurantId, textHash: tHash }, 'fullName').lean();
    if (same) return { duplicate: true, name: same.fullName || fileName };
  }

  const { fields, aiParsed } = await resumeParser.structure(rawText, restaurantId);

  // 2) Telefon (oxirgi 9 raqam — formatdan qat'i nazar) yoki email.
  // Ilgari telefon MATN sifatida aynan solishtirilardi va "+998 90 ..." bilan
  // "+99890..." ikki xil odam bo'lib qolardi — bazada 50 ta dublikat shundan.
  const pk = phoneKey(fields.phone), ek = emailKey(fields.email);
  const or = [];
  if (pk) or.push({ phoneKey: pk });
  if (ek) or.push({ email: new RegExp('^' + escapeRegex(ek) + '$', 'i') });
  if (or.length) {
    const exists = await Candidate.findOne({ restaurantId, $or: or }, '_id').lean();
    if (exists) return { duplicate: true, name: fields.fullName || fileName };
  }

  const storeFile = fileBuffer && fileBuffer.length <= MAX_FILE_STORE;
  // Rezyume PDF ichidan nomzod fotosini avtomat ajratamiz (bo'lsa)
  const photo = (fileBuffer && /pdf/i.test(fileType || '')) ? resumeParser.extractPhoto(fileBuffer) : '';
  const doc = await Candidate.create({
    id: uuidv4(),
    restaurantId,
    ...fields,
    rawText: String(rawText || '').slice(0, MAX_RAW),
    textHash: tHash,
    fileName: fileName || '',
    fileData: storeFile ? fileBuffer.toString('base64') : '',
    fileType: fileType || '',
    photo,
    hasPhoto: !!photo,
    branch: String(branch || '').slice(0, 80),
    source: VALID_SOURCE.includes(source) ? source : 'hh',
    status: 'new',
    statusChangedAt: new Date(),
    aiParsed
  });
  return { created: true, id: doc.id, name: doc.fullName || fileName, aiParsed };
}

// ── Rezyume fayllarini yuklash (bir yoki bir nechta PDF/txt) ──
router.post('/upload', guard, upload.array('files', 30), asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Fayl yuklanmadi' });
  const source = (req.body && req.body.source) || 'hh';
  const branch = (req.body && req.body.branch) || '';

  const results = { created: 0, duplicates: 0, failed: 0, items: [] };
  for (const file of files) {
    try {
      const rawText = await resumeParser.extractText(file.buffer, file.mimetype, file.originalname);
      if (!rawText || rawText.length < 20) {
        results.failed++;
        results.items.push({ file: file.originalname, ok: false, reason: 'Matn topilmadi (skanerlangan/bo\'sh PDF?)' });
        continue;
      }
      const r = await buildAndSave({
        restaurantId: req.user.restaurantId,
        rawText,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileBuffer: file.buffer,
        source,
        branch
      });
      if (r.duplicate) { results.duplicates++; results.items.push({ file: file.originalname, ok: true, duplicate: true, name: r.name }); }
      else { results.created++; results.items.push({ file: file.originalname, ok: true, id: r.id, name: r.name, aiParsed: r.aiParsed }); }
    } catch (err) {
      results.failed++;
      results.items.push({ file: file.originalname, ok: false, reason: err.message });
    }
  }
  res.json(results);
}));

// ── Matn joylash orqali qo'shish (PDF bo'lmasa / qo'lda) ──
router.post('/upload-text', guard, asyncHandler(async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (text.length < 20) return res.status(400).json({ error: 'Matn juda qisqa' });
  const r = await buildAndSave({
    restaurantId: req.user.restaurantId,
    rawText: text,
    fileName: (req.body && req.body.fileName) || 'Qo\'lda kiritilgan',
    fileType: 'text/plain',
    fileBuffer: null,
    source: (req.body && req.body.source) || 'manual',
    branch: (req.body && req.body.branch) || ''
  });
  if (r.duplicate) return res.json({ duplicate: true, name: r.name });
  res.json({ created: true, id: r.id, name: r.name, aiParsed: r.aiParsed });
}));

// ── Qo'lda nomzod qo'shish (rezyumesiz, to'g'ridan-to'g'ri maydonlar) ──
router.post('/manual', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Ism kiritilishi shart' });
  const doc = await Candidate.create({
    id: uuidv4(),
    restaurantId: req.user.restaurantId,
    photo: String(b.photo || '').slice(0, 400000),
    hasPhoto: !!(b.photo && String(b.photo).length),
    fullName: fullName.slice(0, 120),
    phone: String(b.phone || '').slice(0, 40),
    email: String(b.email || '').slice(0, 120),
    desiredPosition: String(b.desiredPosition || '').slice(0, 160),
    role: isValidRole(b.role) ? b.role : 'boshqa',
    experienceYears: Math.max(0, Math.min(60, parseInt(b.experienceYears, 10) || 0)),
    location: String(b.location || '').slice(0, 80),
    shift: ['kunduzgi', 'kechki', 'ikkalasi'].includes(b.shift) ? b.shift : '',
    branch: String(b.branch || '').slice(0, 80),
    languages: Array.isArray(b.languages) ? b.languages.map(s => String(s).trim()).filter(Boolean).slice(0, 25) : [],
    workHistory: sanitizeWork(b.workHistory) || [],
    notes: String(b.notes || '').slice(0, 2000),
    source: VALID_SOURCE.includes(b.source) ? b.source : 'manual',
    status: VALID_STATUS.includes(b.status) ? b.status : 'new',
    statusChangedAt: new Date(),
    aiParsed: false
  });
  res.json({ created: true, id: doc.id, name: doc.fullName });
}));

// ── Ro'yxat (filtr bilan) ──
router.get('/', guard, asyncHandler(async (req, res) => {
  const { q, role, status, source, language, minExp, sort } = req.query;
  const query = { restaurantId: req.user.restaurantId };

  if (role && role !== 'all') query.role = role;
  if (status && status !== 'all') query.status = status;
  // 'base' — hh.uz bazasi bo'limi: anketadan kelganlardan boshqa hammasi
  if (source === 'base') query.source = { $ne: 'anketa' };
  else if (source && source !== 'all') query.source = source;
  if (language && language !== 'all') query.languages = { $elemMatch: { $regex: escapeRegex(language), $options: 'i' } };
  const min = parseInt(minExp, 10);
  if (Number.isFinite(min) && min > 0) query.experienceYears = { $gte: min };

  if (q && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    query.$or = [
      { fullName: rx }, { phone: rx }, { email: rx }, { desiredPosition: rx },
      { location: rx }, { summary: rx }, { rawText: rx }, { skills: rx }, { tags: rx }
    ];
  }

  const sortMap = {
    new: { createdAt: -1 }, old: { createdAt: 1 },
    exp: { experienceYears: -1 }, name: { fullName: 1 }, rating: { rating: -1, createdAt: -1 },
    fit: { fitScore: -1, createdAt: -1 }
  };
  // tgInviteToken frontendga chiqmaydi — kim uni bilsa, o'sha nomzod
  // sifatida botga ulanib oladi.
  const list = await Candidate.find(query, '-fileData -rawText -photo -workHistory -tgInviteToken')
    .sort(sortMap[sort] || sortMap.new)
    .limit(1000)
    .lean();
  res.json(list);
}));

// ── Statistika (holatlar bo'yicha, filtrsiz umumiy) ──
router.get('/stats', guard, asyncHandler(async (req, res) => {
  const rows = await Candidate.aggregate([
    { $match: { restaurantId: req.user.restaurantId } },
    { $group: { _id: '$status', n: { $sum: 1 } } }
  ]);
  const byStatus = {};
  let total = 0;
  for (const r of rows) { byStatus[r._id] = r.n; total += r.n; }
  res.json({ total, byStatus });
}));

// ── Voronka analitikasi ──
router.get('/analytics', guard, asyncHandler(async (req, res) => {
  const rid = req.user.restaurantId;
  const [byStatusRows, bySourceRows, byRoleRows, hireRows] = await Promise.all([
    Candidate.aggregate([{ $match: { restaurantId: rid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Candidate.aggregate([{ $match: { restaurantId: rid } }, { $group: { _id: '$source', n: { $sum: 1 } } }]),
    Candidate.aggregate([{ $match: { restaurantId: rid } }, { $group: { _id: '$role',   n: { $sum: 1 } } }]),
    Candidate.aggregate([
      { $match: { restaurantId: rid, status: 'hired' } },
      { $project: { days: { $divide: [{ $subtract: ['$statusChangedAt', '$createdAt'] }, 86400000] } } },
      { $group: { _id: null, avg: { $avg: '$days' }, n: { $sum: 1 } } }
    ])
  ]);
  const toMap = rows => { const m = {}; let t = 0; for (const r of rows) { m[r._id || 'boshqa'] = r.n; t += r.n; } return { map: m, total: t }; };
  const st = toMap(byStatusRows);
  // AI diagnostikasi — nega tahlil ishlamayotganini ko'rish uchun
  let aiInfo = { configured: ai.isConfigured(), provider: ai.activeProvider() };
  try { aiInfo.quota = await aiQuota.statusAll(); } catch (e) { aiInfo.quotaError = e.message; }
  const unparsed = await Candidate.countDocuments({ restaurantId: rid, aiParsed: false });

  // Ma'lumot sifati — qidiruv nega natija bermayotganini ko'rsatadi.
  // "2 yil tajribali ofitsiant" topilmasligining sababi odatda filtr
  // emas, bo'sh maydon: experienceYears tahlil qilinmagan bo'lsa 0
  // bo'lib qoladi va >= 2 shartiga hech kim tushmaydi.
  const [noRole, noExp, noPhone, noLoc] = await Promise.all([
    Candidate.countDocuments({ restaurantId: rid, role: 'boshqa' }),
    Candidate.countDocuments({ restaurantId: rid, $or: [{ experienceYears: 0 }, { experienceYears: null }] }),
    Candidate.countDocuments({ restaurantId: rid, $or: [{ phone: '' }, { phone: null }] }),
    Candidate.countDocuments({ restaurantId: rid, $or: [{ location: '' }, { location: null }] })
  ]);
  const quality = { noRole, noExp, noPhone, noLoc, unparsed };
  res.json({
    total: st.total,
    byStatus: st.map,
    bySource: toMap(bySourceRows).map,
    byRole: toMap(byRoleRows).map,
    hired: st.map.hired || 0,
    rejected: st.map.rejected || 0,
    avgDaysToHire: hireRows.length ? Math.round(hireRows[0].avg) : null,
    ai: aiInfo,
    unparsed,
    quality
  });
}));

// ── Bitta nomzod (to'liq, xom matn bilan, fayl base64'siz) ──
// ── Bo'limlar sanog'i: "Anketadan" va "hh.uz bazasi" ──
// (/:id dan OLDIN — aks holda 'sections' id deb o'qiladi)
// waitingOld — bir kundan ortiq javobsiz turgan: shu raqam qizarmasligi kerak.
router.get('/sections', guard, asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const A = { restaurantId, source: 'anketa' };
  const day = new Date(Date.now() - 864e5), week = new Date(Date.now() - 7 * 864e5);
  const [aTotal, unseen, waiting, waitingOld, aWeek, bTotal, bWeek, resp] = await Promise.all([
    Candidate.countDocuments(A),
    Candidate.countDocuments(Object.assign({}, A, contactLog.UNSEEN)),
    Candidate.countDocuments(Object.assign({}, A, contactLog.WAITING)),
    Candidate.countDocuments(Object.assign({}, A, contactLog.WAITING, { createdAt: { $lt: day } })),
    Candidate.countDocuments(Object.assign({}, A, { createdAt: { $gte: week } })),
    Candidate.countDocuments({ restaurantId, source: { $ne: 'anketa' } }),
    Candidate.countDocuments({ restaurantId, source: { $ne: 'anketa' }, createdAt: { $gte: week } }),
    SurveyResponse.aggregate([
      { $match: { agencyId: restaurantId } },
      { $group: { _id: null, started: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } }
    ])
  ]);
  res.json({
    anketa: { total: aTotal, unseen, waiting, waitingOld, week: aWeek,
              started: (resp[0] || {}).started || 0, done: (resp[0] || {}).done || 0 },
    base: { total: bTotal, week: bWeek }
  });
}));

router.get('/:id', guard, asyncHandler(async (req, res) => {
  const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id }, '-fileData -photo').lean();
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  c.hasFile = await Candidate.exists({ restaurantId: req.user.restaurantId, id: req.params.id, fileData: { $ne: '' } }) ? true : false;
  res.json(c);
}));

// ── Nomzod fotosi (rasm sifatida) ──
router.get('/:id/photo', guard, asyncHandler(async (req, res) => {
  const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ── Original faylni yuklab olish/ko'rish ──
router.get('/:id/file', guard, asyncHandler(async (req, res) => {
  const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id }, 'fileData fileType fileName').lean();
  if (!c || !c.fileData) return res.status(404).json({ error: 'Fayl saqlanmagan' });
  const buf = Buffer.from(c.fileData, 'base64');
  res.setHeader('Content-Type', c.fileType || 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(c.fileName || 'resume.pdf') + '"');
  res.send(buf);
}));


// ── AI bilan qayta tahlil (o'qilmagan nomzodni qayta yuklamasdan) ──
router.post('/:id/reanalyze', guard, asyncHandler(async (req, res) => {
  const doc = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Nomzod topilmadi' });
  if (!doc.rawText || doc.rawText.length < 20) return res.status(400).json({ error: 'Xom matn saqlanmagan — rezyumeni qayta yuklang' });

  // Foto hali yo'q bo'lsa — saqlangan PDF'dan ajratishga urinamiz (AI'dan mustaqil)
  let photoAdded = false;
  if (!doc.hasPhoto && doc.fileData && /pdf/i.test(doc.fileType || '')) {
    try {
      const p = resumeParser.extractPhoto(Buffer.from(doc.fileData, 'base64'));
      if (p) { doc.photo = p; doc.hasPhoto = true; photoAdded = true; }
    } catch { /* e'tiborsiz */ }
  }

  // Allaqachon tahlil qilingan, faqat foto yetishmagan nomzod (ommaviy
  // "Qayta tahlil" shunday yuboradi) — AI kvotasi bekorga ketmasin
  if (doc.aiParsed && (req.body || {}).photoOnly) {
    if (photoAdded) { doc.updatedAt = new Date(); await doc.save(); }
    return res.json({ ok: true, photoAdded, aiParsed: false, skipped: 'ai' });
  }

  const { fields, aiParsed, error } = await resumeParser.structure(doc.rawText, req.user.restaurantId);
  if (aiParsed) { mergeParsed(doc, fields); doc.aiParsed = true; }

  // Foto yoki AI natijasi bo'lsa — saqlaymiz
  if (aiParsed || photoAdded) { doc.updatedAt = new Date(); await doc.save(); }

  if (!aiParsed) {
    return res.status(503).json({
      photoAdded,
      error: error === 'QUOTA_EXHAUSTED'
        ? 'Kunlik AI limiti tugadi — ertaga qayta urinib ko\'ring'
        : 'AI hozir javob bermadi — birozdan keyin qayta urining'
    });
  }
  const o = doc.toObject(); delete o.fileData; delete o.rawText; delete o.photo;
  delete o.tgInviteToken; delete o.tgLinkToken;      // ro'yxatdagi kabi — token brauzerga chiqmaydi
  o.photoAdded = photoAdded;
  res.json(o);
}));

// ── Tahrirlash (holat, izoh, baho, teg, profil maydonlari) ──
router.patch('/:id', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const doc = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Nomzod topilmadi' });

  if (b.status !== undefined && VALID_STATUS.includes(b.status)) {
    if (b.status !== doc.status) {
      doc.statusChangedAt = new Date();                          // yangi bosqichga o'tdi — taymer qayta boshlanadi
      if (!doc.firstContactAt) doc.firstContactAt = new Date();   // bosqich qarori = aloqa (contactLog)
      if (!doc.seenAt) doc.seenAt = new Date();
    }
    doc.status = b.status;
  }
  if (b.source !== undefined)  doc.source = VALID_SOURCE.includes(b.source) ? b.source : 'hh';
  if (b.role !== undefined)    doc.role = isValidRole(b.role) ? b.role : 'boshqa';
  if (b.branch !== undefined)  doc.branch = String(b.branch).slice(0, 80);
  if (b.shift !== undefined)   doc.shift = ['kunduzgi', 'kechki', 'ikkalasi'].includes(b.shift) ? b.shift : '';
  if (b.photo !== undefined)   { doc.photo = String(b.photo).slice(0, 400000); doc.hasPhoto = !!doc.photo; }
  if (b.notes !== undefined)   doc.notes = String(b.notes).slice(0, 2000);
  if (b.rating !== undefined)  doc.rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0));
  if (b.fullName !== undefined)        doc.fullName = String(b.fullName).slice(0, 120);
  if (b.phone !== undefined)           doc.phone = String(b.phone).slice(0, 40);
  if (b.email !== undefined)           doc.email = String(b.email).slice(0, 120);
  if (b.desiredPosition !== undefined) doc.desiredPosition = String(b.desiredPosition).slice(0, 160);
  if (b.location !== undefined)        doc.location = String(b.location).slice(0, 80);
  if (b.experienceYears !== undefined) doc.experienceYears = Math.max(0, Math.min(60, parseInt(b.experienceYears, 10) || 0));
  if (Array.isArray(b.tags))      doc.tags = b.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20);
  if (Array.isArray(b.languages)) doc.languages = b.languages.map(t => String(t).trim()).filter(Boolean).slice(0, 25);
  if (Array.isArray(b.skills))    doc.skills = b.skills.map(t => String(t).trim()).filter(Boolean).slice(0, 25);
  if (Array.isArray(b.workHistory)) doc.workHistory = sanitizeWork(b.workHistory);
  doc.updatedAt = new Date();
  await doc.save();

  const o = doc.toObject();
  delete o.fileData; delete o.rawText;
  res.json(o);
}));

// ── Ko'rildi / bog'lanildi (contactLog) ──
// seen — kartani ochganda; contacted — "Qo'ng'iroq" tugmasi (tel: havolasi
// ochiladi, natijasini bilmaymiz — urinish aloqa hisoblanadi).
router.post('/:id/seen', guard, asyncHandler(async (req, res) => {
  if (!await Candidate.exists({ restaurantId: req.user.restaurantId, id: req.params.id })) return res.status(404).json({ error: 'Nomzod topilmadi' });
  await contactLog.seen(req.user.restaurantId, req.params.id);
  res.json({ ok: true });
}));
router.post('/:id/contacted', guard, asyncHandler(async (req, res) => {
  if (!await Candidate.exists({ restaurantId: req.user.restaurantId, id: req.params.id })) return res.status(404).json({ error: 'Nomzod topilmadi' });
  await contactLog.contacted(req.user.restaurantId, req.params.id);
  res.json({ ok: true });
}));

// ── O'chirish ──
router.delete('/:id', guard, asyncHandler(async (req, res) => {
  const r = await Candidate.deleteOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Nomzod topilmadi' });
  res.json({ ok: true });
}));

// ── Guruh amallari (bir nechta nomzodni birdaniga) ──
// ── Dublikatlarni birlashtirish ──
// Bir odam bazada bir necha marta (eski yuklash telefonni matn sifatida
// solishtirgan). Har odamdan BITTA yozuv qoladi, qolganlari o'chadi.
// Avval apply:false — ro'yxatni ko'rib chiqasiz, keyin apply:true.
//
// Qoladigan yozuv tartibi: tanlovda ishlatilgan > Telegramga ulangan >
// arizasi bor > yozishmasi bor > AI tahlil qilingan > fotosi bor > eng
// to'liq. Ikkitasi ham tanlov/ariza/Telegramda bo'lsa — to'plamga TEGILMAYDI
// (conflicts): bog'lanishlarni qo'lda ko'rish kerak.
// O'chadiganlardagi foydali narsa qoladiganga ko'chadi: bo'sh maydonlar
// (telefon, email, foto, lavozim), izohlar, teglar, "kimga ko'rsatilgan".
// Shuningdek hamma nomzodga phoneKey/textHash to'ldiriladi — yangi yuklash
// tekshiruvi eski yozuvlarni ham tanisin.
router.post('/duplicates', guard, asyncHandler(async (req, res) => {
  const rid = req.user.restaurantId;
  const apply = !!(req.body && req.body.apply === true);

  const rows = await Candidate.find({ restaurantId: rid },
    'id fullName phone email desiredPosition role status rating notes tags shownToClients publicCode ' +
    'hasPhoto aiParsed tgState rawText textHash phoneKey experienceYears createdAt').lean();
  const [sls, apps, msgs] = await Promise.all([
    Shortlist.find({ agencyId: rid }, 'items.candidateId').lean(),
    Application.distinct('candidateId', { agencyId: rid }),
    BotMessage.distinct('candidateId', { restaurantId: rid })
  ]);
  const inSl = new Set(sls.flatMap(s => (s.items || []).map(i => i.candidateId)));
  const inApp = new Set(apps), inMsg = new Set(msgs);
  const linked = c => inSl.has(c.id) || inApp.has(c.id) || c.tgState === 'linked';

  // Bitta odam = umumiy kalitga ega yozuvlar to'plami (union-find)
  const parent = {};
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  rows.forEach(c => { parent[c.id] = c.id; });
  const seen = {};
  for (const c of rows) {
    const keys = [];
    const pk = phoneKey(c.phone); if (pk) keys.push('p' + pk);
    const ek = emailKey(c.email); if (ek) keys.push('e' + ek);
    const th = c.textHash || textHash(c.rawText); if (th) keys.push('h' + th);
    // hh anonim rezyume: ism o'rnida "Женщина, 21 год, родилась ..." — lavozim bilan birga
    // (?![а-яё]) — \b emas: JS'da \b faqat lotin harflarini so'z deb biladi
    if (/^\s*(женщина|мужчина)(?![а-яё])/i.test(c.fullName || '')) keys.push('a' + c.fullName.trim().toLowerCase() + '|' + (c.desiredPosition || ''));
    for (const k of keys) { if (seen[k]) parent[find(c.id)] = find(seen[k]); else seen[k] = c.id; }
  }
  const sets = {};
  rows.forEach(c => (sets[find(c.id)] = sets[find(c.id)] || []).push(c));

  const filled = c => ['phone','email','desiredPosition','experienceYears','notes'].filter(k => c[k]).length;
  const score = c => (inSl.has(c.id) ? 1e7 : 0) + (c.tgState === 'linked' ? 1e6 : 0) + (inApp.has(c.id) ? 1e5 : 0)
    + (inMsg.has(c.id) ? 1e4 : 0) + (c.aiParsed ? 1e3 : 0) + (c.hasPhoto ? 100 : 0) + filled(c) * 10;
  const view = c => ({ id: c.id, name: c.fullName, role: c.role, status: c.status, phone: c.phone,
    created: c.createdAt, aiParsed: !!c.aiParsed, hasPhoto: !!c.hasPhoto,
    inShortlist: inSl.has(c.id), tg: c.tgState === 'linked' });

  const groups = [], conflicts = [];
  for (const s of Object.values(sets)) {
    if (s.length < 2) continue;
    if (s.filter(linked).length > 1) { conflicts.push(s.map(view)); continue; }
    s.sort((a, b) => (score(b) - score(a)) || (new Date(b.createdAt) - new Date(a.createdAt)));
    const keep = s[0], drop = s.slice(1);

    // Bo'sh maydonlarni to'ldirish va to'plamlarni birlashtirish
    const set = {};
    for (const k of ['phone', 'email', 'desiredPosition', 'publicCode']) {
      if (!keep[k]) { const d = drop.find(x => x[k]); if (d) set[k] = d[k]; }
    }
    if (!keep.experienceYears) { const d = drop.find(x => x.experienceYears); if (d) set.experienceYears = d.experienceYears; }
    // Izoh faqat o'chadigan nusxada bo'lsa ham ko'chsin (ilgari >1 sharti uni yo'qotardi)
    const notes = [...new Set([keep.notes, ...drop.map(x => x.notes)].filter(Boolean))].join('\n').slice(0, 2000);
    if (notes !== (keep.notes || '')) set.notes = notes;
    const tags = [...new Set([...(keep.tags || []), ...drop.flatMap(x => x.tags || [])])];
    if (tags.length > (keep.tags || []).length) set.tags = tags;
    const shown = [...new Set([...(keep.shownToClients || []), ...drop.flatMap(x => x.shownToClients || [])])];
    if (shown.length > (keep.shownToClients || []).length) set.shownToClients = shown;
    const rating = Math.max(keep.rating || 0, ...drop.map(x => x.rating || 0));
    if (rating > (keep.rating || 0)) set.rating = rating;
    const photoFrom = !keep.hasPhoto ? drop.find(x => x.hasPhoto) : null;

    groups.push({ keep: view(keep), remove: drop.map(view), set: Object.keys(set).concat(photoFrom ? ['photo'] : []),
      roleConflict: new Set(s.map(x => x.role)).size > 1, _set: set, _photoFrom: photoFrom && photoFrom.id });
  }

  let removed = 0, backfilled = 0;
  if (apply) {
    for (const g of groups) {
      const set = Object.assign({}, g._set, { updatedAt: new Date() });
      if (g._photoFrom) {
        const p = await Candidate.findOne({ restaurantId: rid, id: g._photoFrom }, 'photo').lean();
        if (p && p.photo) { set.photo = p.photo; set.hasPhoto = true; }
      }
      if (set.phone) set.phoneKey = phoneKey(set.phone);
      await Candidate.updateOne({ restaurantId: rid, id: g.keep.id }, { $set: set });
      const ids = g.remove.map(x => x.id);
      // Yozishma bo'lsa (Telegramsiz ham — tizim yozuvlari) qoladiganga ko'chadi
      await BotMessage.updateMany({ restaurantId: rid, candidateId: { $in: ids } }, { $set: { candidateId: g.keep.id } });
      const r = await Candidate.deleteMany({ restaurantId: rid, id: { $in: ids } });
      removed += r.deletedCount || 0;
    }
    // Kalitlarni to'ldirish — yangi yuklash tekshiruvi eski yozuvlarni ham tanisin
    const left = await Candidate.find({ restaurantId: rid }, 'id phone rawText phoneKey textHash').lean();
    const ops = [];
    for (const c of left) {
      const pk = phoneKey(c.phone), th = c.textHash || textHash(c.rawText);
      if (pk !== (c.phoneKey || '') || th !== (c.textHash || '')) {
        ops.push({ updateOne: { filter: { restaurantId: rid, id: c.id }, update: { $set: { phoneKey: pk, textHash: th } } } });
      }
    }
    if (ops.length) { await Candidate.bulkWrite(ops); backfilled = ops.length; }
  }

  res.json({ applied: apply, people: groups.length, removeCount: groups.reduce((n, g) => n + g.remove.length, 0),
    removed, backfilled, conflicts,
    groups: groups.map(({ _set, _photoFrom, ...g }) => g) });
}));

// ── Rollarni qayta tasniflash: 'boshqa' -> lavozim ──
// Rezyume tahlilchisi AI kalitni aynan qaytarmasa 'boshqa' qo'yardi (endi
// tuzatilgan). Bazada qolganlar uchun: avval apply:false — nima o'zgarishini
// ko'rib chiqasiz, keyin apply:true. FAQAT role:'boshqa' ga tegadi — qo'lda
// qo'yilgan rol o'zgarmaydi. Lavozim qayerdan tanilgani (from) ham qaytadi.
router.post('/roles/reclassify', guard, asyncHandler(async (req, res) => {
  const rid = req.user.restaurantId;
  const apply = !!(req.body && req.body.apply === true);
  const rows = await Candidate.find({ restaurantId: rid, role: 'boshqa' },
    'id fullName desiredPosition workHistory experienceSummary summary aiParsed').lean();

  const changes = [], unresolved = [];
  for (const c of rows) {
    const tries = [
      ['lavozim',     c.desiredPosition],
      ['ish tarixi',  (c.workHistory || []).map(w => w && w.position).filter(Boolean).join(', ')],
      ['o\'zi haqida', c.experienceSummary],
      ['AI xulosasi', c.summary]
    ];
    let to = '', from = '';
    for (const [src, text] of tries) { to = guessRole(text); if (to) { from = src; break; } }
    const row = { id: c.id, name: c.fullName, desiredPosition: c.desiredPosition };
    if (to) changes.push(Object.assign(row, { to, from }));
    else unresolved.push(Object.assign(row, { aiParsed: !!c.aiParsed }));
  }

  if (apply && changes.length) {
    await Candidate.bulkWrite(changes.map(ch => ({ updateOne: {
      // role:'boshqa' sharti — oraliqda qo'lda o'zgartirilgan bo'lsa tegmaymiz
      filter: { restaurantId: rid, id: ch.id, role: 'boshqa' },
      update: { $set: { role: ch.to, updatedAt: new Date() } }
    } })));
  }
  const count = (arr, k) => arr.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
  res.json({ total: rows.length, applied: apply, byRole: count(changes, 'to'), bySource: count(changes, 'from'),
             changes, unresolved });
}));

router.post('/bulk', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const ids = Array.isArray(b.ids) ? b.ids.slice(0, 500) : [];
  if (!ids.length) return res.status(400).json({ error: 'Nomzod tanlanmagan' });
  const q = { restaurantId: req.user.restaurantId, id: { $in: ids } };

  if (b.action === 'delete') {
    const r = await Candidate.deleteMany(q);
    return res.json({ ok: true, deleted: r.deletedCount });
  }
  if (b.action === 'status' && VALID_STATUS.includes(b.status)) {
    const r = await Candidate.updateMany(q, { $set: { status: b.status, statusChangedAt: new Date(), updatedAt: new Date() } });
    await contactLog.contacted(req.user.restaurantId, ids);
    return res.json({ ok: true, updated: r.modifiedCount });
  }
  return res.status(400).json({ error: 'Noto\'g\'ri amal' });
}));

// ══ TELEGRAM ════════════════════════════════════════════════
// Bot sozlamalari /api/tg/* da, bu yerda nomzodga tegishli amallar.

async function loadPair(req) {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  const candidate = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  return { restaurant, candidate };
}

// Taklif: deep link yaratib, tanlangan kanal orqali yuborish
router.post('/:id/tg/invite', guard, asyncHandler(async (req, res) => {
  const { restaurant, candidate } = await loadPair(req);
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
  if (!candidate) return res.status(404).json({ error: 'Nomzod topilmadi' });

  try {
    const r = await relay.invite(restaurant, candidate, { channel: req.body && req.body.channel });
    res.json({ ok: true, ...r, tgState: candidate.tgState });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// Telegramdan uzish — rezyume QOLADI, faqat akkaunt ulanishi o'chadi.
// Xato odam ulanib qolganda (masalan, taklif havolasini boshqa odam
// bosgan) yoki sinov akkauntini bo'shatish uchun: shundan keyin bot bu
// akkauntni yangi odam kabi kutib oladi (anketa taklif qiladi).
// Yozishma tarixi (BotMessage) saqlanadi — kim nima yozgani yo'qolmasin.
router.post('/:id/tg/unlink', guard, asyncHandler(async (req, res) => {
  const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  c.tgChatId = ''; c.tgUsername = ''; c.tgState = 'none'; c.tgLinkedAt = null; c.tgInviteToken = '';
  c.updatedAt = new Date();
  await c.save();
  res.json({ ok: true, tgState: c.tgState });
}));

// Bog'langan nomzodga xabar
router.post('/:id/tg/message', guard, asyncHandler(async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'Xabar matni bo\'sh' });

  const { restaurant, candidate } = await loadPair(req);
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
  if (!candidate) return res.status(404).json({ error: 'Nomzod topilmadi' });

  try {
    await relay.sendToCandidate(restaurant, candidate, text, 'panel');
    await contactLog.contacted(req.user.restaurantId, candidate.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message, tgState: candidate.tgState });
  }
}));

// Yozishma tarixi (va o'qilgan deb belgilash)
router.get('/:id/tg/thread', guard, asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!candidate) return res.status(404).json({ error: 'Nomzod topilmadi' });

  const messages = await BotMessage
    .find({ restaurantId: req.user.restaurantId, candidateId: candidate.id })
    .sort({ createdAt: 1 }).limit(300).lean();

  if (candidate.tgUnread) { candidate.tgUnread = 0; await candidate.save(); }

  res.json({
    tgState: candidate.tgState,
    tgLinkedAt: candidate.tgLinkedAt,
    messages: messages.map(m => ({
      direction: m.direction, text: m.text, kind: m.kind,
      error: m.error, createdAt: m.createdAt
    }))
  });
}));

// Tabiiy tilda qidiruv — botdagi mantiqning HTTP ko'rinishi.
// Botda ovoz orqali ham ishlaydi; bu yerda matn. Mini App ham shuni ishlatadi.
router.post('/search', guard, asyncHandler(async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (text.length < 3) return res.status(400).json({ error: 'So\'rov juda qisqa' });

  try {
    const criteria = await candidateSearch.parseQuery({ text }, req.user.restaurantId);
    const r = await candidateSearch.search(criteria, req.user.restaurantId);
    res.json({ criteria, count: r.rows.length, relaxed: r.relaxed, candidates: r.rows });
  } catch (e) {
    res.status(e.code === 'AI_NOT_CONFIGURED' ? 503 : 400).json({ error: e.message });
  }
}));

// Guruh taklifi — ro'yxatdan belgilangan nomzodlarga
router.post('/tg/broadcast', guard, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.slice(0, 100) : [];
  if (!ids.length) return res.status(400).json({ error: 'Nomzod tanlanmadi' });

  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const channel = req.body && req.body.channel;
  const out = { sent: 0, failed: 0, items: [] };

  for (const id of ids) {
    const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id });
    if (!c) { out.failed++; continue; }
    try {
      const r = await relay.invite(restaurant, c, { channel });
      out.sent++;
      out.items.push({ id, ok: true, link: r.link, manual: r.manual });
    } catch (e) {
      out.failed++;
      out.items.push({ id, ok: false, error: e.message });
    }
    // Telegram/SMS provayderini bo'g'masligimiz uchun kichik oraliq
    await new Promise(r => setTimeout(r, 120));
  }
  res.json(out);
}));

module.exports = router;
