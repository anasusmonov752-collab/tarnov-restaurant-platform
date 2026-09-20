const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const mongoose = require('mongoose');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const Restaurant = require('../models/Restaurant');
const grading = require('../services/grading');
const generator = require('../services/generator');
const ai = require('../services/ai');
const { isValidRole, sanitizeRoles, DEFAULT_ROLE } = require('../data/roles');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(require('@ffprobe-installer/ffprobe').path);

const router = express.Router();
const guard = auth(['restaurant']);

// Videolar MongoDB GridFS'da saqlanadi (Render diski har deploy'da tozalanadi,
// bepul tarifda doimiy disk yo'q). Vaqtinchalik fayllar OS tmp papkasida.
const TRAINING_TMP_DIR = path.join(os.tmpdir(), 'restoone-training-tmp');
if (!fs.existsSync(TRAINING_TMP_DIR)) fs.mkdirSync(TRAINING_TMP_DIR, { recursive: true });

function trainingBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'trainingVideos' });
}

const trainingVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TRAINING_TMP_DIR),
    filename: (req, file, cb) => cb(null, uuidv4() + (path.extname(file.originalname || '') || '.tmp'))
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('video/') ? cb(null, true) : cb(new Error('Faqat video fayl yuklash mumkin'))
});

// Video kodeklarini aniqlash (Render 0.1 CPU'da keraksiz transkodlashdan qochish uchun)
function probeVideo(p) {
  return new Promise(resolve => {
    ffmpeg.ffprobe(p, (err, data) => {
      if (err || !data) return resolve(null);
      const v = (data.streams || []).find(s => s.codec_type === 'video');
      const a = (data.streams || []).find(s => s.codec_type === 'audio');
      resolve({ vcodec: v?.codec_name, acodec: a?.codec_name });
    });
  });
}

// H.264/AAC bo'lsa — kodeklarni qayta ishlamasdan shunchaki MP4 konteynerga
// ko'chiradi (bir soniyada, kuchsiz serverda ham). Aks holda (HEVC .MOV va
// h.k.) brauzerlarda ishlaydigan H.264/AAC'ga engil rejimda transkodlaydi.
function convertToMp4(inputPath, outputPath, info) {
  const canCopy = info && info.vcodec === 'h264' && (!info.acodec || info.acodec === 'aac');
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath);
    if (canCopy) {
      cmd.outputOptions(['-c copy', '-movflags +faststart']);
    } else {
      cmd.videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-preset ultrafast', '-crf 26', '-movflags +faststart', '-pix_fmt yuv420p']);
    }
    cmd.on('error', reject).on('end', resolve).save(outputPath);
  });
}

router.get('/info', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, '-adminPassword');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r);
}));

// ---- MENU ----
router.get('/menu', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'menu');
  res.json(r?.menu || []);
}));

function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  return String(val).split(',').map(v => v.trim()).filter(Boolean);
}

router.post('/menu', guard, asyncHandler(async (req, res) => {
  const { name, category, description, nameRu, descriptionRu, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Taom nomi va kategoriya majburiy' });
  const item = {
    id: uuidv4(), name, category, description: description || '',
    nameRu: nameRu || '', descriptionRu: descriptionRu || '',
    ingredients: parseList(ingredients),
    allergens: parseList(allergens),
    price: parseInt(price) || 0, servingSuggestion: servingSuggestion || '',
    image: imageBase64 || null
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { menu: item } });
  res.json({ success: true, item });
}));

router.put('/menu/:itemId', guard, asyncHandler(async (req, res) => {
  const { name, category, description, nameRu, descriptionRu, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  const update = {};
  if (name) update['menu.$.name'] = name;
  if (category) update['menu.$.category'] = category;
  if (description !== undefined) update['menu.$.description'] = description;
  if (nameRu !== undefined) update['menu.$.nameRu'] = nameRu;
  if (descriptionRu !== undefined) update['menu.$.descriptionRu'] = descriptionRu;
  if (ingredients !== undefined) update['menu.$.ingredients'] = parseList(ingredients);
  if (allergens !== undefined) update['menu.$.allergens'] = parseList(allergens);
  if (price !== undefined) update['menu.$.price'] = parseInt(price) || 0;
  if (servingSuggestion !== undefined) update['menu.$.servingSuggestion'] = servingSuggestion;
  if (imageBase64) update['menu.$.image'] = imageBase64;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'menu.id': req.params.itemId }, { $set: update });
  res.json({ success: true });
}));

router.delete('/menu/:itemId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { menu: { id: req.params.itemId } } });
  res.json({ success: true });
}));

// ---- WAITERS ----
router.get('/waiters', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters');
  res.json(r?.waiters || []);
}));

router.post('/waiters', guard, asyncHandler(async (req, res) => {
  const { name, pin, role, phone, hireDate } = req.body;
  if (!name || !pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Ism va 4 raqamli PIN kiritish shart' });
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (r.waiters.find(w => w.pin === pin)) return res.status(400).json({ error: 'Bu PIN allaqachon mavjud' });
  const waiter = { id: uuidv4(), name, pin, active: true, role: isValidRole(role) ? role : DEFAULT_ROLE,
    phone: (phone || '').trim(), hireDate: (hireDate || '').trim() };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { waiters: waiter } });
  res.json({ success: true, waiter });
}));

router.put('/waiters/:waiterId', guard, asyncHandler(async (req, res) => {
  const { name, pin, active, role, phone, hireDate } = req.body;
  const update = {};
  if (name) update['waiters.$.name'] = name;
  if (role !== undefined && isValidRole(role)) update['waiters.$.role'] = role;
  if (phone !== undefined)    update['waiters.$.phone']    = String(phone).trim();
  if (hireDate !== undefined) update['waiters.$.hireDate'] = String(hireDate).trim();
  if (pin) {
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN 4 raqamli bo\'lishi kerak' });
    const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters');
    if (r.waiters.find(w => w.pin === pin && w.id !== req.params.waiterId)) {
      return res.status(400).json({ error: 'Bu PIN boshqa ofitsiantda allaqachon mavjud' });
    }
    update['waiters.$.pin'] = pin;
  }
  if (active !== undefined) update['waiters.$.active'] = Boolean(active);
  await Restaurant.updateOne({ id: req.user.restaurantId, 'waiters.id': req.params.waiterId }, { $set: update });
  res.json({ success: true });
}));

