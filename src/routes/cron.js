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
  // Bir vaqtda bittasi: curl --retry 120 s dan uzoq ishlagan chaqiruvni qayta yuborsa,
  // ikkinchisi ishlamaydi (eslatma va tarif xabarlari takrorlanmasin)
  if (!dry && busySince && Date.now() - busySince < 15 * 60e3) return res.json({ busy: true });
  if (!dry) busySince = Date.now();
  try { res.json(await runCron(req, dry)); }
  finally { if (!dry) busySince = 0; }
}));

let busySince = 0;
async function runCron(req, dry) {
  const r = await reminders.run({ appBase: publicBase(req), dry });
  // Suhbat eslatmalari — asosan server ichidagi taymer (server.js), bu zaxira
  if (!dry) {
    try { r.interviews = await require('../services/interviews').tick(new Date(), { appBase: publicBase(req) }); }
    catch (e) { r.interviews = { error: e.message }; }
  }
  // Tariflar: muddati tugaganlar (kreditlar yonadi) va 3 kun qolganlarga eslatma — kunduzi
  if (!dry && !r.quiet) {
    try { r.billing = await require('../services/billing').tick(); }
    catch (e) { r.billing = { error: e.message }; }
  }
  return r;
}

module.exports = router;
