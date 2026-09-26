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
const resumeParser = require('../services/resumeParser');
const { isValidRole } = require('../data/roles');

const router = express.Router();
const guard = auth(['restaurant']);

const MAX_RAW = 20000;                 // saqlanadigan xom matn chegarasi
const MAX_FILE_STORE = 5 * 1024 * 1024; // 5 MB dan katta faylni base64 saqlmaymiz
// Kanban bosqichlari (recruiting voronka) — frontend ustunlari shu tartibda.
const VALID_STATUS = ['new', 'phone', 'interview', 'interview2', 'trial', 'hired', 'reserve', 'rejected'];
const VALID_SOURCE = ['hh', 'manual', 'referral', 'telegram', 'other'];

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

// Bitta xom matndan (yoki fayldan) Candidate hujjati yasaydi va saqlaydi.
async function buildAndSave({ restaurantId, rawText, fileName, fileType, fileBuffer, source, branch }) {
  const { fields, aiParsed } = await resumeParser.structure(rawText, restaurantId);

  // Dublikat tekshiruvi (telefon bo'yicha) — bir nomzod ikki marta kirmasin.
  if (fields.phone) {
    const exists = await Candidate.findOne({ restaurantId, phone: fields.phone }, '_id').lean();
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
    branch: String(b.branch || '').slice(0, 80),
    languages: Array.isArray(b.languages) ? b.languages.map(s => String(s).trim()).filter(Boolean).slice(0, 25) : [],
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
  if (source && source !== 'all') query.source = source;
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
    exp: { experienceYears: -1 }, name: { fullName: 1 }, rating: { rating: -1, createdAt: -1 }
  };
  const list = await Candidate.find(query, '-fileData -rawText -photo')
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
  res.json({
    total: st.total,
    byStatus: st.map,
    bySource: toMap(bySourceRows).map,
    byRole: toMap(byRoleRows).map,
    hired: st.map.hired || 0,
    rejected: st.map.rejected || 0,
    avgDaysToHire: hireRows.length ? Math.round(hireRows[0].avg) : null
  });
}));

// ── Bitta nomzod (to'liq, xom matn bilan, fayl base64'siz) ──
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

  const { fields, aiParsed, error } = await resumeParser.structure(doc.rawText, req.user.restaurantId);
  if (!aiParsed) {
    return res.status(503).json({
      error: error === 'QUOTA_EXHAUSTED'
        ? 'Kunlik AI limiti tugadi — ertaga qayta urinib ko\'ring'
        : 'AI hozir javob bermadi — birozdan keyin qayta urining'
    });
  }
  Object.assign(doc, fields); // faqat AI ajratgan profil maydonlari — status/izoh/foto/teg tegilmaydi
  doc.aiParsed = true;
  doc.updatedAt = new Date();
  await doc.save();
  const o = doc.toObject(); delete o.fileData; delete o.rawText; delete o.photo;
  res.json(o);
}));

// ── Tahrirlash (holat, izoh, baho, teg, profil maydonlari) ──
router.patch('/:id', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const doc = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Nomzod topilmadi' });

  if (b.status !== undefined && VALID_STATUS.includes(b.status)) {
    if (b.status !== doc.status) doc.statusChangedAt = new Date(); // yangi bosqichga o'tdi — taymer qayta boshlanadi
    doc.status = b.status;
  }
  if (b.source !== undefined)  doc.source = VALID_SOURCE.includes(b.source) ? b.source : 'hh';
  if (b.role !== undefined)    doc.role = isValidRole(b.role) ? b.role : 'boshqa';
  if (b.branch !== undefined)  doc.branch = String(b.branch).slice(0, 80);
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
  doc.updatedAt = new Date();
  await doc.save();

  const o = doc.toObject();
  delete o.fileData; delete o.rawText;
  res.json(o);
}));

// ── O'chirish ──
router.delete('/:id', guard, asyncHandler(async (req, res) => {
  const r = await Candidate.deleteOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Nomzod topilmadi' });
  res.json({ ok: true });
}));

module.exports = router;