router.delete('/waiters/:waiterId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { waiters: { id: req.params.waiterId } } });
  res.json({ success: true });
}));

// ---- XODIM HUJJATLARI ----
router.post('/waiters/:waiterId/documents', guard, asyncHandler(async (req, res) => {
  const { type, title, number, issueDate, expiryDate, note } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Hujjat nomi kiritish shart' });
  const doc = {
    id: uuidv4(),
    type: (type || 'boshqa').trim(),
    title: title.trim(),
    number: (number || '').trim(),
    issueDate: (issueDate || '').trim(),
    expiryDate: (expiryDate || '').trim(),
    note: (note || '').trim(),
  };
  const r = await Restaurant.updateOne(
    { id: req.user.restaurantId, 'waiters.id': req.params.waiterId },
    { $push: { 'waiters.$.documents': doc } }
  );
  if (!r.matchedCount) return res.status(404).json({ error: 'Xodim topilmadi' });
  res.json({ success: true, document: doc });
}));

router.put('/waiters/:waiterId/documents/:docId', guard, asyncHandler(async (req, res) => {
  const fields = ['type', 'title', 'number', 'issueDate', 'expiryDate', 'note'];
  const set = {};
  fields.forEach(f => { if (req.body[f] !== undefined) set[`waiters.$[w].documents.$[d].${f}`] = String(req.body[f]).trim(); });
  if (!Object.keys(set).length) return res.json({ success: true });
  await Restaurant.updateOne(
    { id: req.user.restaurantId },
    { $set: set },
    { arrayFilters: [{ 'w.id': req.params.waiterId }, { 'd.id': req.params.docId }] }
  );
  res.json({ success: true });
}));

router.delete('/waiters/:waiterId/documents/:docId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'waiters.id': req.params.waiterId },
    { $pull: { 'waiters.$.documents': { id: req.params.docId } } }
  );
  res.json({ success: true });
}));

// ---- QUESTIONS ----
router.get('/questions', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'questions');
  res.json(r?.questions || []);
}));

// keyPoints turli formatda kelishi mumkin (massiv, JSON satr, qator bilan ajratilgan)
function parseKeyPoints(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(s => String(s).trim()).filter(Boolean); } catch {}
    return v.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

router.post('/questions', guard, asyncHandler(async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId, explanation, type, rubric, keyPoints } = req.body;
  const isWritten = type === 'written';

  if (!question || !difficulty) return res.status(400).json({ error: 'Savol matni va qiyinlik darajasi majburiy' });
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return res.status(400).json({ error: 'Qiyinlik darajasi noto\'g\'ri' });

  const q = {
    id: uuidv4(), question, difficulty,
    type: isWritten ? 'written' : 'choice',
    explanation: (explanation || '').trim(),
    menuItemId: menuItemId || null
  };

  if (isWritten) {
    q.rubric    = (rubric || '').trim();
    q.keyPoints = parseKeyPoints(keyPoints);
    q.options   = [];
    // Mezonsiz AI nimaga qarab baholashni bilmaydi — hech bo'lmasa bittasi kerak.
    if (!q.rubric && !q.keyPoints.length) {
      return res.status(400).json({ error: 'Yozma savol uchun baholash mezoni yoki asosiy nuqtalar kerak' });
    }
  } else {
    if (correctAnswer === undefined) return res.status(400).json({ error: 'To\'g\'ri javobni belgilang' });
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
    if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Kamida 2 ta javob varianti kerak' });
    q.options = options;
    q.correctAnswer = parseInt(correctAnswer);
  }

  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { questions: q } });
  res.json({ success: true, question: q });
}));

router.put('/questions/:qId', guard, asyncHandler(async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId, type, rubric, keyPoints } = req.body;
  const update = {};
  if (question) update['questions.$.question'] = question;
  if (difficulty) update['questions.$.difficulty'] = difficulty;
  if (req.body.explanation !== undefined) update['questions.$.explanation'] = String(req.body.explanation).trim();
  if (menuItemId !== undefined) update['questions.$.menuItemId'] = menuItemId;

  if (type === 'written') {
    update['questions.$.type']      = 'written';
    update['questions.$.rubric']    = (rubric || '').trim();
    update['questions.$.keyPoints'] = parseKeyPoints(keyPoints);
    // Variantli qoldiqlarini tozalaymiz, aks holda eski to'g'ri javob osilib qoladi.
    // (undefined ishlatmaymiz — mongoose uni $set dan tashlab yuboradi va eski qiymat qoladi.)
    update['questions.$.options']       = [];
    update['questions.$.correctAnswer'] = null;
  } else if (type === 'choice' || options || correctAnswer !== undefined) {
    update['questions.$.type'] = 'choice';
    if (options) {
      if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
      update['questions.$.options'] = options;
    }
    if (correctAnswer !== undefined) update['questions.$.correctAnswer'] = parseInt(correctAnswer);
  }

  await Restaurant.updateOne({ id: req.user.restaurantId, 'questions.id': req.params.qId }, { $set: update });
  res.json({ success: true });
}));

// ---- AI savol generatori ----
// Ikki bosqichli: avval yaratadi (saqlamaydi), admin ko'rib chiqadi,
// keyin faqat TASDIQLANGANLARI saqlanadi. AI narx yoki allergen bo'yicha
// xato yozishi mumkin — tekshirilmagan savol bazaga tushmasligi kerak.

const genLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.restaurantId || ipKeyGenerator(req.ip),
  message: { error: 'Juda tez-tez so\'rayapsiz. 1 daqiqa kuting.' },
  standardHeaders: true, legacyHeaders: false
});

router.post('/questions/generate', guard, genLimiter, asyncHandler(async (req, res) => {
  if (!ai.isConfigured()) {
    return res.status(503).json({ error: 'AI xizmati sozlanmagan. Administratorga murojaat qiling.' });
  }
  const { count, category, includeWritten } = req.body;

  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'id menu questions');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  if (!r.menu.length) return res.status(400).json({ error: 'Avval menyuni to\'ldiring — savollar menyudan yaratiladi' });

  try {
    const out = await generator.generateQuestions({
      menu: r.menu,
      existingQuestions: r.questions,
      count: Number(count) || 12,
      category: category || undefined,
      includeWritten: includeWritten !== false,
      restaurantId: r.id
    });
    res.json(out);
  } catch (err) {
    if (err.code === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: 'Bugungi AI limiti tugadi. Ertaga qayta urinib ko\'ring.' });
    }
    if (err.code === 'NO_MENU') return res.status(400).json({ error: err.message });
    throw err;
  }
}));

