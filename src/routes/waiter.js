const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');
const { getPeriodKey, getPeriodLabel } = require('../utils/kpi');
const ai = require('../services/ai');
const grading = require('../services/grading');
const mentor = require('../services/mentor');
const baseline = require('../data/baseline');
const mentorChat = require('../services/mentorChat');
const voice = require('../services/mentorVoice');
const assignments = require('../services/assignments');

const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  // ipKeyGenerator — IPv6 manzillarni to'g'ri normallashtiradi.
  // Busiz IPv6 foydalanuvchi har so'rovda yangi manzil bilan limitni aylanib
  // o'tishi va bepul AI kvotasini so'rib olishi mumkin edi.
  keyGenerator: (req) => req.cookies?.token || ipKeyGenerator(req.ip),
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
  // ADAPTIV: qiyinlik miksi ofitsiantning bilim darajasiga qarab tanlanadi,
  // oldin xato qilingan savollar ustuvor beriladi (spaced repetition).
  await ensureMenuLinks(r);
  const profile = mentor.buildProfile(r, req.user.waiterId);
  const pool = mentor.checkPool(r.questions, profile.level.key);
  if (!pool.ok) {
    const need = Object.entries(pool.missing)
      .map(([d, n]) => `${n} ta ${({ easy: 'oson', medium: "o'rta", hard: 'qiyin' })[d]}`).join(', ');
    return res.status(400).json({
      error: `Test uchun yetarli savol yo'q. Yetishmayapti: ${need}. ` +
             `Mavjud: ${pool.have.easy} oson, ${pool.have.medium} o'rta, ${pool.have.hard} qiyin`
    });
  }
  const selected = mentor.pickQuestions(r.questions, profile, shuffle).map(q => ({
    id: q.id,
    question: q.question,
    type: q.type || 'choice',
    // Yozma savolda variant yo'q. rubric/keyPoints HECH QACHON yuborilmaydi —
    // ular to'g'ri javob mezoni, frontendga ketsa ofitsiant ko'chirib oladi.
    options: q.type === 'written' ? [] : q.options,
    difficulty: q.difficulty
  }));
  // Yozma javob yozishga ko'proq vaqt kerak
  res.json({
    questions: selected,
    timePerQuestion: 30,
    timePerWrittenQuestion: +(process.env.WRITTEN_QUESTION_SECONDS || 120),
    level: profile.level
  });
}));

// Savollarning ko'pchiligida menuItemId bo'sh, lekin savol matnida taom nomi
// turadi. Mentorga kategoriya kesimi kerak, shuning uchun bog'lanishni
// hisoblab, hujjatga qo'llaymiz va fonda bazaga ham yozib qo'yamiz
// (keyingi so'rovlarda qayta hisoblanmasin).
async function ensureMenuLinks(r) {
  const links = mentor.backfillLinks(r.questions, r.menu);
  if (!links.length) return;

  const byId = new Map(links.map(l => [l.questionId, l.menuItemId]));
  r.questions.forEach(q => { if (!q.menuItemId && byId.has(q.id)) q.menuItemId = byId.get(q.id); });

  // Kutmaymiz — javobni ushlab turishi shart emas
  Promise.all(links.map(l => Restaurant.updateOne(
    { id: r.id, 'questions.id': l.questionId },
    { $set: { 'questions.$.menuItemId': l.menuItemId } }
  ))).catch(err => console.warn('[mentor] menyu bog\'lashni yozib bo\'lmadi:', err.message));
}

