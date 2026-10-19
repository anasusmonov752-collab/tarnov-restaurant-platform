// ── ANKETA: agentlik paneli ──────────────────────────────────
// Konstruktor (anketalar.html), e'lon havolasi (manba bilan) va natija.
// Umumiy anketa doim bor (survey.ensureDefault) — lavozimni nomzod
// tanlaydi; lavozim anketalari ixtiyoriy (vakansiya havolasi ularni
// lavozim bo'yicha o'zi tanlaydi — survey.surveyForVacancy).

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Survey = require('../models/Survey');
const Vacancy = require('../models/Vacancy');
const SurveyResponse = require('../models/SurveyResponse');
const tg = require('../services/telegram');
const survey = require('../services/survey');
const { ROLES, isValidRole } = require('../data/roles');

const router = express.Router();
const guard = auth(['restaurant']);

const view = s => ({
  id: s.id, code: s.code, title: s.title, role: s.role, active: s.active, isDefault: !!s.isDefault,
  questions: s.questions, updatedAt: s.updatedAt
});
const str = (x, max) => String(x == null ? '' : x).trim().slice(0, max);

// ── Ro'yxat + konstruktor ma'lumotnomasi ──
router.get('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  await survey.ensureDefault(agencyId);
  const [rows, counts] = await Promise.all([
    // Lavozimsiz va umumiy bo'lmagan — o'chirilgan takror nusxa (ensureDefault), ko'rsatilmaydi
    Survey.find({ agencyId, $or: [{ isDefault: true }, { role: { $ne: '' } }] }).sort({ isDefault: -1, createdAt: 1 }).lean(),
    SurveyResponse.aggregate([
      { $match: { agencyId } },
      { $group: { _id: '$surveyId', started: { $sum: 1 },
                  done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } }
    ])
  ]);
  const by = Object.fromEntries(counts.map(c => [c._id, c]));
  res.json({
    surveys: rows.map(s => Object.assign(view(s), {
      questionCount: (s.questions || []).length,
      started: (by[s.id] || {}).started || 0,
      done: (by[s.id] || {}).done || 0
    })),
    // Standart savollar qoidalari bilan (qulf, kalitlar, qaysi maydon)
    catalog: survey.catalogInfo(),
    customTypes: survey.CUSTOM_TYPES,
    roles: ROLES.map(r => ({ key: r.key, label: r.label }))
  });
}));

// ── Havola ──  (/:id dan OLDIN — aks holda 'link' id deb o'qiladi)
// ?vacancyId=  — shu vakansiyaga (to'ldirgach ariza ham tushadi; anketa
//                lavozim bo'yicha o'zi tanlanadi)
// ?surveyId=   — shu anketa (umumiy havola)
// ?channel=    — e'lon qayerga qo'yiladi (ig, tg, olx, qr ...)
router.get('/link', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) return res.status(400).json({ error: 'Bot sozlanmagan' });
  const agencyId = req.user.restaurantId;

  let vacancyId = '', s;
  if (req.query.vacancyId) {
    const v = await Vacancy.findOne({ agencyId, id: String(req.query.vacancyId) }).lean();
    if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
    vacancyId = v.id;
    s = await survey.surveyForVacancy(v);
  } else if (req.query.surveyId) {
    s = await Survey.findOne({ agencyId, id: String(req.query.surveyId), active: true }).lean();
    if (!s) return res.status(404).json({ error: 'Anketa topilmadi yoki o\'chirilgan' });
  } else {
    s = await survey.ensureDefault(agencyId);
  }
  const payload = survey.payloadFor({ code: s.code, vacancyId, channel: String(req.query.channel || '') });
  res.json({
    link: tg.deepLink(await tg.platformUsername(), payload),
    survey: { id: s.id, title: s.title, role: s.role, isDefault: !!s.isDefault },
    // 'bot' — e'lon joyi emas (havolasiz /start), tanlovda ko'rsatilmaydi
    channels: Object.fromEntries(Object.entries(survey.CHANNELS).filter(([k]) => k !== 'bot'))
  });
}));

