// ── TO'LOV TIZIMLARI (Payme, Click) — ularning serveri chaqiradi ──
// Kalitlar Render env'da: PAYME_MERCHANT_ID, PAYME_KEY (PAYME_TEST=1 — sinov
// kassasi); CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY. Kalit
// bo'lmasa endpoint rad etadi, Mini App esa qo'lda to'lovni taklif qiladi.
// Payme kabinetida endpoint: <APP_URL>/api/pay/payme;
// Click kabinetida: Prepare <APP_URL>/api/pay/click/prepare, Complete .../complete.

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const payme = require('../services/payme');
const click = require('../services/click');

const router = express.Router();
router.use(express.urlencoded({ extended: false }));   // Click form yuboradi

router.post('/payme', asyncHandler(async (req, res) => {
  res.json(await payme.handle(req.body || {}, req.get('Authorization')));
}));

router.post('/click/prepare', asyncHandler(async (req, res) => {
  res.json(await click.prepare(req.body || {}));
}));
router.post('/click/complete', asyncHandler(async (req, res) => {
  res.json(await click.complete(req.body || {}));
}));

module.exports = router;