// ── MENTOR ────────────────────────────────────────────────────
// Bilim profili + bugungi shaxsiy vazifalar. AI ishlatilmaydi.
router.get('/mentor', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  await ensureMenuLinks(r);
  const profile = mentor.buildProfile(r, req.user.waiterId);
  const tasks   = mentor.dailyTasks(profile, r, req.user.waiterId);

  const assessment = (r.assessments || []).find(a => a.waiterId === req.user.waiterId);
  const course     = (r.courses || []).find(c => c.waiterId === req.user.waiterId);

  // Topshiriqlar shu yerda ko'rib chiqiladi: bosh ekran har ochilganda
  // mentor aytganini tekshiradi. Bajarilgani yopiladi, muddati o'tgani
  // "bajarilmagan" bo'ladi va mentor bir marta hisob so'raydi.
  let asg = { active: [], justDone: [], toAsk: [], overdueCount: 0 };
  try {
    asg = await assignments.review(r.id, req.user.waiterId, r);
  } catch (err) {
    // Topshiriqlar ishlamasa ham bosh ekran ochilaverishi kerak
    console.warn('[mentor] topshiriqlarni ko\'rib bo\'lmadi:', err.message);
  }

  res.json({
    profile, tasks,
    assessmentDone: !!assessment,
    assessmentScore: assessment?.score ?? null,
    course: course ? { progress: mentor.courseProgress(course) } : null,
    assignments: {
      active:   asg.active.map(x => ({
        id: x.doc.id, title: x.doc.title, detail: x.doc.detail,
        progress: x.progress, target: x.doc.check.target,
        manual: x.doc.check.type === 'manual', dueAt: x.doc.dueAt
      })),
      justDone: asg.justDone.map(a => ({ id: a.id, title: a.title })),
      missed:   asg.toAsk.map(a => ({
        id: a.id, title: a.title, progress: a.progressAt, target: a.check.target
      })),
      overdueCount: asg.overdueCount
    }
  });
}));

// Mashinada tekshirib bo'lmaydigan topshiriqni ofitsiant o'zi tasdiqlaydi
// (masalan "bu standartni smenada qo'llang"). Mentor bunda so'ziga ishonadi —
// lekin tasdiq yozib qo'yiladi va keyingi test uni tekshiradi.
router.post('/mentor/assignment/:id/done', guard, asyncHandler(async (req, res) => {
  const done = await assignments.confirmManual(req.params.id, req.user.restaurantId, req.user.waiterId);
  if (!done) return res.status(404).json({ error: 'Topshiriq topilmadi yoki allaqachon yopilgan' });
  res.json({ success: true });
}));

// ── BAZAVIY BILIM DIAGNOSTIKASI ───────────────────────────────
// Bir marta topshiriladi, KPI va maoshga TA'SIR QILMAYDI — maqsad
// baholash emas, o'quv kursini to'g'ri tuzish. Savollar oldindan
// yozilgan (src/data/baseline.js), AI so'rovi sarflanmaydi.

router.get('/assessment', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'assessments');
  const done = (r?.assessments || []).find(a => a.waiterId === req.user.waiterId);
  if (done) return res.json({ done: true, result: done });
  res.json({ done: false, questions: baseline.publicQuestions(), total: baseline.COUNT });
}));

router.post('/assessment', guard, asyncHandler(async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Javoblar noto\'g\'ri formatda' });
  }

  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const result = baseline.score(answers);
  const assessment = { waiterId: req.user.waiterId, ...result, completedAt: new Date() };
  const steps = mentor.buildCourse(result, r);

  // Diagnostika bir marta topshiriladi — allaqachon bo'lsa qayta yozmaymiz.
  const already = (r.assessments || []).some(a => a.waiterId === req.user.waiterId);
  if (already) {
    const old = r.assessments.find(a => a.waiterId === req.user.waiterId);
    return res.status(400).json({ error: 'Diagnostikani allaqachon topshirgansiz', result: old });
  }

  await Restaurant.updateOne(
    { id: r.id },
    {
      $push: {
        assessments: assessment,
        courses: { waiterId: req.user.waiterId, steps, createdAt: new Date(), updatedAt: new Date() }
      }
    }
  );

  res.json({ success: true, result: assessment, courseSteps: steps.length });
}));

