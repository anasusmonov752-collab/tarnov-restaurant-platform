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
const vac = require('../services/vacancy');

const router = express.Router();
const guard = auth(['restaurant']);

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

  // Har vakansiyaga nechta tanlov bog'langan
  const counts = await Shortlist.aggregate([
    { $match: { agencyId, vacancyId: { $in: rows.map(r => r.id) } } },
    { $group: { _id: '$vacancyId', n: { $sum: 1 } } }
  ]);
  const cMap = Object.fromEntries(counts.map(c => [c._id, c.n]));

  res.json(rows.map(v => vac.full(v, {
    clientName: (byId[v.clientId] || {}).name || 'Noma\'lum',
    clientLocation: (byId[v.clientId] || {}).location || '',
    shortlists: cMap[v.id] || 0
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
