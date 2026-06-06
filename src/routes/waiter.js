const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');

const router = express.Router();
const guard = auth(['waiter']);

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

router.get('/info', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const waiter = r.waiters.find(w => w.id === req.user.waiterId);
  const today = new Date().toISOString().split('T')[0];
  res.json({
    waiter,
    restaurant: { id: r.id, name: r.name, location: r.location },
    isTestDay: r.testDays.includes(today),
    announcements: (r.announcements || []).slice(0, 3)
  });
}));

router.get('/menu', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (r.testDays.includes(today)) return res.json({ hidden: true, message: 'Bugun test kuni! Menyu yashirilgan.' });
  res.json({ hidden: false, menu: r.menu });
}));

router.get('/test/start', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays.includes(today)) return res.status(403).json({ error: 'Bugun test kuni emas' });
  const taken = r.testResults.find(x => x.waiterId === req.user.waiterId && x.date === today);
  if (taken) return res.status(400).json({ error: 'Siz bugun allaqachon test topshirdingiz', result: taken });
  const easy = r.questions.filter(q => q.difficulty === 'easy');
  const medium = r.questions.filter(q => q.difficulty === 'medium');
  const hard = r.questions.filter(q => q.difficulty === 'hard');
  if (easy.length < 10 || medium.length < 5 || hard.length < 5) {
    return res.status(400).json({
      error: `Test uchun yetarli savol yo'q. Kerak: 10 oson, 5 o'rta, 5 qiyin. Mavjud: ${easy.length} oson, ${medium.length} o'rta, ${hard.length} qiyin`
    });
  }
  const selected = [
    ...shuffle(easy).slice(0, 10),
    ...shuffle(medium).slice(0, 5),
    ...shuffle(hard).slice(0, 5)
  ].map(q => ({ id: q.id, question: q.question, options: q.options, difficulty: q.difficulty }));
  res.json({ questions: selected, timePerQuestion: 30 });
}));

router.post('/test/submit', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays.includes(today)) return res.status(403).json({ error: 'Bugun test kuni emas' });
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'Javoblar noto\'g\'ri formatda' });
  }
  let easyScore = 0, easyTotal = 0, mediumScore = 0, mediumTotal = 0, hardScore = 0, hardTotal = 0;
  const breakdown = [];
  Object.entries(answers).forEach(([qId, selected]) => {
    const q = r.questions.find(x => x.id === qId);
    if (!q) return;
    const isCorrect = parseInt(selected) === q.correctAnswer;
    breakdown.push({ questionId: qId, question: q.question, selectedAnswer: parseInt(selected), correctAnswer: q.correctAnswer, isCorrect, difficulty: q.difficulty, options: q.options });
    if (q.difficulty === 'easy') { easyTotal++; if (isCorrect) easyScore++; }
    else if (q.difficulty === 'medium') { mediumTotal++; if (isCorrect) mediumScore++; }
    else if (q.difficulty === 'hard') { hardTotal++; if (isCorrect) hardScore++; }
  });
  const totalCorrect = easyScore + mediumScore + hardScore;
  const totalQuestions = easyTotal + mediumTotal + hardTotal;
  const percentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const waiter = r.waiters.find(w => w.id === req.user.waiterId);
  const result = {
    id: uuidv4(), waiterId: req.user.waiterId, waiterName: waiter?.name || req.user.waiterName,
    date: today, score: percentage, totalCorrect, totalQuestions,
    easyScore, easyTotal, mediumScore, mediumTotal, hardScore, hardTotal,
    hasCertificate: percentage >= 90, breakdown
  };
  // Atomic update: faqat bu waiter bugun test topshirmagan bo'lsa qo'shadi
  const updateResult = await Restaurant.updateOne(
    { id: req.user.restaurantId, testResults: { $not: { $elemMatch: { waiterId: req.user.waiterId, date: today } } } },
    { $push: { testResults: result } }
  );
  if (updateResult.modifiedCount === 0) {
    const existing = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
    const taken = existing.testResults.find(x => x.waiterId === req.user.waiterId && x.date === today);
    return res.status(400).json({ error: 'Siz bugun allaqachon test topshirdingiz', result: taken });
  }
  res.json({ success: true, result });
}));

router.get('/history', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  const history = (r?.testResults || []).filter(x => x.waiterId === req.user.waiterId);
  res.json(history.sort((a, b) => new Date(b.date) - new Date(a.date)));
}));

router.get('/announcements', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'announcements');
  res.json(r?.announcements || []);
}));

router.get('/checklist', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'checklist waiterChecklists');
  const items = (r?.checklist || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  const wc = (r?.waiterChecklists || []).find(x => x.waiterId === req.user.waiterId);
  const completed = wc?.completedItems || [];
  res.json({ items: items.map(i => ({ ...i.toObject(), done: completed.includes(i.id) })) });
}));

router.post('/checklist/:itemId/toggle', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiterChecklists checklist');
  const exists = r?.checklist?.find(x => x.id === req.params.itemId);
  if (!exists) return res.status(404).json({ error: 'Topshiriq topilmadi' });
  const wc = (r?.waiterChecklists || []).find(x => x.waiterId === req.user.waiterId);
  const completed = wc?.completedItems || [];
  const isDone = completed.includes(req.params.itemId);
  if (isDone) {
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'waiterChecklists.waiterId': req.user.waiterId },
      { $pull: { 'waiterChecklists.$.completedItems': req.params.itemId } }
    );
  } else if (wc) {
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'waiterChecklists.waiterId': req.user.waiterId },
      { $push: { 'waiterChecklists.$.completedItems': req.params.itemId } }
    );
  } else {
    await Restaurant.updateOne(
      { id: req.user.restaurantId },
      { $push: { waiterChecklists: { waiterId: req.user.waiterId, completedItems: [req.params.itemId] } } }
    );
  }
  res.json({ success: true, done: !isDone });
}));

router.get('/adaptation', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'adaptation');
  res.json(r?.adaptation || {});
}));

module.exports = router;
