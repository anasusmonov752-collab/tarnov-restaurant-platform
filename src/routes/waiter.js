const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');
const { getPeriodKey, getPeriodLabel } = require('../utils/kpi');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.cookies?.token || req.ip,
  message: { error: '1 daqiqada 20 ta savol limitiga yetdingiz. Biroz kuting.' },
  standardHeaders: true, legacyHeaders: false
});

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
    breakdown.push({ questionId: qId, question: q.question, selectedAnswer: parseInt(selected), correctAnswer: q.correctAnswer, isCorrect, difficulty: q.difficulty, options: q.options, explanation: q.explanation || '' });
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

const KPI_DEFAULTS_WAITER = { masterMin:90,masterBonus:15,proMin:75,proBonus:0,goodMin:60,goodBonus:0,warningMin:45,warningPenalty:-10,penaltyMin:30,penaltyFine:-20,periodDays:10 };

router.get('/kpi', guard, asyncHandler(async (req, res) => {
  const r       = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults kpiSettings');
  const results = (r?.testResults || []).filter(t => t.waiterId === req.user.waiterId);
  const s = { ...KPI_DEFAULTS_WAITER, ...(r?.kpiSettings?.toObject?.() || r?.kpiSettings || {}) };
  const days = s.periodDays || 10;

  const today      = new Date();
  const todayKey   = getPeriodKey(today, days);
  const periodLabel = getPeriodLabel(today, days);
  const current    = results.filter(res => getPeriodKey(res.submittedAt || res.date, days) === todayKey);

  if (!current.length) {
    const prev = [...results].sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))[0];
    return res.json({
      level:'nodata', label:'Test topshirilmagan', color:'#666666', emoji:'—',
      avg:null, testCount:0, penalty:0, consecutiveLow:0, periodLabel,
      lastScore: prev?.score??null,
      advice:`Bu ${days} kunlik davrda hali test topshirilmagan. Test kuni e'lonini kuzatib boring.`
    });
  }

  const avg = Math.round(current.reduce((s,r)=>s+r.score,0)/current.length);

  const byPeriod={};
  results.forEach(res=>{const k=getPeriodKey(res.submittedAt||res.date,days);if(byPeriod[k]===undefined||res.score>byPeriod[k])byPeriod[k]=res.score;});
  let d2=new Date(today), consecutiveLow=0;
  for(let i=0;i<6;i++){
    const k=getPeriodKey(d2,days);
    if(byPeriod[k]!==undefined){ if(byPeriod[k]<s.goodMin)consecutiveLow++; else break; }
    d2.setDate(d2.getDate()-days);
  }

  let level,label,color,emoji,penalty,advice;
  if      (avg>=s.masterMin) {level='master'; label='MASTER';        color='#F39C12';emoji='🏆';penalty=s.masterBonus;   advice=`Ajoyib natija! Bu davrda ish haqingizga +${s.masterBonus}% bonus qo'shiladi.`;}
  else if (avg>=s.proMin)    {level='pro';    label='PRO';           color='#3498DB';emoji='⭐';penalty=s.proBonus;      advice=`Yaxshi natija! Keyingi davrda ${s.masterMin}%+ ga yetib MASTER bo'ling.`;}
  else if (avg>=s.goodMin)   {level='good';   label='YAXSHI';        color='#2ECC71';emoji='✅';penalty=s.goodBonus;     advice="Me'yor darajasida. Menyu va ingredientlarni chuqurroq o'rganing.";}
  else if (avg>=s.warningMin){level='warning';label='OGOHLANTIRISH'; color='#E67E22';emoji='⚠️';penalty=s.warningPenalty;advice=`Diqqat! Bu davr uchun ish haqidan ${Math.abs(s.warningPenalty)}% ushlanadi.`;}
  else if (avg>=s.penaltyMin){level='penalty';label='JAZO';          color='#E74C3C';emoji='🔴';penalty=s.penaltyFine;   advice=`Kritik! Bu davr uchun ${Math.abs(s.penaltyFine)}% ushlanma. O'quv modullariga o'ting.`;}
  else                       {level='fail';   label='NOMUVOFIQ';     color='#9B59B6';emoji='❌';penalty=s.penaltyFine;  advice=`Kritik past natija! Bu davr uchun ${Math.abs(s.penaltyFine)}% ushlanma. Qayta o'qitish majburiy — rahbariyat bilan bog'laning.`;}

  res.json({ level,label,color,emoji,avg,testCount:current.length,penalty,consecutiveLow,periodLabel,advice });
}));

router.get('/adaptation', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'adaptation waiters');
  const waiter = (r?.waiters || []).find(w => w.id === req.user.waiterId);
  const adapt = r?.adaptation ? r.adaptation.toObject() : {};
  adapt.readDocuments = waiter?.readDocuments || [];
  res.json(adapt);
}));

router.post('/adaptation/documents/:docId/read', guard, asyncHandler(async (req, res) => {
  await Restaurant.updateOne(
    { id: req.user.restaurantId, 'waiters.id': req.user.waiterId },
    { $addToSet: { 'waiters.$.readDocuments': req.params.docId } }
  );
  res.json({ success: true });
}));

