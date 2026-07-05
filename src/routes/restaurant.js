const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();
const guard = auth(['restaurant']);

// Render'da /app/data persistent disk sifatida ulangan (render.yaml) — bor bo'lsa undan foydalanamiz.
const UPLOADS_ROOT = fs.existsSync('/app/data') ? '/app/data/uploads' : path.join(__dirname, '..', '..', 'uploads');
const TRAINING_VIDEO_DIR = path.join(UPLOADS_ROOT, 'training');
const TRAINING_TMP_DIR = path.join(UPLOADS_ROOT, 'training-tmp');
for (const dir of [TRAINING_VIDEO_DIR, TRAINING_TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const trainingVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TRAINING_TMP_DIR),
    filename: (req, file, cb) => cb(null, uuidv4() + (path.extname(file.originalname || '') || '.tmp'))
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('video/') ? cb(null, true) : cb(new Error('Faqat video fayl yuklash mumkin'))
});

// Har qanday formatdagi (mov, 3gp, mkv...) videoni brauzerlarda ishonchli
// ishlaydigan H.264/AAC MP4'ga aylantiradi — ayniqsa iPhone .MOV fayllari
// Android/Chrome'da ochilmasligining oldini olish uchun.
function convertToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset veryfast', '-crf 23', '-movflags +faststart', '-pix_fmt yuv420p'])
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
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
  const { name, category, description, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Taom nomi va kategoriya majburiy' });
  const item = {
    id: uuidv4(), name, category, description: description || '',
    ingredients: parseList(ingredients),
    allergens: parseList(allergens),
    price: parseInt(price) || 0, servingSuggestion: servingSuggestion || '',
    image: imageBase64 || null
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { menu: item } });
  res.json({ success: true, item });
}));

router.put('/menu/:itemId', guard, asyncHandler(async (req, res) => {
  const { name, category, description, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  const update = {};
  if (name) update['menu.$.name'] = name;
  if (category) update['menu.$.category'] = category;
  if (description !== undefined) update['menu.$.description'] = description;
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
  const { name, pin } = req.body;
  if (!name || !pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Ism va 4 raqamli PIN kiritish shart' });
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (r.waiters.find(w => w.pin === pin)) return res.status(400).json({ error: 'Bu PIN allaqachon mavjud' });
  const waiter = { id: uuidv4(), name, pin, active: true };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { waiters: waiter } });
  res.json({ success: true, waiter });
}));

router.put('/waiters/:waiterId', guard, asyncHandler(async (req, res) => {
  const { name, pin, active } = req.body;
  const update = {};
  if (name) update['waiters.$.name'] = name;
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

// ---- QUESTIONS ----
router.get('/questions', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'questions');
  res.json(r?.questions || []);
}));

router.post('/questions', guard, asyncHandler(async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  if (!question || !options || correctAnswer === undefined || !difficulty) return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
  if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Kamida 2 ta javob varianti kerak' });
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return res.status(400).json({ error: 'Qiyinlik darajasi noto\'g\'ri' });
  const q = { id: uuidv4(), question, options, correctAnswer: parseInt(correctAnswer), difficulty, menuItemId: menuItemId || null };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { questions: q } });
  res.json({ success: true, question: q });
}));

router.put('/questions/:qId', guard, asyncHandler(async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  const update = {};
  if (question) update['questions.$.question'] = question;
  if (options) {
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
    update['questions.$.options'] = options;
  }
  if (correctAnswer !== undefined) update['questions.$.correctAnswer'] = parseInt(correctAnswer);
  if (difficulty) update['questions.$.difficulty'] = difficulty;
  if (menuItemId !== undefined) update['questions.$.menuItemId'] = menuItemId;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'questions.id': req.params.qId }, { $set: update });
  res.json({ success: true });
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

// ---- KPI (dinamik davr tizimi) ----
const { getPeriodKey, getPeriodLabel, getLastPeriodKeys, getPeriodRefDate } = require('../utils/kpi');

const KPI_DEFAULTS = {
  periodDays:10,
  masterMin:90, masterBonus:15, proMin:75, proBonus:0,
  goodMin:60, goodBonus:0, warningMin:45, warningPenalty:-10,
  penaltyMin:30, penaltyFine:-20
};

function calcKPI(results, cfg = {}, refDate = new Date()) {
  const s           = { ...KPI_DEFAULTS, ...cfg };
  const days        = s.periodDays || 10;
  const todayKey    = getPeriodKey(refDate, days);
  const periodLabel = getPeriodLabel(refDate, days);
  const current     = results.filter(r => getPeriodKey(r.submittedAt || r.date, days) === todayKey);

  if (!current.length) {
    const prev = [...results].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    return { level:'nodata', label:'Test topshirilmagan', color:'#666666', emoji:'—',
             avg:null, testCount:0, penalty:0, consecutiveLow:0, periodLabel, lastScore:prev?.score??null };
  }

  const avg = Math.round(current.reduce((s, r) => s + r.score, 0) / current.length);

  const lastKeys = getLastPeriodKeys(6, days, refDate);
  const byPeriod = {};
  results.forEach(r => { const k=getPeriodKey(r.submittedAt||r.date,days); if(!byPeriod[k]||r.score>byPeriod[k]) byPeriod[k]=r.score; });
  let consecutiveLow = 0;
  for (const k of lastKeys) {
    if (byPeriod[k] !== undefined && byPeriod[k] < s.goodMin) consecutiveLow++;
    else if (byPeriod[k] !== undefined) break;
  }

  let level, label, color, emoji, penalty;
  if      (avg >= s.masterMin)  { level='master';  label='MASTER';        color='#F39C12'; emoji='🏆'; penalty=s.masterBonus;    }
  else if (avg >= s.proMin)     { level='pro';     label='PRO';           color='#3498DB'; emoji='⭐'; penalty=s.proBonus;       }
  else if (avg >= s.goodMin)    { level='good';    label='YAXSHI';        color='#2ECC71'; emoji='✅'; penalty=s.goodBonus;      }
  else if (avg >= s.warningMin) { level='warning'; label='OGOHLANTIRISH'; color='#E67E22'; emoji='⚠️'; penalty=s.warningPenalty; }
  else if (avg >= s.penaltyMin) { level='penalty'; label='JAZO';          color='#E74C3C'; emoji='🔴'; penalty=s.penaltyFine;    }
  else                          { level='fail';    label='NOMUVOFIQ';      color='#9B59B6'; emoji='❌'; penalty=s.penaltyFine;    }

  return { level, label, color, emoji, avg, testCount:current.length, penalty, consecutiveLow, periodLabel };
}