// Admin tasdiqlagan savollarni saqlaydi. Kelgan ma'lumot QAYTA tekshiriladi —
// frontendga ishonmaymiz.
router.post('/questions/generate/save', guard, asyncHandler(async (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: 'Saqlash uchun savol tanlanmagan' });
  }
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'id menu questions');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const seen = new Set(r.questions.map(q =>
    String(q.question || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));

  const valid = [];
  for (const q of questions.slice(0, 60)) {
    const v = generator.validateQuestion(q, r.menu, seen);
    if (v) valid.push({ id: uuidv4(), ...v, createdAt: new Date() });
  }
  if (!valid.length) return res.status(400).json({ error: 'Yaroqli savol topilmadi' });

  // Ko'rsatuv uchun qo'shilgan maydon — sxemada yo'q, saqlashdan oldin olib tashlaymiz
  valid.forEach(v => delete v.dishName);

  await Restaurant.updateOne({ id: r.id }, { $push: { questions: { $each: valid } } });
  res.json({ success: true, saved: valid.length, skipped: questions.length - valid.length, questions: valid });
}));

router.delete('/questions/:qId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { questions: { id: req.params.qId } } });
  res.json({ success: true });
}));

router.delete('/questions', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $set: { questions: [] } });
  res.json({ success: true, message: 'Barcha savollar o\'chirildi' });
}));

// ---- TEST DAYS ----
router.get('/testdays', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testDays');
  res.json(r?.testDays || []);
}));

router.post('/testdays', guard, asyncHandler(async (req, res) => {
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Sana formati noto\'g\'ri. YYYY-MM-DD bo\'lishi kerak' });
  const d = new Date(date);
  if (isNaN(d.getTime())) return res.status(400).json({ error: 'Noto\'g\'ri sana' });
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $addToSet: { testDays: date } });
  res.json({ success: true });
}));

router.delete('/testdays/:date', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { testDays: req.params.date } });
  res.json({ success: true });
}));

// ---- ANNOUNCEMENTS ----
router.get('/announcements', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'announcements');
  res.json((r?.announcements || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
}));

router.post('/announcements', guard, asyncHandler(async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Sarlavha va matn majburiy' });
  const ann = { id: uuidv4(), title, content };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { announcements: { $each: [ann], $position: 0 } } });
  res.json({ success: true, announcement: ann });
}));

router.delete('/announcements/:id', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { announcements: { id: req.params.id } } });
  res.json({ success: true });
}));

// ---- RESULTS ----
router.get('/results', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  res.json((r?.testResults || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
}));

// ---- Yozma javoblarni qayta baholash (apellyatsiya) ----
// AI bahosi KPI orqali maoshga ta'sir qiladi, shuning uchun admin
// har qanday yozma javob ballini qo'lda o'zgartira olishi SHART.

// Ko'rikni kutayotgan natijalar: AI baholay olmagan yoki navbatda qolgan.
router.get('/results/review-queue', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  const queue = (r?.testResults || [])
    .filter(x => x.gradingStatus === 'failed' || x.gradingStatus === 'pending')
    .map(x => ({
      id: x.id, waiterName: x.waiterName, date: x.date,
      score: x.score, gradingStatus: x.gradingStatus,
      ungraded: x.breakdown.filter(b => b.type === 'written' && b.aiScore === null && b.manualScore === null).length
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(queue);
}));

// Bitta yozma javobga admin bahosi. manualScore null bo'lsa — tuzatish bekor qilinadi.
router.put('/results/:resultId/grade/:questionId', guard, asyncHandler(async (req, res) => {
  const { score } = req.body;
  const clear = score === null || score === '';
  const value = clear ? null : Number(score);

  if (!clear && (!Number.isFinite(value) || value < 0 || value > 100)) {
    return res.status(400).json({ error: 'Ball 0 dan 100 gacha bo\'lishi kerak' });
  }

  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const result = r.testResults.find(x => x.id === req.params.resultId);
  if (!result) return res.status(404).json({ error: 'Natija topilmadi' });

  const item = result.breakdown.find(b => b.questionId === req.params.questionId);
  if (!item) return res.status(404).json({ error: 'Savol topilmadi' });
  if (item.type !== 'written') return res.status(400).json({ error: 'Faqat yozma javoblarni qayta baholash mumkin' });

  item.manualScore = value;
  item.manualBy    = clear ? undefined : (req.user.email || 'admin');
  item.manualAt    = clear ? undefined : new Date();
  if (!clear) item.isCorrect = value >= 60;

  grading.recalcScore(result);

  // Barcha yozma javoblar baholangan bo'lsa — navbatdan chiqaramiz.
  const stillUngraded = result.breakdown.some(
    b => b.type === 'written' && b.aiScore === null && b.manualScore === null
  );
  result.gradingStatus = stillUngraded ? 'failed' : 'complete';

  r.markModified('testResults');
  await r.save();

  res.json({ success: true, result });
}));

// ---- KPI (dinamik davr tizimi) ----
const { getPeriodKey, getPeriodLabel, getPeriodRefDate } = require('../utils/kpi');
const { KPI_DEFAULTS, calcKPI } = require('../services/kpi');

// menuPct/modulePct — ofitsiantning menyu va modul progressini % da qaytaradi.
// KPI kompozit ballida ishlatiladi. Komponent umuman mavjud bo'lmasa (menyu/modul
// yo'q) null qaytadi — o'shanda o'sha komponent hisobga olinmaydi.
function menuPctFor(waiterId, menu, waiterMenuProgress) {
  const total = (menu || []).length;
  if (!total) return null;
  const validIds = new Set(menu.map(m => m.id));
  const p = (waiterMenuProgress || []).find(x => x.waiterId === waiterId);
  const known = (p?.knownDishIds || []).filter(id => validIds.has(id)).length;
  return Math.round(known / total * 100);
}
function modulePctFor(waiterId, modules, moduleProgress) {
  const total = (modules || []).length;
  if (!total) return null;
  const done = (moduleProgress || []).filter(mp => mp.waiterId === waiterId && mp.completed).length;
  return Math.round(Math.min(done, total) / total * 100);
}
// Amaliy baho — davr ichidagi baholarning o'rtachasi. Baho yo'q = null (hisobga olinmaydi).
function floorPctFor(waiterId, evaluations, refDate, days) {
  const key = getPeriodKey(refDate, days);
  const evs = (evaluations || []).filter(e => e.waiterId === waiterId && e.date && getPeriodKey(e.date, days) === key && typeof e.totalScore === 'number');
  if (!evs.length) return null;
  return Math.round(evs.reduce((a, e) => a + e.totalScore, 0) / evs.length);
}

router.get('/kpi', guard, asyncHandler(async (req, res) => {
  const r       = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters testResults kpiSettings menu modules waiterMenuProgress moduleProgress evaluations');
  const waiters = (r?.waiters || []).filter(w => w.active);
  const results = r?.testResults || [];
  const cfg     = r?.kpiSettings?.toObject ? r.kpiSettings.toObject() : (r?.kpiSettings || {});
  const days    = cfg.periodDays || KPI_DEFAULTS.periodDays;
  const offset  = Math.max(0, Math.min(36, parseInt(req.query.offset) || 0));
  const refDate = getPeriodRefDate(offset, days);
  const periodLabel = getPeriodLabel(refDate, days);

  const kpiList = waiters.map(w => {
    const wr   = results.filter(t => t.waiterId === w.id);
    const kpi  = calcKPI({
      results:   wr,
      menuPct:   menuPctFor(w.id, r.menu, r.waiterMenuProgress),
      modulePct: modulePctFor(w.id, r.modules, r.moduleProgress),
      floorPct:  floorPctFor(w.id, r.evaluations, refDate, days),
    }, cfg, refDate);
    const last = [...wr].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    return { waiterId: w.id, waiterName: w.name, ...kpi, lastTestDate: last?.date || null };
  }).sort((a, b) => {
    const order = ['fail','penalty','warning','nodata','good','pro','master'];
    return order.indexOf(a.level) - order.indexOf(b.level);
  });

  const summary = {
    master:  kpiList.filter(k => k.level==='master').length,
    pro:     kpiList.filter(k => k.level==='pro').length,
    good:    kpiList.filter(k => k.level==='good').length,
    warning: kpiList.filter(k => k.level==='warning').length,
    penalty: kpiList.filter(k => k.level==='penalty').length,
    fail:    kpiList.filter(k => k.level==='fail').length,
    nodata:  kpiList.filter(k => k.level==='nodata').length,
  };
  res.json({ kpiList, summary, periodLabel, offset, settings: { ...KPI_DEFAULTS, ...cfg } });
}));

router.get('/kpi-settings', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'kpiSettings');
  res.json({ ...KPI_DEFAULTS, ...(r?.kpiSettings?.toObject?.() || r?.kpiSettings || {}) });
}));

