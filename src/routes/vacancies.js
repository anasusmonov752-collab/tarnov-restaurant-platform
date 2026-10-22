// ── VAKANSIYALAR (agentlik tomoni) ───────────────────────────
// Siz barcha mijozlarning vakansiyalarini ko'rasiz: kim nima qidiryapti,
// qaysi biri eskirgan, qaysi biriga nomzod kerak.
//
// Mijoz o'z vakansiyasini Mini App'dan boshqaradi (/api/ma/vacancies).

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Vacancy = require('../models/Vacancy');
const Client = require('../models/Client');
const Shortlist = require('../models/Shortlist');
const Application = require('../models/Application');
const Candidate = require('../models/Candidate');
const vac = require('../services/vacancy');

const router = express.Router();
// Faqat TalentHub agentligi (middleware/agency — o'tish rejimi bilan)
const guard = require('../middleware/agency').agencyAuth;

// ── Ro'yxat ──
router.get('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const q = { agencyId };
  if (req.query.status) q.status = req.query.status;
  if (req.query.clientId) q.clientId = req.query.clientId;

  const rows = await Vacancy.find(q).sort({ createdAt: -1 }).limit(200).lean();
  if (!rows.length) return res.json([]);

  // Mijoz nomlari bitta so'rovda
  const ids = [...new Set(rows.map(r => r.clientId))];
  const clients = await Client.find({ agencyId, id: { $in: ids } }, 'id name location').lean();
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));

  // Tanlov va ariza sanog'i — bitta so'rovdan ikkitasi
  const vids = rows.map(r => r.id);
  const [slRows, appRows] = await Promise.all([
    Shortlist.aggregate([
      { $match: { agencyId, vacancyId: { $in: vids } } },
      { $group: { _id: '$vacancyId', n: { $sum: 1 } } }
    ]),
    Application.aggregate([
      { $match: { agencyId, vacancyId: { $in: vids } } },
      { $group: { _id: { v: '$vacancyId', s: '$state' }, n: { $sum: 1 } } }
    ])
  ]);
  const slMap = Object.fromEntries(slRows.map(c => [c._id, c.n]));

  // Ko'rilmagan ariza alohida — siz shuni birinchi ko'rishingiz kerak
  const appMap = {};
  for (const r of appRows) {
    const v = r._id.v;
    appMap[v] = appMap[v] || { total: 0, fresh: 0 };
    appMap[v].total += r.n;
    if (r._id.s === 'new') appMap[v].fresh += r.n;
  }

  res.json(rows.map(v => vac.full(v, {
    clientName: (byId[v.clientId] || {}).name || 'Noma\'lum',
    clientLocation: (byId[v.clientId] || {}).location || '',
    shortlists: slMap[v.id] || 0,
    apps: (appMap[v.id] || {}).total || 0,
    appsNew: (appMap[v.id] || {}).fresh || 0
  })));
}));

// ── Bitta vakansiya ──
router.get('/:id', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const v = await Vacancy.findOne({ agencyId, id: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const client = await Client.findOne({ agencyId, id: v.clientId },
    'id name contactName phone location address about credits').lean();
  res.json(vac.full(v, { client: client || null }));
}));

// ── Vakansiyaga kelgan arizalar ──
// Mijoz anonim ko'radi, SIZ to'liq ko'rasiz: nomzod bilan gaplashish
// sizning ishingiz.
router.get('/:id/applications', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const v = await Vacancy.findOne({ agencyId, id: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const apps = await Application.find({ agencyId, vacancyId: v.id })
    .sort({ createdAt: -1 }).limit(200).lean();
  if (!apps.length) return res.json({ vacancy: vac.full(v), items: [] });

  const cands = await Candidate.find(
    { restaurantId: agencyId, id: { $in: apps.map(a => a.candidateId) } },
    'id publicCode fullName phone email role desiredPosition experienceYears age location jobStatus tgState source'
  ).lean();
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));

  res.json({
    vacancy: vac.full(v),
    items: apps.map(a => ({
      id: a.id, state: a.state, message: a.message, reason: a.reason,
      createdAt: a.createdAt, shortlistId: a.shortlistId,
      candidate: byId[a.candidateId] || null
    }))
  });
}));

