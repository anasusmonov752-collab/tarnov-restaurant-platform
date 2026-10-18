// ── SUHBATLAR (AGENTLIK TOMONI) ──────────────────────────────
// Siz BARCHA suhbatlarni ko'rasiz:
//   'ca' — mijoz sizga yozgan (javob berishingiz kerak)
//   'cc' — mijoz va nomzod o'rtasida (nazorat: reklama, nomaqbul
//          kontent, kelishuvlar)
//
// Nomzod<->agentlik yozishmasi BU YERDA EMAS — u Telegramda,
// nomzodlar bazasidagi chat oynasida (BotMessage). Ikki marta
// ko'rsatmaymiz.

const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { publicBase } = require('../utils/publicBase');
const ChatThread = require('../models/ChatThread');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const chat = require('../services/chat');

const router = express.Router();
const guard = auth(['restaurant']);

// ── Barcha suhbatlar ──
router.get('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;

  // Eski ochilgan kontaktlarga ham suhbat bo'lsin. Mijoz va nomzod
  // inboxlarida bu avtomatik, lekin siz ularni ochmaysiz — shuning
  // uchun bu yerda ham chaqiramiz, aks holda ro'yxat bo'sh ko'rinadi.
  await chat.backfill({ agencyId });

  const q = { agencyId };
  if (req.query.kind === 'cc' || req.query.kind === 'ca') q.kind = req.query.kind;
  // Faqat javobsiz qolganlar — ish ro'yxati sifatida
  if (req.query.unread === '1') q.unreadAgency = { $gt: 0 };

  const rows = await ChatThread.find(q).sort({ lastMsgAt: -1 }).limit(200).lean();
  if (!rows.length) return res.json([]);

  const [cls, cds] = await Promise.all([
    Client.find({ agencyId, id: { $in: [...new Set(rows.map(r => r.clientId))] } },
      'id name').lean(),
    Candidate.find({ restaurantId: agencyId,
      id: { $in: [...new Set(rows.filter(r => r.candidateId).map(r => r.candidateId))] } },
      'id publicCode fullName desiredPosition').lean()
  ]);
  const cl = Object.fromEntries(cls.map(c => [c.id, c]));
  const cd = Object.fromEntries(cds.map(c => [c.id, c]));

  res.json(rows.map(t => {
    const c = cl[t.clientId] || {};
    const k = cd[t.candidateId] || {};
    return {
      id: t.id, kind: t.kind, state: t.state,
      clientName: c.name || 'Mijoz',
      // Siz ismni ko'rasiz — anonimlik mijoz uchun, siz uchun emas
      candidateName: t.candidateId ? (k.fullName || k.publicCode || 'Nomzod') : '',
      candidateCode: k.publicCode || '',
      position: k.desiredPosition || '',
      lastMsgAt: t.lastMsgAt, lastMsgText: t.lastMsgText, lastMsgFrom: t.lastMsgFrom,
      unread: t.unreadAgency
    };
  }));
}));

// ── Bitta suhbat ──
router.get('/:id/messages', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const th = await ChatThread.findOne({ agencyId, id: req.params.id }).lean();
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  const msgs = await chat.messages({ agencyId, threadId: th.id });
  await chat.markRead({ agencyId, threadId: th.id, side: 'agency' });
  res.json({ id: th.id, kind: th.kind, state: th.state, messages: msgs });
}));

// ── Yozish ──
// Siz 'cc' suhbatga ham yoza olasiz: muzokara to'xtab qolsa
// o'rtaga tushish kerak bo'ladi.
router.post('/:id/messages', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const th = await ChatThread.findOne({ agencyId, id: req.params.id }).lean();
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  try {
    const m = await chat.post({
      agencyId, threadId: th.id, from: 'agency',
      text: (req.body || {}).text, appBase: publicBase(req)
    });
    res.json({ ok: true, id: m.id, createdAt: m.createdAt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

module.exports = router;
