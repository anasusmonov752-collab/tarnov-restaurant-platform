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
const VALID_STATUS = ['new', 'contacted', 'interview', 'trial', 'hired', 'rejected', 'reserve'];
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
async function buildAndSave({ restaurantId, rawText, fileName, fileType, fileBuffer, source }) {
  const { fields, aiParsed } = await resumeParser.structure(rawText, restaurantId);

  // Dublikat tekshiruvi (telefon bo'yicha) — bir nomzod ikki marta kirmasin.
  if (fields.phone) {
    const exists = await Candidate.findOne({ restaurantId, phone: fields.phone }, '_id').lean();
    if (exists) return { duplicate: true, name: fields.fullName || fileName };
  }

  const storeFile = fileBuffer && fileBuffer.length <= MAX_FILE_STORE;
  const doc = await Candidate.create({
    id: uuidv4(),
    restaurantId,
    ...fields,
    rawText: String(rawText || '').slice(0, MAX_RAW),
    fileName: fileName || '',
    fileData: storeFile ? fileBuffer.toString('base64') : '',
    fileType: fileType || '',
    source: VALID_SOURCE.includes(source) ? source : 'hh',
    status: 'new',
    aiParsed
  });
  return { created: true, id: doc.id, name: doc.fullName || fileName, aiParsed };
}

// ── Rezyume fayllarini yuklash (bir yoki bir nechta PDF/txt) ──
router.post('/upload', guard, upload.array('files', 30), asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Fayl yuklanmadi' });
  const source = (req.body && req.body.source) || 'hh';

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
        source
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
    source: (req.body && req.body.source) || 'manual'
  });
  if (r.duplicate) return res.json({ duplicate: true, name: r.name });
  res.json({ created: true, id: r.id, name: r.name, aiParsed: r.aiParsed });
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
  const list = await Candidate.find(query, '-fileData -rawText')
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

// ── Bitta nomzod (to'liq, xom matn bilan, fayl base64'siz) ──
router.get('/:id', guard, asyncHandler(async (req, res) => {
  const c = await Candidate.findOne({ restaurantId: req.user.restaurantId, id: req.params.id }, '-fileData').lean();
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  c.hasFile = await Candidate.exists({ restaurantId: req.user.restaurantId, id: req.params.id, fileData: { $ne: '' } }) ? true : false;
  res.json(c);
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

// ── Tahrirlash (holat, izoh, baho, teg, profil maydonlari) ──
router.patch('/:id', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const set = { updatedAt: new Date() };

  if (b.status !== undefined)  set.status = VALID_STATUS.includes(b.status) ? b.status : 'new';
  if (b.source !== undefined)  set.source = VALID_SOURCE.includes(b.source) ? b.source : 'hh';
  if (b.role !== undefined)    set.role = isValidRole(b.role) ? b.role : 'boshqa';
  if (b.notes !== undefined)   set.notes = String(b.notes).slice(0, 2000);
  if (b.rating !== undefined)  set.rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0));
  if (b.fullName !== undefined)        set.fullName = String(b.fullName).slice(0, 120);
  if (b.phone !== undefined)           set.phone = String(b.phone).slice(0, 40);
  if (b.email !== undefined)           set.email = String(b.email).slice(0, 120);
  if (b.desiredPosition !== undefined) set.desiredPosition = String(b.desiredPosition).slice(0, 160);
  if (b.location !== undefined)        set.location = String(b.location).slice(0, 80);
  if (b.experienceYears !== undefined) set.experienceYears = Math.max(0, Math.min(60, parseInt(b.experienceYears, 10) || 0));
  if (Array.isArray(b.tags))      set.tags = b.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20);
  if (Array.isArray(b.languages)) set.languages = b.languages.map(t => String(t).trim()).filter(Boolean).slice(0, 25);
  if (Array.isArray(b.skills))    set.skills = b.skills.map(t => String(t).trim()).filter(Boolean).slice(0, 25);

  const c = await Candidate.findOneAndUpdate(
    { restaurantId: req.user.restaurantId, id: req.params.id },
    { $set: set },
    { new: true }
  ).select('-fileData -rawText').lean();
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  res.json(c);
}));

// ── O'chirish ──
router.delete('/:id', guard, asyncHandler(async (req, res) => {
  const r = await Candidate.deleteOne({ restaurantId: req.user.restaurantId, id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Nomzod topilmadi' });
  res.json({ ok: true });
}));

module.exports = router;