// ── SHAXSIY O'QUV KURSI ───────────────────────────────────────
router.get('/course', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'courses assessments trainingVideos modules');
  const course = (r?.courses || []).find(c => c.waiterId === req.user.waiterId);
  if (!course) return res.json({ exists: false });

  // Qadam qaysi kontentga ishora qilayotganini nomi bilan qaytaramiz
  const vids = new Map((r.trainingVideos || []).map(v => [v.id, v.title]));
  const mods = new Map((r.modules || []).map(m => [m.id, m.title]));
  const steps = course.steps.map(s => ({
    ...s.toObject?.() ?? s,
    sourceName: s.sourceType === 'video' ? vids.get(s.sourceId)
              : s.sourceType === 'module' ? mods.get(s.sourceId) : null
  }));

  res.json({ exists: true, steps, progress: mentor.courseProgress(course) });
}));

router.post('/course/:stepId/done', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const course = (r.courses || []).find(c => c.waiterId === req.user.waiterId);
  if (!course) return res.status(404).json({ error: 'Kurs topilmadi' });

  const step = course.steps.find(s => s.id === req.params.stepId);
  if (!step) return res.status(404).json({ error: 'Qadam topilmadi' });

  step.done = req.body?.done !== false;
  step.doneAt = step.done ? new Date() : undefined;
  course.updatedAt = new Date();

  r.markModified('courses');
  await r.save();

  res.json({ success: true, progress: mentor.courseProgress(course) });
}));

// Takroriy xatolar ustida mashq — test emas, bali qo'yilmaydi, faqat o'rganish.
router.post('/mentor/practice', guard, asyncHandler(async (req, res) => {
  const { questionIds } = req.body;
  if (!Array.isArray(questionIds) || !questionIds.length) {
    return res.status(400).json({ error: 'Savollar tanlanmagan' });
  }
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'questions');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const ids = new Set(questionIds.slice(0, 10));
  const questions = r.questions.filter(q => ids.has(q.id)).map(q => ({
    id: q.id, question: q.question, type: q.type || 'choice',
    options: q.type === 'written' ? [] : q.options,
    difficulty: q.difficulty,
    // Mashqda to'g'ri javob KO'RSATILADI — maqsad baholash emas, o'rgatish
    correctAnswer: q.correctAnswer,
    explanation: q.explanation || '',
    rubric: q.type === 'written' ? q.rubric : undefined
  }));
  res.json({ questions });
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
  const breakdown = [];
  Object.entries(answers).forEach(([qId, given]) => {
    const q = r.questions.find(x => x.id === qId);
    if (!q) return;

    if (q.type === 'written') {
      // Yozma javob — hozir baholanmaydi, AI navbatiga tushadi.
      breakdown.push({
        questionId: qId, question: q.question, type: 'written',
        writtenAnswer: String(given ?? '').trim().slice(0, grading.MAX_ANSWER_LEN),
        aiScore: null, aiFeedback: '', manualScore: null,
        isCorrect: false, difficulty: q.difficulty,
        explanation: q.explanation || ''
      });
    } else {
      const isCorrect = parseInt(given) === q.correctAnswer;
      breakdown.push({
        questionId: qId, question: q.question, type: 'choice',
        selectedAnswer: parseInt(given), correctAnswer: q.correctAnswer,
        isCorrect, difficulty: q.difficulty, options: q.options,
        explanation: q.explanation || ''
      });
    }
  });

  const hasWritten = breakdown.some(b => b.type === 'written');
  const waiter = r.waiters.find(w => w.id === req.user.waiterId);
  const result = {
    id: uuidv4(), waiterId: req.user.waiterId, waiterName: waiter?.name || req.user.waiterName,
    date: today, breakdown,
    // Yozma javob bo'lsa ball hozircha faqat variantli savollardan hisoblanadi,
    // AI baholagach qayta hisoblanadi.
    gradingStatus: hasWritten ? 'pending' : 'complete'
  };
  grading.recalcScore(result);
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

  // Ofitsiant natijani DARHOL ko'radi (variantli savollar bo'yicha).
  // Yozma javoblar fonda navbatda baholanadi — 10 so'rov/daqiqa limiti sabab
  // hamma bir vaqtda topshirsa ham navbat tiqilib qolmaydi.
  res.json({ success: true, result });

  if (hasWritten) {
    gradeInBackground(req.user.restaurantId, result.id, r.questions).catch(err =>
      console.error('[grading] fon baholashda xato:', err.message)
    );
  }
}));