// ── TRAINING VIDEOS (erkin nomlangan qisqa standart videolar) ─

router.get('/training', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos waiterTrainingViews');
  const videos = (r?.trainingVideos || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const myViews = r?.waiterTrainingViews?.find(v => v.waiterId === req.user.waiterId)?.viewedVideoIds || [];
  res.json(videos.map(v => ({ ...v.toObject(), viewed: myViews.includes(v.id) })));
}));

router.post('/training/:videoId/view', guard, asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const r = await Restaurant.findOne({ id: req.user.restaurantId, 'waiterTrainingViews.waiterId': req.user.waiterId }, 'waiterTrainingViews');
  if (!r) {
    await Restaurant.updateOne(
      { id: req.user.restaurantId },
      { $push: { waiterTrainingViews: { waiterId: req.user.waiterId, viewedVideoIds: [videoId] } } }
    );
  } else {
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'waiterTrainingViews.waiterId': req.user.waiterId },
      { $addToSet: { 'waiterTrainingViews.$.viewedVideoIds': videoId } }
    );
  }
  res.json({ success: true });
}));

// ── TRAINING MODULES ─────────────────────────────────────────

router.get('/modules', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const modules = (r?.modules || []).sort((a,b) => (a.order||0)-(b.order||0));
  const myProgress = (r?.moduleProgress || []).filter(p => p.waiterId === req.user.waiterId);

  const result = modules.map(m => {
    const prog = myProgress.find(p => p.moduleId === m.id) || {};
    const completedLessons = prog.completedLessons || [];
    const totalLessons = m.lessons.length;
    return {
      id: m.id, title: m.title, description: m.description,
      emoji: m.emoji, color: m.color, order: m.order,
      totalLessons, completedLessons: completedLessons.length,
      quizScore: prog.quizScore ?? -1,
      completed: prog.completed || false,
      badgeEarned: prog.badgeEarned || false,
      passingScore: m.passingScore || 70,
      quizCount: m.quiz?.length || 0,
      // lessons (without heavy image data for list view)
      lessons: m.lessons.sort((a,b)=>(a.order||0)-(b.order||0)).map(l => ({
        id: l.id, title: l.title, order: l.order,
        hasImage: !!l.image, hasVideo: !!l.videoUrl,
        done: completedLessons.includes(l.id)
      }))
    };
  });
  res.json(result);
}));

// Get single lesson (full content)
router.get('/modules/:moduleId/lessons/:lessonId', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const mod = r?.modules?.find(m => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Modul topilmadi' });
  const lesson = mod.lessons.find(l => l.id === req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Dars topilmadi' });

  // Mark lesson as completed
  const prog = (r.moduleProgress || []).find(p => p.waiterId === req.user.waiterId && p.moduleId === req.params.moduleId);
  if (!prog) {
    await Restaurant.updateOne({ id: req.user.restaurantId }, {
      $push: { moduleProgress: { waiterId: req.user.waiterId, moduleId: req.params.moduleId, completedLessons: [lesson.id] } }
    });
  } else if (!prog.completedLessons.includes(lesson.id)) {
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'moduleProgress.waiterId': req.user.waiterId, 'moduleProgress.moduleId': req.params.moduleId },
      { $push: { 'moduleProgress.$.completedLessons': lesson.id } }
    );
  }

  // Check if all lessons done
  const updatedR = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const updProg = (updatedR.moduleProgress || []).find(p => p.waiterId === req.user.waiterId && p.moduleId === req.params.moduleId);
  const allDone = mod.lessons.length > 0 && mod.lessons.every(l => (updProg?.completedLessons || []).includes(l.id));

  res.json({ ...lesson.toObject(), allLessonsDone: allDone, quizAvailable: allDone && mod.quiz?.length > 0 });
}));

// Get quiz (allow retry if not passed)
router.get('/modules/:moduleId/quiz', guard, asyncHandler(async (req, res) => {
  const r   = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const mod = r?.modules?.find(m => m.id === req.params.moduleId);
  if (!mod)              return res.status(404).json({ error: 'Modul topilmadi' });
  if (!mod.quiz?.length) return res.status(400).json({ error: 'Bu modulda quiz savollar yo\'q' });

  const prog = (r.moduleProgress || []).find(
    p => p.waiterId === req.user.waiterId && p.moduleId === req.params.moduleId
  );
  // Block only if already PASSED
  if (prog?.completed) return res.status(400).json({ error: 'Siz bu quizni allaqachon muvaffaqiyatli topshirdingiz' });

  // All lessons must be completed first
  const done = prog?.completedLessons || [];
  if (mod.lessons.length > 0 && !mod.lessons.every(l => done.includes(l.id))) {
    return res.status(400).json({ error: 'Avval barcha darslarni tugatish kerak' });
  }

  res.json({ quiz: mod.quiz.map(q => ({ id: q.id, question: q.question, options: q.options })) });
}));

