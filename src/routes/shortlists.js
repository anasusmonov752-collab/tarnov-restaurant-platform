// ── MIJOZ TANLOVLARI (agentlik tomoni) ───────────────────────
// Mijoz Mini App'da nomzod tanlaydi -> bu yerda ko'rasiz, nomzod bilan
// gaplashasiz, rozi bo'lsa kontaktni ochasiz.
//
// Mini App route'laridan (/api/ma) ATAYLAB ajratilgan: u yerdan faqat
// anonim ma'lumot chiqadi, bu yerdan esa to'liq kontakt. Chegara
// arxitektura darajasida tursin.

const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Shortlist = require('../models/Shortlist');
const Candidate = require('../models/Candidate');
const Client = require('../models/Client');
const sl = require('../services/shortlist');

const router = express.Router();
const guard = auth(['restaurant']);

// Ro'yxatda nomzod tafsiloti kerak emas — faqat sanoq
function counts(items) {
  const c = { total: items.length, waiting: 0, revealed: 0, rejected: 0 };
  for (const i of items) {
    if (i.state === 'revealed') c.revealed++;
    else if (i.state === 'candidate_no') c.rejected++;
    else if (i.state !== 'refunded') c.waiting++;
  }
  return c;
}

// ── A1. Tanlovlar ro'yxati ──
router.get('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const q = { agencyId };
  if (req.query.status) q.status = req.query.status;
  if (req.query.clientId) q.clientId = req.query.clientId;

  const rows = await Shortlist.find(q).sort({ createdAt: -1 }).limit(limit).lean();

  // Mijoz nomlarini bitta so'rovda olamiz — har tanlov uchun alohida
  // so'rov yuborsak, 50 ta tanlovda 50 ta ortiqcha so'rov bo'lardi.
  const clientIds = [...new Set(rows.map(r => r.clientId))];
  const clients = await Client.find({ agencyId, id: { $in: clientIds } }, 'id name credits').lean();
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));

  res.json(rows.map(r => ({
    id: r.id,
    clientId: r.clientId,
    clientName: (byId[r.clientId] || {}).name || 'Noma\'lum mijoz',
    clientCredits: (byId[r.clientId] || {}).credits ?? null,
    status: r.status,
    counts: counts(r.items),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })));
}));

// ── A2. Bitta tanlov — nomzodlar bilan ──
router.get('/:id', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const row = await Shortlist.findOne({ agencyId, id: req.params.id }).lean();
  if (!row) return res.status(404).json({ error: 'Tanlov topilmadi' });

  const client = await Client.findOne({ agencyId, id: row.clientId }, 'id name credits tgChatId status').lean();

  const ids = row.items.map(i => i.candidateId);
  const cands = await Candidate.find(
    { restaurantId: agencyId, id: { $in: ids } },
    '-fileData -rawText -photo -tgInviteToken'
  ).lean();
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));

  // Tartib mijoz tanlagandek qolsin
  const items = row.items.map(i => {
    const c = byId[i.candidateId] || null;
    return {
      candidateId: i.candidateId,
      state: i.state,
      note: i.note,
      revealedAt: i.revealedAt,
      refundedAt: i.refundedAt,
      // Kontakt FAQAT ochilgandan keyin mijozga ketadi, lekin SIZ doim
      // ko'rasiz — nomzod bilan gaplashishingiz kerak.
      candidate: c && {
        id: c.id, publicCode: c.publicCode, fullName: c.fullName,
        phone: c.phone, email: c.email, role: c.role,
        desiredPosition: c.desiredPosition, experienceYears: c.experienceYears,
        age: c.age, location: c.location, jobStatus: c.jobStatus,
        hasPhoto: !!c.hasPhoto, tgState: c.tgState, fitScore: c.fitScore
      }
    };
  });

  res.json({
    id: row.id, status: row.status, vacancyId: row.vacancyId,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    client: client || null,
    counts: counts(row.items),
    items
  });
}));

// ── A3. Nomzod holatini o'zgartirish ──
router.patch('/:id/items/:candidateId', guard, asyncHandler(async (req, res) => {
  const { state, note } = req.body || {};
  try {
    const row = await sl.setItemState({
      agencyId: req.user.restaurantId,
      shortlistId: req.params.id,
      candidateId: req.params.candidateId,
      state: String(state || ''),
      note: String(note || '')
    });
    res.json({ ok: true, counts: counts(row.items) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ── A4. Kontaktni ochish (-1 kredit) ──
router.post('/:id/reveal/:candidateId', guard, asyncHandler(async (req, res) => {
  try {
    const r = await sl.reveal({
      agencyId: req.user.restaurantId,
      shortlistId: req.params.id,
      candidateId: req.params.candidateId
    });
    if (r.already) return res.json({ ok: true, already: true, message: 'Kontakt allaqachon ochilgan' });
    res.json({ ok: true, already: false, balance: r.balance, counts: counts(r.shortlist.items) });
  } catch (e) {
    // Kredit yetmasligi — mijozning muammosi, server xatosi emas
    const code = /[Kk]redit yetarli emas/.test(e.message) ? 402 : 400;
    res.status(code).json({ error: e.message });
  }
}));

module.exports = router;