/**
 * Yozma javoblarni fonda baholab, natijani bazada yangilaydi.
 * Javob allaqachon yuborilgani uchun bu yerdagi xato foydalanuvchiga
 * ta'sir qilmaydi — natija 'failed' bo'lib admin ko'rigiga tushadi.
 */
async function gradeInBackground(restaurantId, resultId, questions) {
  let status = 'failed';
  let graded = null;

  try {
    const fresh = await Restaurant.findOne({ id: restaurantId }, 'testResults');
    const result = fresh?.testResults.find(x => x.id === resultId);
    if (!result) return;

    const out = await grading.gradeTestResult(result.toObject(), questions, restaurantId);
    graded = out.result;
    status = out.status;
  } catch (err) {
    console.error('[grading] AI baholay olmadi:', err.code || err.message);
    // Kvota tugagan yoki AI ishlamadi — admin qo'lda baholaydi.
    return void await Restaurant.updateOne(
      { id: restaurantId, 'testResults.id': resultId },
      { $set: { 'testResults.$.gradingStatus': 'failed' } }
    );
  }

  await Restaurant.updateOne(
    { id: restaurantId, 'testResults.id': resultId },
    { $set: {
      'testResults.$.breakdown':      graded.breakdown,
      'testResults.$.score':          graded.score,
      'testResults.$.totalCorrect':   graded.totalCorrect,
      'testResults.$.totalQuestions': graded.totalQuestions,
      'testResults.$.easyScore':      graded.easyScore,
      'testResults.$.easyTotal':      graded.easyTotal,
      'testResults.$.mediumScore':    graded.mediumScore,
      'testResults.$.mediumTotal':    graded.mediumTotal,
      'testResults.$.hardScore':      graded.hardScore,
      'testResults.$.hardTotal':      graded.hardTotal,
      'testResults.$.hasCertificate': graded.hasCertificate,
      'testResults.$.gradingStatus':  status,
      'testResults.$.gradedAt':       new Date()
    } }
  );
}

// Yozma javoblar fonda baholanayotganda frontend shu endpoint'ni so'raydi.
// gradingStatus 'pending' bo'lsa yana so'raydi, 'complete'/'failed' bo'lsa to'xtaydi.
router.get('/test/result/:id', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  const result = (r?.testResults || []).find(x => x.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Natija topilmadi' });
  // Boshqa ofitsiantning natijasini ko'rsatmaymiz
  if (result.waiterId !== req.user.waiterId) return res.status(403).json({ error: 'Ruxsat yo\'q' });
  res.json({ result });
}));