router.put('/kpi-settings', guard, asyncHandler(async (req, res) => {
  const fields = ['periodDays','masterMin','masterBonus','proMin','proBonus','goodMin','goodBonus','warningMin','warningPenalty','penaltyMin','penaltyFine','testWeight','menuWeight','moduleWeight','floorWeight'];
  const update = {};
  fields.forEach(f => { if (req.body[f] !== undefined) update[`kpiSettings.${f}`] = Number(req.body[f]); });
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $set: update });
  res.json({ success: true });
}));

// Menyu o'rganish darajasi (Bilim mashqi progressi) — har ofitsiant bo'yicha
router.get('/menu-progress', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'menu waiters waiterMenuProgress');
  const totalDishes = (r?.menu || []).length;
  const validIds = new Set((r?.menu || []).map(m => m.id));
  const prog = r?.waiterMenuProgress || [];
  const list = (r?.waiters || []).filter(w => w.active).map(w => {
    const p = prog.find(x => x.waiterId === w.id);
    // menyudan o'chirilgan taomlar hisobga olinmasin
    const known = (p?.knownDishIds || []).filter(id => validIds.has(id)).length;
    return {
      waiterId: w.id, waiterName: w.name, known, totalDishes,
      percent: totalDishes ? Math.round(known / totalDishes * 100) : 0,
      updatedAt: p?.updatedAt || null
    };
  }).sort((a, b) => b.percent - a.percent);
  res.json({ totalDishes, list });
}));

