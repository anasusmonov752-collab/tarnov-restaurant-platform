// ── ANKETA: agentlik paneli ──────────────────────────────────
// E'lon uchun havola (manba bilan) va har manba bo'yicha natija.
// Savollar konstruktori — keyingi bosqich; hozircha agentlikning
// umumiy anketasi shablondan yasaladi (survey.ensureDefault).

const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Vacancy = require('../models/Vacancy');
const SurveyResponse = require('../models/SurveyResponse');
const tg = require('../services/telegram');
const survey = require('../services/survey');

const router = express.Router();
const guard = auth(['restaurant']);

// ── Havola ──
// ?vacancyId=  — shu vakansiyaga (to'ldirgach ariza ham tushadi)
// ?channel=    — e'lon qayerga qo'yiladi (ig, tg, olx, qr ...)
router.get('/link', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) return res.status(400).json({ error: 'Bot sozlanmagan' });
  const agencyId = req.user.restaurantId;
  const s = await survey.ensureDefault(agencyId);

  let vacancyId = '';
  if (req.query.vacancyId) {
    const v = await Vacancy.findOne({ agencyId, id: String(req.query.vacancyId) }, 'id').lean();
    if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
    vacancyId = v.id;
  }
  const payload = survey.payloadFor({ code: s.code, vacancyId, channel: String(req.query.channel || '') });
  res.json({
    link: tg.deepLink(await tg.platformUsername(), payload),
    channels: survey.CHANNELS
  });
}));

// ── Natija: manba bo'yicha boshlagan / yuborgan ──
// "Qaysi e'lon ishlayapti" va "anketa qayerda tashlab ketilyapti"
// degan savollarga javob. vacancyId bo'lsa — faqat shu vakansiya.
router.get('/stats', guard, asyncHandler(async (req, res) => {
  const match = { agencyId: req.user.restaurantId };
  if (req.query.vacancyId) match.vacancyId = String(req.query.vacancyId);
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

module.exports = router;