// ── MURABBIY HUKMI ────────────────────────────────────────────
// Test tugagach mentor baho beradi. Alohida endpoint, chunki natija
// DARHOL ko'rinishi kerak — AI javobini kutib turmasin.
//
// Bir marta yoziladi va saqlanadi: ikkinchi ochilishda o'sha gap turadi,
// kvota qayta sarflanmaydi. Hukm suhbat tarixiga ham yoziladi — shunda
// mentor keyingi gaplashuvda "testdan keyin nima deganini" eslaydi.
router.post('/test/:id/verdict', guard, asyncHandler(async (req, res) => {
  // Rasmlar tashlab yuboriladi: menyu Base64 rasmlar bilan bir necha MB bo'ladi,
  // hukmga esa faqat kategoriya nomi kerak.
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, '-menu.image');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  const result = (r.testResults || []).find(x => x.id === req.params.id);
  if (!result) return res.status(404).json({ error: 'Natija topilmadi' });
  if (result.waiterId !== req.user.waiterId) return res.status(403).json({ error: 'Ruxsat yo\'q' });

  // Allaqachon bor — qayta yozmaymiz
  if (result.mentorVerdict) return res.json({ verdict: result.mentorVerdict });

  // Yozma javoblar hali baholanmagan — ball yakuniy emas. Yarim ball ustidan
  // hukm chiqarsak, keyin ball ko'tarilib mentor noto'g'ri gapirgan bo'lib qoladi.
  if (result.gradingStatus === 'pending') return res.json({ pending: true });

  const profile = mentor.buildProfile(r, req.user.waiterId);
  const prev = (r.testResults || [])
    .filter(t => t.waiterId === req.user.waiterId && t.id !== result.id)
    .sort((a, b) => new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date))[0];

  const assessment = (r.assessments || []).find(a => a.waiterId === req.user.waiterId);
  const course     = (r.courses || []).find(c => c.waiterId === req.user.waiterId);

  // Topshiriq: mentor nimani talab qilishini TIZIM hal qiladi, AI emas.
  // Sabab — talab keyinchalik avtomatik tekshiriladi, shuning uchun u
  // o'lchanadigan bo'lishi shart. AI faqat shu talabni o'z so'zi bilan aytadi.
  // Faol topshiriq bo'lsa yangisini bermaymiz: bir vaqtda bitta talab.
  const busy = await assignments.hasActive(r.id, req.user.waiterId);
  const proposal = busy ? null : assignments.proposeFromTest(result, profile, r);

  let verdict;
  try {
    if (!ai.isConfigured()) throw new Error('AI sozlanmagan');
    const chatDoc = await mentorChat.load(r.id, req.user.waiterId);

    verdict = await ai.complete({
      system: voice.buildSystem({
        restaurantName: r.name,
        tone:    voice.toneFor(profile),
        task:    voice.TASKS.verdict + (proposal
          ? `\n\nTALABINGIZ AYNAN SHU BO'LSIN (o'zgartirmang, boshqa talab qo'shmang):\n"${proposal.title}" — ${proposal.due}.\nBuni o'z so'zingiz bilan, tabiiy qilib ayting.`
          : '\n\nYangi talab QO\'YMANG — bu ofitsiantda bajarilmagan topshiriq allaqachon bor. Uni eslatib qo\'ying.'),
        profile: voice.profileBlock(profile, { assessment, course }),
        memory:  chatDoc?.summary
        // Menyu ataylab yuborilmaydi: hukm uchun kerak emas, token esa ko'p yeydi.
      }),
      messages: [{ role: 'user', content: `=== HOZIRGI TEST ===\n${voice.testBlock(result, profile, prev)}` }],
      maxTokens: 400,
      tier: 'fast',
      restaurantId: req.user.restaurantId
    });
    verdict = String(verdict || '').trim();
  } catch (err) {
    // Kvota tugadi yoki AI ishlamadi — mentor baribir jim qolmaydi.
    console.warn('[mentor] hukmni AI yoza olmadi, zaxira ishlatildi:', err.code || err.message);
    verdict = voice.fallbackVerdict(result, profile, prev, proposal);
  }

  if (!verdict) verdict = voice.fallbackVerdict(result, profile, prev, proposal);

  // Topshiriqni hukm muvaffaqiyatli chiqqandan keyin yozamiz — ofitsiant
  // ko'rmagan talabni keyin undan so'rash noto'g'ri bo'lardi.
  if (proposal) {
    await assignments.create({
      restaurantId: r.id, waiterId: req.user.waiterId,
      title: proposal.title, detail: proposal.detail, check: proposal.check
    }, r).catch(err => console.warn('[mentor] topshiriqni yozib bo\'lmadi:', err.message));
  }

  await Restaurant.updateOne(
    { id: r.id, 'testResults.id': result.id },
    { $set: { 'testResults.$.mentorVerdict': verdict, 'testResults.$.mentorVerdictAt': new Date() } }
  );

  res.json({ verdict });

  // Suhbat xotirasiga yozamiz — mentor o'zi aytgan gapni eslashi uchun.
  // Prefiks ataylab yo'q: ofitsiant chatni ochganda bu oddiy murabbiy gapi
  // bo'lib ko'rinadi, texnik yorliq bo'lib emas.
  // Javob allaqachon yuborilgan, ofitsiant buni kutmaydi.
  mentorChat.append(r.id, req.user.waiterId, 'assistant', verdict)
    .catch(err => console.warn('[mentor] hukmni suhbatga yozib bo\'lmadi:', err.message));
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

// ── MENYU YODLASH MASHQI (flashcard progressi) ────────────────

router.get('/menu-progress', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiterMenuProgress');
  const p = r?.waiterMenuProgress?.find(x => x.waiterId === req.user.waiterId);
  res.json({ knownDishIds: p?.knownDishIds || [] });
}));

