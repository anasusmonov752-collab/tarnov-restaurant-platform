// ── AGENTLIK: "Bugun" sahifasi va yon menyu sanoqlari ────────
// Panelga kirganda birinchi savol — "nima meni kutyapti?". Ilgari bunga
// javob olish uchun to'rt sahifani ochish kerak edi. Bu endpoint
// hammasini bitta so'rovda sanaydi (talenthub.html va th-shell.js).

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const guard = require('../middleware/agency').agencyAuth;
const Shortlist = require('../models/Shortlist');
const Application = require('../models/Application');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const ChatThread = require('../models/ChatThread');
const contactLog = require('../services/contactLog');

const router = express.Router();

// Agentlik qo'lidagi holatlar — shu yerda turgan nomzod sizni kutyapti
const WAITING = ['selected', 'contacting', 'candidate_ok'];

router.get('/today', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now - 7 * 864e5);

  const [shortlists, appsNew, clients, candTotal, candWeek, unread, anketaUnseen, baseWeek, appsUnseen] = await Promise.all([
    Shortlist.find({ agencyId, status: { $ne: 'done' } }, 'id clientId items createdAt updatedAt summary').lean(),
    Application.countDocuments({ agencyId, state: 'new', isTest: { $ne: true } }),
    Client.find({ agencyId }, 'id name credits status isTest').lean(),
    // Sinov yozuvlari (admin test rejimi) sanoqlarga kirmaydi
    Candidate.countDocuments({ restaurantId: agencyId, isTest: { $ne: true } }),
    Candidate.countDocuments({ restaurantId: agencyId, createdAt: { $gte: weekAgo }, isTest: { $ne: true } }),
    ChatThread.aggregate([{ $match: { agencyId, unreadAgency: { $gt: 0 } } },
                          { $group: { _id: null, n: { $sum: '$unreadAgency' } } }]),
    // Yon menyu: "Anketadan" — ko'rilmaganlar, "hh.uz bazasi" — shu hafta qo'shilgan
    Candidate.countDocuments(Object.assign({ restaurantId: agencyId, source: 'anketa', isTest: { $ne: true } }, contactLog.UNSEEN)),
    Candidate.countDocuments({ restaurantId: agencyId, source: { $ne: 'anketa' }, createdAt: { $gte: weekAgo }, isTest: { $ne: true } }),
    // "Arizalar" — agentlik hali ochmagan va qaror qilinmagan arizalar
    Application.countDocuments({ agencyId, agencySeenAt: null, state: { $in: ['new', 'seen'] }, isTest: { $ne: true } })
  ]);
  // Yon menyu "To'lovlar" — tasdiq kutayotgan tarif so'rovlari
  const ordersPending = await require('../models/Order').countDocuments({ agencyId, status: 'pending', provider: { $in: ['manual', 'invoice'] } });

  // Shu oy ochilgan va ishga olingan — barcha tanlovlardan (yopilganlari ham);
  // sinov mijozining tanlovlari hisobga olinmaydi
  const testClientIds = clients.filter(c => c.isTest).map(c => c.id);
  const month = await Shortlist.aggregate([
    { $match: { agencyId, clientId: { $nin: testClientIds } } }, { $unwind: '$items' },
    { $match: { 'items.revealedAt': { $gte: monthStart } } },
    { $group: { _id: null, revealed: { $sum: 1 },
                hired: { $sum: { $cond: [{ $eq: ['$items.state', 'hired'] }, 1, 0] } } } }
  ]);

  const byClient = Object.fromEntries(clients.map(c => [c.id, c]));
  const queue = shortlists.map(s => {
    const waiting = (s.items || []).filter(i => WAITING.includes(i.state));
    return {
      id: s.id, clientId: s.clientId, clientName: (byClient[s.clientId] || {}).name || 'Noma\'lum mijoz',
      summary: s.summary || '', total: (s.items || []).length, waiting: waiting.length,
      contacting: waiting.filter(i => i.state === 'contacting').length,
      since: s.createdAt, updatedAt: s.updatedAt
    };
  }).filter(q => q.waiting > 0).sort((a, b) => new Date(a.since) - new Date(b.since));

  const active = clients.filter(c => c.status === 'active' && !c.isTest);
  res.json({
    appsNew,
    waitingShortlists: queue.length,
    oldestWaitingDays: queue.length ? Math.floor((now - new Date(queue[0].since)) / 864e5) : 0,
    revealedMonth: (month[0] || {}).revealed || 0,
    hiredMonth: (month[0] || {}).hired || 0,
    clientCredits: active.reduce((s, c) => s + (c.credits || 0), 0),
    activeClients: active.length,
    candidates: candTotal, candidatesWeek: candWeek, anketaUnseen, baseWeek, appsUnseen, ordersPending,
    unreadChats: (unread[0] || {}).n || 0,
    queue: queue.slice(0, 20)
  });
}));

module.exports = router;