// ── Arizaga agentlik qarori: tanlovga qo'shish yoki rad etish ──
// Ilgari arizalar oynasi faqat ko'rish uchun edi (2026-10-20 audit).
// Qoida Mini App'dagi bilan bir xil (routes/miniapp.js applications/:action):
// tanlovga — mijozning shu vakansiyadagi ochiq tanloviga ('selected'),
// bo'lmasa yangisi; qaror qabul qilingan arizaga tegilmaydi.
router.post('/:id/applications/:appId/:action', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const act = req.params.action;
  if (!['shortlist', 'reject'].includes(act)) return res.status(400).json({ error: 'Amal noto\'g\'ri' });
  const a = await Application.findOne({ agencyId, vacancyId: req.params.id, id: req.params.appId });
  if (!a) return res.status(404).json({ error: 'Ariza topilmadi' });
  if (a.state === 'shortlisted' || a.state === 'rejected') return res.status(400).json({ error: 'Bu ariza bo\'yicha qaror qabul qilingan' });

  if (act === 'reject') {
    a.state = 'rejected'; a.reason = 'agency'; a.decidedAt = new Date();
    await a.save();
    return res.json({ ok: true, state: a.state });
  }

  const v = await Vacancy.findOne({ agencyId, id: a.vacancyId }).lean();
  let sl = await Shortlist.findOne({ agencyId, clientId: a.clientId, vacancyId: a.vacancyId, status: { $ne: 'done' } });
  if (!sl) {
    sl = await Shortlist.create({ id: uuidv4(), agencyId, clientId: a.clientId, vacancyId: a.vacancyId,
      summary: (v && v.title) || 'Arizalar', items: [], status: 'new' });
  }
  if (!sl.items.some(i => i.candidateId === a.candidateId)) {
    sl.items.push({ candidateId: a.candidateId, state: 'selected' });
    sl.updatedAt = new Date();
    await sl.save();
  }
  a.state = 'shortlisted'; a.shortlistId = sl.id; a.decidedAt = new Date();
  await a.save();
  res.json({ ok: true, state: a.state, shortlistId: sl.id });
}));

// ── Yaratish (mijoz nomidan) ──
// Mijoz o'zi ham yarata oladi, lekin telefonda aytsa siz kiritasiz.
router.post('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const b = req.body || {};
  const clientId = String(b.clientId || '');

  const client = await Client.findOne({ agencyId, id: clientId });
  if (!client) return res.status(400).json({ error: 'Mijoz topilmadi' });

  const data = vac.clean(b);
  if (!data.title) return res.status(400).json({ error: 'Vakansiya nomi kiritilmadi' });

  const v = await Vacancy.create(Object.assign({
    id: uuidv4(), agencyId, clientId,
    location: data.location || client.location || ''
  }, data));
  res.json(vac.full(v));
}));

// ── Tahrirlash ──
router.patch('/:id', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const v = await Vacancy.findOne({ agencyId, id: req.params.id });
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  Object.assign(v, vac.clean(req.body || {}, v.toObject()));
  v.updatedAt = new Date();
  await v.save();
  res.json(vac.full(v));
}));

// ── Tasdiqlash ──
// "Bu o'rin hali ochiqmi?" — soxta e'lonlarga qarshi. Mijoz ham,
// siz ham bosa olasiz.
router.post('/:id/confirm', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const v = await Vacancy.findOneAndUpdate(
    { agencyId, id: req.params.id },
    { $set: { confirmedAt: new Date(), updatedAt: new Date() } },
    { new: true }
  );
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
  res.json(vac.full(v));
}));

module.exports = router;