// Bitta taomni "bildim" / "takrorlash" deb belgilash
router.post('/menu-progress/:dishId', guard, asyncHandler(async (req, res) => {
  const { dishId } = req.params;
  const known = req.body?.known !== false;   // default: bildim
  const exists = await Restaurant.findOne(
    { id: req.user.restaurantId, 'waiterMenuProgress.waiterId': req.user.waiterId }, 'id'
  );
  if (!exists) {
    await Restaurant.updateOne({ id: req.user.restaurantId }, {
      $push: { waiterMenuProgress: { waiterId: req.user.waiterId, knownDishIds: known ? [dishId] : [], updatedAt: new Date() } }
    });
  } else {
    const op = known ? { $addToSet: { 'waiterMenuProgress.$.knownDishIds': dishId } }
                     : { $pull:     { 'waiterMenuProgress.$.knownDishIds': dishId } };
    op.$set = { 'waiterMenuProgress.$.updatedAt': new Date() };
    await Restaurant.updateOne(
      { id: req.user.restaurantId, 'waiterMenuProgress.waiterId': req.user.waiterId }, op
    );
  }
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

  // ── Videoni ko'rish o'zi hech narsani o'rgatmaydi ──
  // Standart faqat ZALDA qo'llanganda o'rganiladi. Shuning uchun mentor
  // videoni ko'rgan ofitsiantga uni ishlatishni topshiriq qilib beradi va
  // ertaga so'raydi. Bu tekshirib bo'lmaydigan topshiriq ('manual') —
  // ofitsiantning o'zi tasdiqlaydi.
  //
  // Faol topshiriq bo'lsa yangisini bermaymiz: bir vaqtda bitta talab,
  // aks holda ro'yxat to'planib qoladi va hech biri bajarilmaydi.
  let created = false;
  try {
    if (!await assignments.hasActive(req.user.restaurantId, req.user.waiterId)) {
      const full = await Restaurant.findOne({ id: req.user.restaurantId }, 'trainingVideos');
      const video = (full?.trainingVideos || []).find(v => v.id === videoId);
      if (video) {
        await assignments.create({
          restaurantId: req.user.restaurantId, waiterId: req.user.waiterId,
          title: `"${video.title}" standartini bugungi smenada qo'llash`,
          detail: 'Videoni ko\'rdingiz. Endi uni zalda ishlating — ertaga so\'rayman.',
          check: { type: 'manual', target: 1 }
        }, full);
        created = true;
      }
    }
  } catch (err) {
    // Topshiriq yozilmasa ham video ko'rilgani saqlanib qolishi kerak
    console.warn('[mentor] video topshirig\'ini yozib bo\'lmadi:', err.message);
  }

  res.json({ success: true, assignmentCreated: created });
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
  if (!ai.isConfigured()) {
    return res.status(503).json({ error: 'AI xizmati hozircha mavjud emas.' });
  }

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Savol kiritilmagan' });

  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });

  // ── Ofitsiantning bilim profili ──
  // Mentor "sizning natijangizni biladigan murabbiy" bo'lishi uchun kerak.
  // MAXFIYLIK: ism yuborilmaydi — faqat raqamlar va yo'nalish nomlari.
  // Suhbat tarixi BAZADAN olinadi — frontenddan emas. Shunda mentor
  // telefon almashtirilsa yoki sahifa yangilansa ham hech narsani unutmaydi,
  // va foydalanuvchi tarixni o'zgartirib, mentorni chalg'ita olmaydi.
  // (systemPrompt ichida ishlatilgani uchun undan OLDIN turishi shart.)
  const chatDoc = await mentorChat.load(r.id, req.user.waiterId);
  const ctx = mentorChat.buildContext(chatDoc);

  const profile    = mentor.buildProfile(r, req.user.waiterId);
  const assessment = (r.assessments || []).find(a => a.waiterId === req.user.waiterId);
  const course     = (r.courses || []).find(c => c.waiterId === req.user.waiterId);

  // Topshiriqlar FAQAT o'qiladi — holatni bosh ekran o'zgartiradi.
  let snap = { active: [], toAsk: [], overdueCount: 0 };
  try {
    snap = await assignments.snapshot(r.id, req.user.waiterId, r);
  } catch (err) {
    console.warn('[mentor] topshiriqlarni o\'qib bo\'lmadi:', err.message);
  }

  // Mentorning xarakteri mentorVoice ichida — chat, test hukmi va boshqa
  // ekranlar bir xil odam bo'lib gapirishi uchun.
  // Qattiqlik darajasi bajarilmagan topshiriqlarga qarab ko'tariladi:
  // mentor bilmaslikka emas, aytilganni bajarmaslikka qattiq turadi.
  const systemPrompt = voice.buildSystem({
    restaurantName: r.name,
    tone:    voice.toneFor(profile, { overdue: snap.overdueCount }),
    task:    voice.TASKS.chat,
    profile: voice.profileBlock(profile, { assessment, course }),
    assignments: assignments.contextBlock(snap),
    memory:  ctx.summary,
    menu:    voice.menuBlock(r.menu),
    docs:    voice.docsBlock(r),
    announcements: voice.annBlock(r)
  });

  const messages = [
    ...ctx.recent,
    { role: 'user', content: message.trim() }
  ];

  // tier 'fast' — chat Flash-Lite'da ketadi (1500 so'rov/kun), shunda
  // baholash uchun ajratilgan Flash kvotasi (500/kun) tegilmay qoladi.
  const reply = await ai.complete({
    system: systemPrompt,
    messages,
    maxTokens: 512,
    tier: 'fast',
    restaurantId: req.user.restaurantId
  });

  // Ikkalasini ham saqlaymiz — mentor keyingi safar shularni eslaydi
  await mentorChat.append(r.id, req.user.waiterId, 'user', message.trim());
  await mentorChat.append(r.id, req.user.waiterId, 'assistant', reply);

  res.json({ reply });

  // Kerak bo'lsa eski suhbatlarni qisqacha mazmunga siqamiz.
  // Javob allaqachon yuborilgan — foydalanuvchi buni kutmaydi.
  mentorChat.maybeSummarize(r.id, req.user.waiterId).catch(() => {});
}));

// Suhbat tarixi — oyna ochilganda yuklanadi
router.get('/mentor/chat', guard, asyncHandler(async (req, res) => {
  const messages = await mentorChat.history(req.user.restaurantId, req.user.waiterId);
  res.json({ messages });
}));

// Ofitsiant o'z suhbatini tozalashi mumkin
router.delete('/mentor/chat', guard, asyncHandler(async (req, res) => {
  await mentorChat.clear(req.user.restaurantId, req.user.waiterId);
  res.json({ success: true });
}));

module.exports = router;
