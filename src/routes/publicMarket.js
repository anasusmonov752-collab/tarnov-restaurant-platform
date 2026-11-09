// ── OCHIQ MAOSH TAHLILI (/maosh.html) ────────────────────────
// Login'siz: restoranlar uchun bepul vosita — sotuvda birinchi suhbat
// bahonasi. Faqat lavozim darajasidagi umumiy raqamlar (services/market,
// kamida 5 yozuv). Agentlik — umumiy anketa egasi (bot /start bilan bir xil).
// 10 daqiqa xotirada kesh: sahifani ko'p ochishsa ham bazaga og'irlik yo'q.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const Survey = require('../models/Survey');
const market = require('../services/market');
const tg = require('../services/telegram');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Juda ko\'p so\'rov' } }));

const ROLES = ['ofitsiant', 'oshpaz', 'xostess', 'barmen', 'kassir', 'menejer'];
let cache = null, cachedAt = 0;

router.get('/market', asyncHandler(async (req, res) => {
  if (cache && Date.now() - cachedAt < 10 * 60 * 1000) return res.json(cache);
  const def = await Survey.findOne({ isDefault: true, active: true }, 'agencyId').lean();
  if (!def) return res.json({ roles: [], bot: '' });
  const rows = (await Promise.all(ROLES.map(role => market.stats(def.agencyId, { role })))).filter(Boolean);
  cache = {
    roles: rows.map(s => ({ role: s.role, median: s.median, p25: s.p25, p75: s.p75, n: s.n, active: s.active, offer: s.offers.median })),
    bot: (await tg.platformUsername().catch(() => '')) || 'TalentHubUzBot',
    at: new Date()
  };
  cachedAt = Date.now();
  res.json(cache);
}));

module.exports = router;