// ── Natija: manba bo'yicha boshlagan / yuborgan ──
// "Qaysi e'lon ishlayapti" va "anketa qayerda tashlab ketilyapti".
// vacancyId yoki surveyId bo'lsa — faqat shu.
router.get('/stats', guard, asyncHandler(async (req, res) => {
  const match = { agencyId: req.user.restaurantId };
  if (req.query.vacancyId) match.vacancyId = String(req.query.vacancyId);
  if (req.query.surveyId) match.surveyId = String(req.query.surveyId);
  const [byChannel, dropAt] = await Promise.all([
    SurveyResponse.aggregate([
      { $match: match },
      { $group: { _id: '$channel', started: { $sum: 1 },
                  done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
      { $sort: { started: -1 } }
    ]),
    // Tugatilmaganlar oxirgi qaysi savolga javob bergan
    SurveyResponse.aggregate([
      { $match: Object.assign({ status: 'started' }, match) },
      { $group: { _id: '$step', n: { $sum: 1 } } },
      { $sort: { n: -1 } }
    ])
  ]);
  res.json({
    channels: byChannel.map(x => ({ channel: x._id || '', label: survey.CHANNELS[x._id] || 'Belgisiz',
                                    started: x.started, done: x.done })),
    dropAt: dropAt.map(x => ({ step: x._id || '(boshlamagan)', n: x.n }))
  });
}));

router.get('/:id', guard, asyncHandler(async (req, res) => {
  const s = await Survey.findOne({ agencyId: req.user.restaurantId, id: req.params.id }).lean();
  if (!s) return res.status(404).json({ error: 'Anketa topilmadi' });
  res.json(view(s));
}));

// Bitta lavozimga bitta faol anketa — aks holda vakansiya havolasi
// qaysi birini ochishini bilmaydi
async function roleTaken(agencyId, role, exceptId) {
  if (!role) return false;
  return Survey.exists({ agencyId, role, active: true, isDefault: false, id: { $ne: exceptId || '' } });
}

// ── Yangi lavozim anketasi ──
// Savollar umumiy anketadan nusxa olinadi (siz u yerda o'zgartirgan
// matnlar bilan) — noldan emas.
router.post('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const b = req.body || {};
  const role = isValidRole(b.role) ? b.role : '';
  if (!role) return res.status(400).json({ error: 'Lavozimni tanlang' });
  if (await roleTaken(agencyId, role)) return res.status(400).json({ error: 'Bu lavozim uchun anketa allaqachon bor' });

  const base = await survey.ensureDefault(agencyId);
  const label = (ROLES.find(r => r.key === role) || {}).label || role;
  for (let i = 0; i < 5; i++) {
    try {
      const s = await Survey.create({
        id: uuidv4(), agencyId, code: survey.makeCode(), role, active: true, isDefault: false,
        title: { uz: str(b.title && b.title.uz, 80) || `${label} anketasi`,
                 ru: str(b.title && b.title.ru, 80) || '' },
        questions: (base.questions || []).map(q => (q.toObject ? q.toObject() : q))
      });
      return res.json(view(s));
    } catch (e) { if (e.code !== 11000) throw e; }      // kod band — qayta
  }
  res.status(500).json({ error: 'Anketa kodi yaratilmadi' });
}));

// ── Saqlash ──
// Savollar survey.cleanQuestions'dan o'tadi: standart savollar turi va
// (kodda ma'noli) variant kalitlari o'zgarmaydi, ism/telefon/rozilik qoladi.
router.put('/:id', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const s = await Survey.findOne({ agencyId, id: req.params.id });
  if (!s) return res.status(404).json({ error: 'Anketa topilmadi' });
  const b = req.body || {};

  if (b.title) s.title = { uz: str(b.title.uz, 80) || s.title.uz, ru: str(b.title.ru, 80) };
  if (b.questions !== undefined) {
    try { s.questions = survey.cleanQuestions(b.questions); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  // Umumiy anketa doim faol va lavozimsiz (nomzod o'zi tanlaydi)
  if (!s.isDefault) {
    if (b.role !== undefined) {
      if (!isValidRole(b.role)) return res.status(400).json({ error: 'Lavozimni tanlang' });
      s.role = b.role;
    }
    if (b.active !== undefined) s.active = !!b.active;
    if (s.active && await roleTaken(agencyId, s.role, s.id)) {
      return res.status(400).json({ error: 'Bu lavozim uchun boshqa faol anketa bor' });
    }
  }
  s.updatedAt = new Date();
  s.markModified('questions');
  await s.save();
  res.json(view(s));
}));

module.exports = router;
