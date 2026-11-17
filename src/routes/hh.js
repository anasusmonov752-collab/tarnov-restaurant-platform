// ── hh.uz API (services/hh.js): ulash, holat, rezyume qidiruvi ──
// Ulash: panelda "hh.uz ulash" -> /api/hh/connect -> hh.ru ruxsat oynasi ->
// /api/hh/callback?code&state -> token agentlik yozuviga -> /talenthub.html?hh=ok
const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const guard = require('../middleware/agency').agencyAuth;
const hh = require('../services/hh');

const router = express.Router();

router.get('/status', guard, asyncHandler(async (req, res) => {
  const t = await hh.tokens(req.user.restaurantId);
  res.json({
    configured: hh.configured(),
    connected: !!t.accessToken,
    employer: t.employer || '', manager: t.manager || '',
    connectedAt: t.connectedAt || null, expiresAt: t.expiresAt || null,
    redirectUri: hh.cfg().redirect           // dev.hh.ru dagi "Redirect Uri" shu bo'lishi kerak
  });
}));

router.get('/connect', guard, (req, res) => {
  if (!hh.configured()) {
    return res.status(400).send('hh kalitlari sozlanmagan: Render\'da HH_CLIENT_ID va HH_CLIENT_SECRET (va APP_URL) kerak.');
  }
  res.redirect(hh.authorizeUrl(req.user.restaurantId));
});

// hh.ru shu yerga qaytaradi. Kirish cookie'si shart emas — kimligi state'da (imzolangan, 15 daq)
router.get('/callback', asyncHandler(async (req, res) => {
  const agencyId = hh.readState(req.query.state);
  if (!agencyId) return res.status(400).send('Havola eskirgan yoki noto\'g\'ri. Panelda "hh.uz ulash" ni qaytadan bosing.');
  if (req.query.error) return res.redirect('/talenthub.html?hh=denied');
  if (!req.query.code) return res.status(400).send('hh kod bermadi');
  try {
    await hh.connect(agencyId, String(req.query.code));
    res.redirect('/talenthub.html?hh=ok');
  } catch (e) {
    console.error('[HH] ulash:', e.message);
    res.status(502).send('hh bilan ulanib bo\'lmadi: ' + e.message);
  }
}));

router.get('/resumes', guard, asyncHandler(async (req, res) => {
  try { res.json(await hh.searchResumes(req.user.restaurantId, req.query)); }
  catch (e) { res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message, code: e.code }); }
}));

router.get('/resumes/:id', guard, asyncHandler(async (req, res) => {
  try { res.json(await hh.resume(req.user.restaurantId, req.params.id)); }
  catch (e) { res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message, code: e.code }); }
}));

// Tanlangan rezyumelarni nomzodlar bazasiga qo'shish (kontaktsiz). body: { ids:[...], tag }
router.post('/import', guard, asyncHandler(async (req, res) => {
  const ids = [...new Set((req.body && req.body.ids) || [])].filter(x => /^[a-f0-9]{20,64}$/i.test(String(x))).slice(0, 50);
  const tag = String((req.body && req.body.tag) || '').slice(0, 60);
  const out = [];
  for (const id of ids) {
    try { out.push(Object.assign({ hh: id }, await hh.importResume(req.user.restaurantId, id, { tag }))); }
    catch (e) { out.push({ hh: id, error: e.message }); }
  }
  res.json({ created: out.filter(x => x.created).length, duplicates: out.filter(x => x.duplicate).length,
    failed: out.filter(x => x.error).length, items: out });
}));

// Lug'atlar (tajriba oraliqlari, hududlar...) — qidiruv formasi uchun
router.get('/dictionaries', guard, asyncHandler(async (req, res) => {
  try { res.json(await hh.request(req.user.restaurantId, '/dictionaries')); }
  catch (e) { res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message }); }
}));

module.exports = router;