// Submit quiz
router.post('/modules/:moduleId/quiz', guard, asyncHandler(async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Javoblar noto\'g\'ri' });

  const r   = await Restaurant.findOne({ id: req.user.restaurantId }, 'modules moduleProgress');
  const mod = r?.modules?.find(m => m.id === req.params.moduleId);
  if (!mod) return res.status(404).json({ error: 'Modul topilmadi' });

  const existing = (r.moduleProgress || []).find(
    p => p.waiterId === req.user.waiterId && p.moduleId === req.params.moduleId
  );
  if (existing?.completed) return res.status(400).json({ error: 'Siz bu quizni allaqachon muvaffaqiyatli topshirdingiz' });

  let correct = 0;
  mod.quiz.forEach(q => { if (parseInt(answers[q.id]) === q.correctAnswer) correct++; });
  const total  = mod.quiz.length;
  const score  = total > 0 ? Math.round((correct / total) * 100) : 100;
  const passed = score >= (mod.passingScore || 70);
  const update = { quizScore: score, completed: passed, badgeEarned: passed };
  if (passed) update.completedAt = new Date();

  if (existing) {
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'moduleProgress.waiterId': req.user.waiterId, 'moduleProgress.moduleId': req.params.moduleId },
      { $set: Object.fromEntries(Object.entries(update).map(([k,v]) => [`moduleProgress.$.${k}`, v])) }
    );
  } else {
    await Restaurant.updateOne(
      { id: req.user.restaurantId },
      { $push: { moduleProgress: { waiterId: req.user.waiterId, moduleId: req.params.moduleId, completedLessons: [], ...update } } }
    );
  }

  res.json({ score, correct, total, passed, passingScore: mod.passingScore || 70 });
}));

router.get('/leaderboard', guard, asyncHandler(async (req, res) => {
  const filter = req.query.filter || 'best'; // best | avg | certs
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults waiters');
  if (!r) return res.json([]);

  const waiterMap = {};
  (r.waiters || []).forEach(w => { waiterMap[w.id] = w.name; });

  const grouped = {};
  (r.testResults || []).forEach(result => {
    if (!grouped[result.waiterId]) grouped[result.waiterId] = [];
    grouped[result.waiterId].push(result);
  });

  const board = Object.entries(grouped).map(([waiterId, results]) => {
    const best = Math.max(...results.map(x => x.score));
    const avg  = Math.round(results.reduce((s,x) => s + x.score, 0) / results.length);
    const certs = results.filter(x => x.hasCertificate).length;
    const value = filter === 'best' ? best : filter === 'avg' ? avg : certs;
    return { waiterId, name: waiterMap[waiterId] || 'Noma\'lum', value, certCount: certs, testCount: results.length };
  });

  board.sort((a, b) => b.value - a.value);
  res.json(board.slice(0, 20));
}));

// ── AI CHAT ──────────────────────────────────────────────────
router.post('/ai-chat', guard, aiChatLimiter, asyncHandler(async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI xizmati hozircha mavjud emas.' });
  }

  const { message, history } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Savol kiritilmagan' });

  const r = await Restaurant.findOne(
    { id: req.user.restaurantId },
    'name location menu adaptation announcements'
  );
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  // Menyu konteksti
  const menuText = r.menu.map(item => {
    const parts = [`• ${item.name} (${item.category}) — ${item.price.toLocaleString()} so'm`];
    if (item.description)      parts.push(`  Tavsif: ${item.description}`);
    if (item.ingredients?.length) parts.push(`  Tarkib: ${item.ingredients.join(', ')}`);
    if (item.allergens?.length)   parts.push(`  Allergenlar: ${item.allergens.join(', ')}`);
    if (item.servingSuggestion)   parts.push(`  Tavsiya: ${item.servingSuggestion}`);
    return parts.join('\n');
  }).join('\n');

  // Adaptatsiya hujjatlari
  const docsText = (r.adaptation?.documents || [])
    .map(d => `### ${d.title}\n${d.content}`)
    .join('\n\n');

  // So'nggi e'lonlar
  const annText = (r.announcements || []).slice(0, 5)
    .map(a => `• ${a.title}: ${a.content}`)
    .join('\n');

  const systemPrompt = `Siz "${r.name}" restoranining raqamli yordamchisisiz.
Faqat quyidagi ma'lumotlar asosida ofitsiantlarga yordam bering.
Javoblar O'zbek tilida, qisqa va aniq bo'lsin.
Agar savol menyu yoki restoran bilan bog'liq bo'lmasa: "Bu savolga javob bera olmayman, faqat restoran va menyu bo'yicha yordam beraman." deb ayting.

=== MENYU ===
${menuText}

${docsText ? `=== RESTORAN HAQIDA ===\n${docsText}` : ''}

${annText ? `=== SO'NGGI E'LONLAR ===\n${annText}` : ''}`;

  // Suhbat tarixi (oxirgi 6 xabar)
  const safeHistory = Array.isArray(history) ? history.slice(-6) : [];
  const messages = [
    ...safeHistory.map(m => ({ role: m.role, content: String(m.content) })),
    { role: 'user', content: message.trim() }
  ];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages
  });

  res.json({ reply: response.content[0].text });
}));

module.exports = router;
