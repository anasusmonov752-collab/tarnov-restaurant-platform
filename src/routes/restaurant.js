const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');

const router = express.Router();
const guard = auth(['restaurant']);

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

router.post('/menu', guard, asyncHandler(async (req, res) => {
  const { name, category, description, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Taom nomi va kategoriya majburiy' });
  const item = {
    id: uuidv4(), name, category, description: description || '',
    ingredients: ingredients ? ingredients.split(',').map(i => i.trim()).filter(Boolean) : [],
    allergens: allergens ? allergens.split(',').map(a => a.trim()).filter(Boolean) : [],
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
  if (ingredients !== undefined) update['menu.$.ingredients'] = ingredients.split(',').map(i => i.trim()).filter(Boolean);
  if (allergens !== undefined) update['menu.$.allergens'] = allergens.split(',').map(a => a.trim()).filter(Boolean);
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
  const { history, mission, values } = req.body;
  const update = {};
  if (history !== undefined) update['adaptation.history'] = history;
  if (mission !== undefined) update['adaptation.mission'] = mission;
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

// Reorder modules
router.put('/modules/reorder', guard, asyncHandler(async (req, res) => {
  const { orders } = req.body; // [{ id, order }]
  const bulkOps = orders.map(({ id, order }) => ({
    updateOne: { filter: { id: req.user.restaurantId, 'modules.id': id }, update: { $set: { 'modules.$.order': order } } }
  }));
  await Restaurant.bulkWrite(bulkOps);
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