// KPI hisobotini Excel (buxgalter uchun tayyor fayl) sifatida yuklab olish
router.get('/kpi/export', guard, asyncHandler(async (req, res) => {
  const XLSX = require('xlsx');
  const r       = await Restaurant.findOne({ id: req.user.restaurantId }, 'name menu waiters testResults kpiSettings waiterMenuProgress modules moduleProgress evaluations');
  const waiters = (r?.waiters || []).filter(w => w.active);
  const results = r?.testResults || [];
  const cfg     = r?.kpiSettings?.toObject ? r.kpiSettings.toObject() : (r?.kpiSettings || {});
  const days    = cfg.periodDays || KPI_DEFAULTS.periodDays;
  const offset  = Math.max(0, Math.min(36, parseInt(req.query.offset) || 0));
  const refDate = getPeriodRefDate(offset, days);
  const periodLabel = getPeriodLabel(refDate, days);

  const totalDishes  = (r?.menu || []).length;
  const totalModules = (r?.modules || []).length;
  const validIds = new Set((r?.menu || []).map(m => m.id));
  const menuProg = r?.waiterMenuProgress || [];

  const cfgWeights = { ...KPI_DEFAULTS, ...cfg };

  const kpiList = waiters.map(w => {
    const wr = results.filter(t => t.waiterId === w.id);
    const mp = menuProg.find(x => x.waiterId === w.id);
    const known = (mp?.knownDishIds || []).filter(id => validIds.has(id)).length;
    return {
      waiterName: w.name,
      menuKnown: known,
      ...calcKPI({
        results:   wr,
        menuPct:   menuPctFor(w.id, r.menu, r.waiterMenuProgress),
        modulePct: modulePctFor(w.id, r.modules, r.moduleProgress),
        floorPct:  floorPctFor(w.id, r.evaluations, refDate, days),
      }, cfg, refDate)
    };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  const header = [
    ['KPI & MAOSH HISOBOTI'],
    [`Restoran: ${r?.name || ''}`],
    [`Davr: ${periodLabel}`],
    [`Ball tarkibi: test ${cfgWeights.testWeight}% · menyu ${cfgWeights.menuWeight}% · modul ${cfgWeights.moduleWeight}% · amaliy ${cfgWeights.floorWeight}%`],
    [`Tuzilgan sana: ${new Date().toISOString().split('T')[0]}`],
    [],
    ['№', 'Ofitsiant', 'Daraja', 'KPI ball (%)', "Test o'rtacha (%)", 'Test soni', "Menyu o'rganilgan (%)", `Bilgan taomlar (${totalDishes} tadan)`, 'Modul tugatilgan (%)', 'Amaliy baho (%)', 'Bonus/Jarima (%)', 'Izoh']
  ];
  const rows = kpiList.map((k, i) => [
    i + 1,
    k.waiterName,
    k.level === 'nodata' ? '—' : k.label,
    k.avg ?? '',
    k.testAvg ?? '',
    k.testCount,
    k.menuPct == null ? '—' : k.menuPct,
    k.menuKnown,
    k.modulePct == null ? '—' : k.modulePct,
    k.floorPct == null ? '—' : k.floorPct,
    k.level === 'nodata' ? '' : k.penalty,
    k.level === 'nodata' ? 'Test topshirilmagan' : (k.consecutiveLow >= 2 ? `${k.consecutiveLow} davr ketma-ket past natija` : '')
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  ws['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KPI');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const fname = `kpi-${(r?.name || 'restoran').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

// ---- AMALIY (FLOOR) BAHOLASH ----
// Mezonlar (kuzatuv nuqtalari) — bir ro'yxat, admin tahrirlaydi
router.get('/eval-criteria', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'evalCriteria');
  res.json((r?.evalCriteria || []).sort((a, b) => (a.order || 0) - (b.order || 0)));
}));

// Butun ro'yxatni almashtiradi (tahrirlash oson bo'lsin). body: { criteria: [{id?, title}] }
router.put('/eval-criteria', guard, asyncHandler(async (req, res) => {
  const list = Array.isArray(req.body.criteria) ? req.body.criteria : [];
  const criteria = list
    .filter(c => c && String(c.title || '').trim())
    .map((c, i) => ({ id: c.id || uuidv4(), title: String(c.title).trim(), order: i }));
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $set: { evalCriteria: criteria } });
  res.json({ success: true, criteria });
}));

// Baholar ro'yxati (ixtiyoriy ?waiterId=)
router.get('/evaluations', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'evaluations');
  let evs = r?.evaluations || [];
  if (req.query.waiterId) evs = evs.filter(e => e.waiterId === req.query.waiterId);
  evs = [...evs].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  res.json(evs);
}));

// Yangi baho. body: { waiterId, evaluator, date, note, scores:[{criterionId,title,score}] }
router.post('/evaluations', guard, asyncHandler(async (req, res) => {
  const { waiterId, evaluator, date, note } = req.body;
  const scoresIn = Array.isArray(req.body.scores) ? req.body.scores : [];
  if (!waiterId) return res.status(400).json({ error: 'Xodim tanlanmagan' });
  if (!scoresIn.length) return res.status(400).json({ error: 'Baholanadigan mezon yo\'q' });

  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters');
  const waiter = (r?.waiters || []).find(w => w.id === waiterId);
  if (!waiter) return res.status(404).json({ error: 'Xodim topilmadi' });

  const scores = scoresIn.map(s => ({
    criterionId: s.criterionId || '',
    title: String(s.title || '').trim(),
    score: Math.max(0, Math.min(2, Number(s.score) || 0)),
  }));
  const totalScore = Math.round(scores.reduce((a, s) => a + s.score, 0) / (2 * scores.length) * 100);

  const ev = {
    id: uuidv4(),
    waiterId,
    waiterName: waiter.name,
    evaluator: String(evaluator || '').trim(),
    date: (date || new Date().toISOString().split('T')[0]),
    scores, totalScore,
    note: String(note || '').trim(),
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { evaluations: ev } });
  res.json({ success: true, evaluation: ev });
}));

router.delete('/evaluations/:id', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { evaluations: { id: req.params.id } } });
  res.json({ success: true });
}));

// ---- MENEJER ANALITIKASI ----
// Barcha manbalarni yig'adi: KPI, amaliy baho, diagnostika, modullar.
// Jamoaning zaif nuqtalarini bir ekranda ko'rsatadi.
router.get('/analytics', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId },
    'waiters testResults evaluations assessments modules moduleProgress menu waiterMenuProgress kpiSettings');
  const waiters = (r?.waiters || []).filter(w => w.active !== false);
  const cfg = r?.kpiSettings?.toObject ? r.kpiSettings.toObject() : (r?.kpiSettings || {});
  const days = cfg.periodDays || KPI_DEFAULTS.periodDays;
  const refDate = getPeriodRefDate(0, days);
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  // ── Har ofitsiant kesimida ko'rsatkichlar ──
  const perWaiter = waiters.map(w => {
    const menuPct   = menuPctFor(w.id, r.menu, r.waiterMenuProgress);
    const modulePct = modulePctFor(w.id, r.modules, r.moduleProgress);
    const floorPct  = floorPctFor(w.id, r.evaluations, refDate, days);
    const kpi = calcKPI({
      results: (r.testResults || []).filter(t => t.waiterId === w.id),
      menuPct, modulePct, floorPct
    }, cfg, refDate);
    return { id: w.id, name: w.name, role: w.role || 'ofitsiant', menuPct, modulePct, floorPct, kpi: kpi.avg, level: kpi.level };
  });

  const overview = {
    staffCount:   waiters.length,
    avgKpi:       avg(perWaiter.map(p => p.kpi).filter(v => v != null)),
    avgMenuPct:   avg(perWaiter.map(p => p.menuPct).filter(v => v != null)),
    avgModulePct: avg(perWaiter.map(p => p.modulePct).filter(v => v != null)),
    avgFloor:     avg(perWaiter.map(p => p.floorPct).filter(v => v != null)),
    evalCount:    (r?.evaluations || []).length,
  };

  // ── Amaliy baho: mezon bo'yicha zaiflik xaritasi (eng zaif birinchi) ──
  const critAgg = {};
  (r?.evaluations || []).forEach(ev => (ev.scores || []).forEach(s => {
    const key = s.title || s.criterionId; if (!key) return;
    (critAgg[key] = critAgg[key] || { sum: 0, n: 0 });
    critAgg[key].sum += (s.score || 0); critAgg[key].n += 1;
  }));
  const floorHeatmap = Object.entries(critAgg)
    .map(([title, v]) => ({ title, pct: Math.round(v.sum / (2 * v.n) * 100), count: v.n }))
    .sort((a, b) => a.pct - b.pct);

  // ── Diagnostika: yo'nalish bo'yicha kompetensiya ──
  const areaAgg = {};
  (r?.assessments || []).forEach(a => (a.areaScores || []).forEach(as => {
    const key = as.label || as.area; if (!key) return;
    (areaAgg[key] = areaAgg[key] || { sum: 0, n: 0, icon: as.icon });
    areaAgg[key].sum += (as.score || 0); areaAgg[key].n += 1;
  }));
  const areaCompetency = Object.entries(areaAgg)
    .map(([label, v]) => ({ label, icon: v.icon || '', pct: Math.round(v.sum / v.n), count: v.n }))
    .sort((a, b) => a.pct - b.pct);

  // ── Modullar: tugatish darajasi ──
  const moduleCompletion = (r?.modules || []).map(m => {
    const done = (r.moduleProgress || []).filter(mp => mp.moduleId === m.id && mp.completed).length;
    return { title: m.title, emoji: m.emoji || '📚', done, total: waiters.length, pct: waiters.length ? Math.round(done / waiters.length * 100) : 0 };
  }).sort((a, b) => a.pct - b.pct);

  // ── Rol kesimida ──
  const byRole = {};
  perWaiter.forEach(p => { (byRole[p.role] = byRole[p.role] || []).push(p); });
  const roleBreakdown = Object.entries(byRole).map(([role, arr]) => ({
    role, count: arr.length,
    avgKpi:    avg(arr.map(p => p.kpi).filter(v => v != null)),
    avgMenu:   avg(arr.map(p => p.menuPct).filter(v => v != null)),
    avgModule: avg(arr.map(p => p.modulePct).filter(v => v != null)),
  }));

  res.json({ overview, floorHeatmap, areaCompetency, moduleCompletion, roleBreakdown });
}));

// ---- XODIM JURNALI (1-on-1 suhbat / intizom) ----
router.get('/staff-notes', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'staffNotes');
  let notes = r?.staffNotes || [];
  if (req.query.waiterId) notes = notes.filter(n => n.waiterId === req.query.waiterId);
  notes = [...notes].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  res.json(notes);
}));

router.post('/staff-notes', guard, asyncHandler(async (req, res) => {
  const { waiterId, kind, date, title, content, author } = req.body;
  if (!waiterId) return res.status(400).json({ error: 'Xodim tanlanmagan' });
  if (!title?.trim()) return res.status(400).json({ error: 'Sarlavha kiritish shart' });

  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters');
  const waiter = (r?.waiters || []).find(w => w.id === waiterId);
  if (!waiter) return res.status(404).json({ error: 'Xodim topilmadi' });

  const note = {
    id: uuidv4(),
    waiterId,
    waiterName: waiter.name,
    kind: ['review', 'praise', 'incident'].includes(kind) ? kind : 'review',
    date: (date || new Date().toISOString().split('T')[0]),
    title: title.trim(),
    content: String(content || '').trim(),
    author: String(author || '').trim(),
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { staffNotes: note } });
  res.json({ success: true, note });
}));

router.delete('/staff-notes/:id', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { staffNotes: { id: req.params.id } } });
  res.json({ success: true });
}));

// ---- CHECKLIST ----
router.get('/checklist', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'checklist waiters waiterChecklists');
  const items = (r?.checklist || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  const waiters = (r?.waiters || []).filter(w => w.active);
  const wChecklists = r?.waiterChecklists || [];
  const progress = waiters.map(w => {
    const wc = wChecklists.find(x => x.waiterId === w.id);
    const done = wc?.completedItems?.length || 0;
    return { waiterId: w.id, waiterName: w.name, completed: done, total: items.length };
  });
  res.json({ items, progress });
}));

router.post('/checklist', guard, asyncHandler(async (req, res) => {
  const { title, description, period, order } = req.body;
  if (!title) return res.status(400).json({ error: 'Sarlavha kiritish shart' });
  const item = { id: uuidv4(), title, description: description || '', period: period || '1-hafta', order: order || 0 };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { checklist: item } });
  res.json({ success: true, item });
}));

router.put('/checklist/:itemId', guard, asyncHandler(async (req, res) => {
  const { title, description, period, order } = req.body;
  const update = {};
  if (title) update['checklist.$.title'] = title;
  if (description !== undefined) update['checklist.$.description'] = description;
  if (period) update['checklist.$.period'] = period;
  if (order !== undefined) update['checklist.$.order'] = order;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'checklist.id': req.params.itemId }, { $set: update });
  res.json({ success: true });
}));

router.delete('/checklist/:itemId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { checklist: { id: req.params.itemId } } });
  res.json({ success: true });
}));

// ---- ADAPTATION ----
router.get('/adaptation', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'adaptation');
  res.json(r?.adaptation || {});
}));

router.put('/adaptation', guard, asyncHandler(async (req, res) => {
  const { history, mission, values, image } = req.body;
  const update = {};
  if (history !== undefined) update['adaptation.history'] = history;
  if (mission !== undefined) update['adaptation.mission'] = mission;
  if (image !== undefined) update['adaptation.image'] = image;
  if (values !== undefined) update['adaptation.values'] = Array.isArray(values) ? values : values.split('\n').map(v => v.trim()).filter(Boolean);
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $set: update });
  res.json({ success: true });
}));

router.post('/adaptation/management', guard, asyncHandler(async (req, res) => {
  const { name, position, phone, photo, order } = req.body;
  if (!name || !position) return res.status(400).json({ error: 'Ism va lavozim kiritish shart' });
  const member = { id: uuidv4(), name, position, phone: phone || '', photo: photo || '', order: order || 0 };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { 'adaptation.management': member } });
  res.json({ success: true, member });
}));

router.put('/adaptation/management/:memberId', guard, asyncHandler(async (req, res) => {
  const { name, position, phone, photo, order } = req.body;
  const update = {};
  if (name) update['adaptation.management.$.name'] = name;
  if (position) update['adaptation.management.$.position'] = position;
  if (phone !== undefined) update['adaptation.management.$.phone'] = phone;
  if (photo) update['adaptation.management.$.photo'] = photo;
  if (order !== undefined) update['adaptation.management.$.order'] = order;
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'adaptation.management.id': req.params.memberId },
    { $set: update }
  );
  res.json({ success: true });
}));

router.delete('/adaptation/management/:memberId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne(
    { id: req.user.restaurantId },
    { $pull: { 'adaptation.management': { id: req.params.memberId } } }
  );
  res.json({ success: true });
}));

// ---- DOCUMENTS ----
router.post('/adaptation/documents', guard, asyncHandler(async (req, res) => {
  const { title, content, icon, required, order } = req.body;
  if (!title) return res.status(400).json({ error: 'Sarlavha kiritish shart' });
  const doc = { id: uuidv4(), title, content: content || '', icon: icon || '📄', required: !!required, order: order || 0 };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { 'adaptation.documents': doc } });
  res.json({ success: true, document: doc });
}));

router.put('/adaptation/documents/:docId', guard, asyncHandler(async (req, res) => {
  const { title, content, icon, required, order } = req.body;
  const update = {};
  if (title !== undefined) update['adaptation.documents.$.title'] = title;
  if (content !== undefined) update['adaptation.documents.$.content'] = content;
  if (icon !== undefined) update['adaptation.documents.$.icon'] = icon;
  if (required !== undefined) update['adaptation.documents.$.required'] = required;
  if (order !== undefined) update['adaptation.documents.$.order'] = order;
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'adaptation.documents.id': req.params.docId },
    { $set: update }
  );
  res.json({ success: true });
}));

router.delete('/adaptation/documents/:docId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne(
    { id: req.user.restaurantId },
    { $pull: { 'adaptation.documents': { id: req.params.docId } } }
  );
  res.json({ success: true });
}));

// ---- ONBOARDING STEPS ----
router.post('/adaptation/onboarding', guard, asyncHandler(async (req, res) => {
  const { day, title, description, tasks, order } = req.body;
  if (!title) return res.status(400).json({ error: 'Sarlavha kiritish shart' });
  const tasksArr = Array.isArray(tasks) ? tasks : (tasks || '').split('\n').map(t => t.trim()).filter(Boolean);
  const step = { id: uuidv4(), day: day || '1-kun', title, description: description || '', tasks: tasksArr, order: order || 0 };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { 'adaptation.onboardingSteps': step } });
  res.json({ success: true, step });
}));

router.put('/adaptation/onboarding/:stepId', guard, asyncHandler(async (req, res) => {
  const { day, title, description, tasks, order } = req.body;
  const update = {};
  if (day !== undefined) update['adaptation.onboardingSteps.$.day'] = day;
  if (title !== undefined) update['adaptation.onboardingSteps.$.title'] = title;
  if (description !== undefined) update['adaptation.onboardingSteps.$.description'] = description;
  if (tasks !== undefined) update['adaptation.onboardingSteps.$.tasks'] = Array.isArray(tasks) ? tasks : tasks.split('\n').map(t => t.trim()).filter(Boolean);
  if (order !== undefined) update['adaptation.onboardingSteps.$.order'] = order;
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'adaptation.onboardingSteps.id': req.params.stepId },
    { $set: update }
  );
  res.json({ success: true });
}));

router.delete('/adaptation/onboarding/:stepId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne(
    { id: req.user.restaurantId },
    { $pull: { 'adaptation.onboardingSteps': { id: req.params.stepId } } }
  );
  res.json({ success: true });
}));

// ── TRAINING VIDEOS (erkin nomlangan qisqa standart videolar) ─

router.get('/training', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
  const videos = (r?.trainingVideos || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(videos);
}));

// YouTube havoladan video ID ajratish (watch?v=, youtu.be, shorts, embed)
function extractYoutubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

router.post('/training', guard, trainingVideoUpload.single('video'), asyncHandler(async (req, res) => {
  const { title, description, youtubeUrl } = req.body;
  if (!title || !title.trim()) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Sarlavha majburiy' }); }

  // Katta videolar uchun: fayl o'rniga YouTube havola
  if (!req.file && youtubeUrl) {
    const ytId = extractYoutubeId(youtubeUrl);
    if (!ytId) return res.status(400).json({ error: 'YouTube havolasi noto\'g\'ri. Masalan: https://youtu.be/XXXXXXX' });
    const r0 = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
    const maxOrder0 = (r0?.trainingVideos || []).reduce((m, v) => Math.max(m, v.order || 0), -1);
    const video0 = {
      id: uuidv4(), title: title.trim(), description: (description || '').trim(),
      videoUrl: 'https://www.youtube.com/watch?v=' + ytId, order: maxOrder0 + 1
    };
    await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { trainingVideos: video0 } });
    return res.json(video0);
  }

  if (!req.file) return res.status(400).json({ error: 'Video fayl yoki YouTube havola majburiy' });

  const outPath = path.join(TRAINING_TMP_DIR, uuidv4() + '.mp4');
  try {
    const info = await probeVideo(req.file.path);
    await convertToMp4(req.file.path, outPath, info);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Videoni qayta ishlashda xatolik yuz berdi. Boshqa fayl bilan urinib ko\'ring.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  // MP4'ni MongoDB GridFS'ga yozamiz — deploy'larda o'chmaydi
  let fileId;
  try {
    fileId = await new Promise((resolve, reject) => {
      const up = trainingBucket().openUploadStream(uuidv4() + '.mp4', {
        contentType: 'video/mp4',
        metadata: { restaurantId: req.user.restaurantId }
      });
      fs.createReadStream(outPath).pipe(up).on('error', reject).on('finish', () => resolve(up.id));
    });
  } finally {
    fs.unlink(outPath, () => {});
  }

  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
  const maxOrder = (r?.trainingVideos || []).reduce((m, v) => Math.max(m, v.order || 0), -1);
  const video = {
    id: uuidv4(),
    title: title.trim(),
    description: (description || '').trim(),
    videoUrl: '/media/training/' + fileId.toString(),
    order: maxOrder + 1
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { trainingVideos: video } });
  res.json(video);
}));

router.put('/training/:videoId', guard, asyncHandler(async (req, res) => {
  const { title, description, order } = req.body;
  const upd = {};
  if (title !== undefined) upd['trainingVideos.$.title'] = title.trim();
  if (description !== undefined) upd['trainingVideos.$.description'] = description.trim();
  if (order !== undefined) upd['trainingVideos.$.order'] = order;
  if (!Object.keys(upd).length) return res.json({ success: true });
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'trainingVideos.id': req.params.videoId },
    { $set: upd }
  );
  res.json({ success: true });
}));

router.delete('/training/:videoId', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
  const vid = r?.trainingVideos?.find(v => v.id === req.params.videoId);
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { trainingVideos: { id: req.params.videoId } } });
  if (vid?.videoUrl?.startsWith('/media/training/')) {
    try { await trainingBucket().delete(new mongoose.mongo.ObjectId(vid.videoUrl.split('/').pop())); } catch {}
  }
  res.json({ success: true });
}));

// ── TRAINING MODULES ─────────────────────────────────────────

// Get all modules (with progress summary)
router.get('/modules', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const modules = (r?.modules || []).sort((a,b) => (a.order||0) - (b.order||0));
  const progress = r?.moduleProgress || [];

  // Add progress stats per module
  const result = modules.map(m => {
    const prog = progress.filter(p => p.moduleId === m.id);
    const completed = prog.filter(p => p.completed).length;
    return {
      ...m.toObject(),
      stats: { totalWaiters: prog.length, completed, avgScore: prog.filter(p=>p.quizScore>=0).length
        ? Math.round(prog.filter(p=>p.quizScore>=0).reduce((s,p)=>s+p.quizScore,0) / prog.filter(p=>p.quizScore>=0).length)
        : null }
    };
  });
  res.json(result);
}));

// Create module
router.post('/modules', guard, asyncHandler(async (req, res) => {
  const { title, description, emoji, color, order, roles } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Modul nomi kiritilmagan' });
  const module = { id: uuidv4(), title: title.trim(), description: description?.trim()||'',
    emoji: emoji||'📚', color: color||'#C8922A', roles: sanitizeRoles(roles), order: order||0, lessons: [], quiz: [] };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { modules: module } });
  res.json({ success: true, module });
}));

// Reorder modules — must be BEFORE /:moduleId to avoid route shadowing
router.put('/modules/reorder', guard, asyncHandler(async (req, res) => {
  const { orders } = req.body; // [{ id, order }]
  const bulkOps = orders.map(({ id, order }) => ({
    updateOne: { filter: { id: req.user.restaurantId, 'modules.id': id }, update: { $set: { 'modules.$.order': order } } }
  }));
  await Restaurant.bulkWrite(bulkOps);
  res.json({ success: true });
}));

// Update module
router.put('/modules/:moduleId', guard, asyncHandler(async (req, res) => {
  const { title, description, emoji, color, order, passingScore, roles } = req.body;
  const upd = {};
  if (title)        upd['modules.$.title']        = title.trim();
  if (description !== undefined) upd['modules.$.description'] = description.trim();
  if (emoji)        upd['modules.$.emoji']        = emoji;
  if (color)        upd['modules.$.color']        = color;
  if (roles !== undefined) upd['modules.$.roles'] = sanitizeRoles(roles);
  if (order !== undefined) upd['modules.$.order'] = order;
  if (passingScore) upd['modules.$.passingScore'] = passingScore;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'modules.id': req.params.moduleId }, { $set: upd });
  res.json({ success: true });
}));

// Delete module
router.delete('/modules/:moduleId', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { modules: { id: req.params.moduleId } } });
  res.json({ success: true });
}));

// Add lesson to module
router.post('/modules/:moduleId/lessons', guard, asyncHandler(async (req, res) => {
  const { title, content, image, videoUrl, order } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Dars nomi kiritilmagan' });
  const lesson = { id: uuidv4(), title: title.trim(), content: content?.trim()||'',
    image: image||'', videoUrl: videoUrl||'', order: order||0 };
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'modules.id': req.params.moduleId },
    { $push: { 'modules.$.lessons': lesson } }
  );
  res.json({ success: true, lesson });
}));

// Update lesson
router.put('/modules/:moduleId/lessons/:lessonId', guard, asyncHandler(async (req, res) => {
  const { title, content, image, videoUrl, order } = req.body;
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules');
  const mod = r?.modules?.find(m => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Modul topilmadi' });
  const lesson = mod.lessons.find(l => l.id === req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Dars topilmadi' });
  if (title)     lesson.title    = title.trim();
  if (content !== undefined) lesson.content = content.trim();
  if (image !== undefined)   lesson.image   = image;
  if (videoUrl !== undefined) lesson.videoUrl = videoUrl;
  if (order !== undefined)   lesson.order   = order;
  await r.save();
  res.json({ success: true });
}));

// Delete lesson
router.delete('/modules/:moduleId/lessons/:lessonId', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules');
  const mod = r?.modules?.find(m => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Modul topilmadi' });
  mod.lessons = mod.lessons.filter(l => l.id !== req.params.lessonId);
  await r.save();
  res.json({ success: true });
}));

// Update quiz for module
router.put('/modules/:moduleId/quiz', guard, asyncHandler(async (req, res) => {
  const { quiz } = req.body; // [{ question, options, correctAnswer }]
  if (!Array.isArray(quiz)) return res.status(400).json({ error: 'Quiz massiv bo\'lishi kerak' });
  const quizWithIds = quiz.map(q => ({ id: uuidv4(), question: q.question, options: q.options, correctAnswer: q.correctAnswer }));
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'modules.id': req.params.moduleId },
    { $set: { 'modules.$.quiz': quizWithIds } }
  );
  res.json({ success: true });
}));

// Get module progress per waiter
router.get('/modules/:moduleId/progress', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'moduleProgress waiters');
  const prog = (r?.moduleProgress || []).filter(p => p.moduleId === req.params.moduleId);
  const waiterMap = {};
  (r?.waiters || []).forEach(w => { waiterMap[w.id] = w.name; });
  res.json(prog.map(p => ({ ...p, waiterName: waiterMap[p.waiterId] || 'Noma\'lum' })));
}));

module.exports = router;