router.get('/kpi', guard, asyncHandler(async (req, res) => {
  const r       = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters testResults kpiSettings');
  const waiters = (r?.waiters || []).filter(w => w.active);
  const results = r?.testResults || [];
  const cfg     = r?.kpiSettings?.toObject ? r.kpiSettings.toObject() : (r?.kpiSettings || {});
  const days    = cfg.periodDays || KPI_DEFAULTS.periodDays;
  const offset  = Math.max(0, Math.min(36, parseInt(req.query.offset) || 0));
  const refDate = getPeriodRefDate(offset, days);
  const periodLabel = getPeriodLabel(refDate, days);

  const kpiList = waiters.map(w => {
    const wr   = results.filter(r => r.waiterId === w.id);
    const kpi  = calcKPI(wr, cfg, refDate);
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
  const fields = ['periodDays','masterMin','masterBonus','proMin','proBonus','goodMin','goodBonus','warningMin','warningPenalty','penaltyMin','penaltyFine'];
  const update = {};
  fields.forEach(f => { if (req.body[f] !== undefined) update[`kpiSettings.${f}`] = Number(req.body[f]); });
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $set: update });
  res.json({ success: true });
}));

// KPI hisobotini Excel (buxgalter uchun tayyor fayl) sifatida yuklab olish
router.get('/kpi/export', guard, asyncHandler(async (req, res) => {
  const XLSX = require('xlsx');
  const r       = await Restaurant.findOne({ id: req.user.restaurantId }, 'name waiters testResults kpiSettings');
  const waiters = (r?.waiters || []).filter(w => w.active);
  const results = r?.testResults || [];
  const cfg     = r?.kpiSettings?.toObject ? r.kpiSettings.toObject() : (r?.kpiSettings || {});
  const days    = cfg.periodDays || KPI_DEFAULTS.periodDays;
  const offset  = Math.max(0, Math.min(36, parseInt(req.query.offset) || 0));
  const refDate = getPeriodRefDate(offset, days);
  const periodLabel = getPeriodLabel(refDate, days);

  const kpiList = waiters.map(w => {
    const wr = results.filter(t => t.waiterId === w.id);
    return { waiterName: w.name, ...calcKPI(wr, cfg, refDate) };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  const header = [
    ['KPI & MAOSH HISOBOTI'],
    [`Restoran: ${r?.name || ''}`],
    [`Davr: ${periodLabel}`],
    [`Tuzilgan sana: ${new Date().toISOString().split('T')[0]}`],
    [],
    ['№', 'Ofitsiant', 'Daraja', "O'rtacha ball (%)", 'Test soni', 'Bonus/Jarima (%)', 'Izoh']
  ];
  const rows = kpiList.map((k, i) => [
    i + 1,
    k.waiterName,
    k.level === 'nodata' ? '—' : k.label,
    k.avg ?? '',
    k.testCount,
    k.level === 'nodata' ? '' : k.penalty,
    k.level === 'nodata' ? 'Test topshirilmagan' : (k.consecutiveLow >= 2 ? `${k.consecutiveLow} davr ketma-ket past natija` : '')
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  ws['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KPI');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const fname = `kpi-${(r?.name || 'restoran').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
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

router.post('/training', guard, trainingVideoUpload.single('video'), asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title || !title.trim()) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Sarlavha majburiy' }); }
  if (!req.file) return res.status(400).json({ error: 'Video fayl majburiy' });

  const outFilename = uuidv4() + '.mp4';
  const outPath = path.join(TRAINING_VIDEO_DIR, outFilename);
  try {
    await convertToMp4(req.file.path, outPath);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Videoni qayta ishlashda xatolik yuz berdi. Boshqa fayl bilan urinib ko\'ring.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
  const maxOrder = (r?.trainingVideos || []).reduce((m, v) => Math.max(m, v.order || 0), -1);
  const video = {
    id: uuidv4(),
    title: title.trim(),
    description: (description || '').trim(),
    videoUrl: '/uploads/training/' + outFilename,
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
  if (vid?.videoUrl?.startsWith('/uploads/training/')) {
    fs.unlink(path.join(TRAINING_VIDEO_DIR, path.basename(vid.videoUrl)), () => {});
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
  const { title, description, emoji, color, order } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Modul nomi kiritilmagan' });
  const module = { id: uuidv4(), title: title.trim(), description: description?.trim()||'',
    emoji: emoji||'📚', color: color||'#C8922A', order: order||0, lessons: [], quiz: [] };
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
  const { title, description, emoji, color, order, passingScore } = req.body;
  const upd = {};
  if (title)        upd['modules.$.title']        = title.trim();
  if (description !== undefined) upd['modules.$.description'] = description.trim();
  if (emoji)        upd['modules.$.emoji']        = emoji;
  if (color)        upd['modules.$.color']        = color;
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
