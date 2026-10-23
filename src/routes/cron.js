// ── REJALI VAZIFALAR (tashqi chaqiruv) ──────────────────────
// Render bepul tarifida o'z cron'imiz ishonchsiz (server uxlab qoladi),
// shuning uchun GitHub Actions soatda bir marta shu yerga POST qiladi.
// Himoya: X-Cron-Secret sarlavhasi Render'dagi CRON_SECRET bilan bir xil
// bo'lishi kerak. Sozlanmagan bo'lsa — 503 (hech narsa qilinmaydi).

const express = require('express');
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/errorHandler');
const reminders = require('../services/reminders');
const { publicBase } = require('../utils/publicBase');

const router = express.Router();

function secretOk(req) {
  const want = String(process.env.CRON_SECRET || '');
  const got = String(req.get('X-Cron-Secret') || '');
  if (want.length < 16 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Chala anketa eslatmasi. {dry:true} — kimga ketishini ko'rsatadi, yubormaydi.
router.post('/reminders', asyncHandler(async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET sozlanmagan' });
  if (!secretOk(req)) return res.status(401).json({ error: 'Ruxsat yo\'q' });
  const dry = !!(req.body && req.body.dry);
  const r = await reminders.run({ appBase: publicBase(req), dry });
  // Tariflar: muddati tugaganlar (kreditlar yonadi) va 3 kun qolganlarga eslatma — kunduzi
  if (!dry && !r.quiet) {
    try { r.billing = await require('../services/billing').tick(); }
    catch (e) { r.billing = { error: e.message }; }
  }
  res.json(r);
}));

module.exports = router;
