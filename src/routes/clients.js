// ── MIJOZ BOSHQARUVI (agentlik tomoni) ───────────────────────
// Siz mijoz restoranlarni shu yerdan yaratasiz, tasdiqlaysiz va
// kredit berasiz. Mijozning o'zi bu endpointlarni ko'rmaydi — u
// faqat bot va Mini App bilan ishlaydi.

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Client = require('../models/Client');
const Shortlist = require('../models/Shortlist');
const tg = require('../services/telegram');
const relay = require('../services/botRelay');
const credits = require('../services/credits');

const router = express.Router();
const guard = auth(['restaurant']);

const VALID_STATUS = ['pending', 'active', 'blocked'];

// tgLinkToken javobda qaytmasligi kerak — kim uni bilsa, o'sha
// mijoz sifatida botga ulanib oladi.
function publicClient(c) {
  return {
    id: c.id, name: c.name, contactName: c.contactName, phone: c.phone,
    note: c.note, status: c.status, credits: c.credits,
    linked: !!c.tgChatId, tgUsername: c.tgUsername,
    createdAt: c.createdAt, lastSeenAt: c.lastSeenAt
  };
}

router.get('/', guard, asyncHandler(async (req, res) => {
  const list = await Client.find({ agencyId: req.user.restaurantId })
    .sort({ createdAt: -1 }).limit(500).lean();

  // Har mijoz bo'yicha ochiq tanlovlar soni — paneldagi ro'yxat uchun
  const open = await Shortlist.aggregate([
    { $match: { agencyId: req.user.restaurantId, status: { $ne: 'done' } } },
    { $group: { _id: '$clientId', n: { $sum: 1 } } }
  ]);
  const openMap = {};
  for (const r of open) openMap[r._id] = r.n;

  res.json(list.map(c => Object.assign(publicClient(c), { openShortlists: openMap[c.id] || 0 })));
}));

router.post('/', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Mijoz nomi kiritilmadi' });

  const c = await Client.create({
    id: uuidv4(),
    agencyId: req.user.restaurantId,
    name,
    contactName: String(b.contactName || '').slice(0, 80),
    phone:       String(b.phone || '').slice(0, 40),
    note:        String(b.note || '').slice(0, 500),
    status: 'pending'
  });

  // Boshlang'ich kredit (sinov uchun) — ko'rsatilgan bo'lsa
  const start = parseInt(b.startCredits, 10);
  if (Number.isFinite(start) && start > 0) {
    await credits.bonus({ agencyId: req.user.restaurantId, clientId: c.id, amount: start, note: 'Boshlang\'ich' });
    c.credits = start;
  }
  res.json(publicClient(c));
}));

router.patch('/:id', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = await Client.findOne({ agencyId: req.user.restaurantId, id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Mijoz topilmadi' });

  if (b.name !== undefined)        c.name = String(b.name).trim().slice(0, 120);
  if (b.contactName !== undefined) c.contactName = String(b.contactName).slice(0, 80);
  if (b.phone !== undefined)       c.phone = String(b.phone).slice(0, 40);
  if (b.note !== undefined)        c.note = String(b.note).slice(0, 500);
  if (b.status !== undefined && VALID_STATUS.includes(b.status)) c.status = b.status;
  await c.save();
  res.json(publicClient(c));
}));

// Botga ulash havolasi. Mijoz menejeri shuni bosadi.
router.get('/:id/link', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) return res.status(400).json({ error: 'Bot sozlanmagan' });

  const c = await Client.findOne({ agencyId: req.user.restaurantId, id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Mijoz topilmadi' });

  c.tgLinkToken = relay.makeToken();
  await c.save();
  res.json({ link: tg.deepLink(await tg.platformUsername(), 'client_' + c.tgLinkToken) });
}));

// Kredit qo'shish / ayirish (qo'lda — to'lov tizimi hali yo'q)
router.post('/:id/credits', guard, asyncHandler(async (req, res) => {
  const amount = parseInt((req.body || {}).amount, 10);
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'Miqdor noto\'g\'ri' });
  }
  try {
    const r = await credits.move({
      agencyId: req.user.restaurantId,
      clientId: req.params.id,
      delta: amount,
      reason: amount > 0 ? 'purchase' : 'refund',
      note: String((req.body || {}).note || '').slice(0, 200)
    });
    res.json({ ok: true, balance: r.balance });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

router.get('/:id/credits', guard, asyncHandler(async (req, res) => {
  const rows = await credits.history(req.user.restaurantId, req.params.id);
  res.json(rows.map(r => ({
    delta: r.delta, reason: r.reason, balanceAfter: r.balanceAfter,
    note: r.note, createdAt: r.createdAt
  })));
}));

router.post('/:id/unlink', guard, asyncHandler(async (req, res) => {
  const c = await Client.findOne({ agencyId: req.user.restaurantId, id: req.params.id });
  if (!c) return res.status(404).json({ error: 'Mijoz topilmadi' });
  c.tgChatId = ''; c.tgUsername = ''; c.tgLinkToken = '';
  await c.save();
  res.json({ ok: true });
}));

module.exports = router;
