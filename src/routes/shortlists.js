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
const Vacancy = require('../models/Vacancy');
const { v4: uuidv4 } = require('uuid');
const tg = require('../services/telegram');
const I18N = require('../../public/js/th-i18n');
const sl = require('../services/shortlist');
const pipeline = require('../data/pipeline');
const { publicBase } = require('../utils/publicBase');

const router = express.Router();
// Faqat TalentHub agentligi (middleware/agency — o'tish rejimi bilan)
const guard = require('../middleware/agency').agencyAuth;

// Holat va sabab ro'yxatlari — frontend ularni nusxalab yurmasin
router.get('/meta', guard, (req, res) => res.json({
  states: pipeline.STATES,
  agencyStates: pipeline.AGENCY_STATES,
  clientStates: pipeline.CLIENT_STATES,
  candReasons: pipeline.CAND_REASONS,
  clientReasons: pipeline.CLIENT_REASONS,
  refundReasons: pipeline.REFUND_REASONS,
  refundableStates: pipeline.REFUNDABLE_STATES
}));

// Ro'yxatda nomzod tafsiloti kerak emas — faqat sanoq.
// hired alohida sanaladi: bu yakuniy natija va asosiy ko'rsatkich.
function counts(items) {
  const c = { total: items.length, waiting: 0, revealed: 0, interview: 0, hired: 0, rejected: 0 };
  for (const i of items) {
    switch (i.state) {
      case 'hired':        c.hired++; break;
      case 'interview':    c.interview++; break;
      case 'revealed':     c.revealed++; break;
      case 'candidate_no':
      case 'not_fit':      c.rejected++; break;
      case 'refunded':     break;
      default:             c.waiting++;
    }
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

// ── A1b. Tanlovni agentlik yaratadi (mijozga taklif) ──
// Mijoz telefonda "3 ta ofitsiant yuboring" deydi — ilgari buni faqat u
// o'zi Mini App'da qila olardi (2026-10-20 audit). Nomzodlar 'selected'
// bilan tushadi: keyingi oqim odatdagidek (bog'lanish -> rozi -> ochish),
// mijoz kabinetida anonim ko'radi. Mijozga Telegramda xabar boradi.
router.post('/', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const b = req.body || {};
  const client = await Client.findOne({ agencyId, id: String(b.clientId || '') }).lean();
  if (!client) return res.status(404).json({ error: 'Mijoz topilmadi' });
  const want = [...new Set((Array.isArray(b.candidateIds) ? b.candidateIds : []).map(String))].slice(0, 20);
  const found = await Candidate.find({ restaurantId: agencyId, id: { $in: want } }, 'id').lean();
  const ids = want.filter(id => found.some(c => c.id === id));
  if (!ids.length) return res.status(400).json({ error: 'Nomzod tanlanmagan' });

  let vacancyId = '';
  if (b.vacancyId) {
    const v = await Vacancy.findOne({ agencyId, clientId: client.id, id: String(b.vacancyId) }, 'id').lean();
    if (v) vacancyId = v.id;
  }
  const summary = String(b.summary || '').trim().slice(0, 200) || 'Agentlik taklifi';
  const row = await Shortlist.create({
    id: uuidv4(), agencyId, clientId: client.id, vacancyId, summary,
    items: ids.map(candidateId => ({ candidateId, state: 'selected' })), status: 'new'
  });
  await Candidate.updateMany({ restaurantId: agencyId, id: { $in: ids } }, { $addToSet: { shownToClients: client.id } });

  // Mijozga — o'z tilida (yiqilsa ham tanlov saqlangan)
  try {
    if (client.tgChatId) {
      const T = (k, v) => I18N.t(I18N.resolve(client.lang, client.tgLang), k, v);
      await tg.sendMessage(tg.platformToken(), client.tgChatId, T('nc.proposed', { n: ids.length, s: summary }));
    }
  } catch (e) { console.error('[SL] taklif xabari ketmadi:', e.message); }

  res.json({ ok: true, id: row.id, count: ids.length });
}));

// ── A2. Bitta tanlov — nomzodlar bilan ──
router.get('/:id', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const row = await Shortlist.findOne({ agencyId, id: req.params.id }).lean();
  if (!row) return res.status(404).json({ error: 'Tanlov topilmadi' });

  // Lokatsiya va taklif qo'ng'iroq uchun kerak: nomzod birinchi
  // "qayerda?" va "qancha?" deb so'raydi.
  const client = await Client.findOne({ agencyId, id: row.clientId },
    'id name credits tgChatId status location address about phone contactName').lean();

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
      stateLabel: pipeline.stateLabel(i.state),
      reason: i.reason || '',
      reasonLabel: pipeline.reasonLabel(i.reason),
      interviewAt: i.interviewAt,
      decidedAt: i.decidedAt,
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
    summary: row.summary, offer: row.offer,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    client: client || null,
    counts: counts(row.items),
    items
  });
}));

// ── A3. Nomzod holatini o'zgartirish ──
router.patch('/:id/items/:candidateId', guard, asyncHandler(async (req, res) => {
  const { state, reason, note } = req.body || {};
  try {
    const row = await sl.setItemState({
      agencyId: req.user.restaurantId,
      shortlistId: req.params.id,
      candidateId: req.params.candidateId,
      state: String(state || ''),
      reason: String(reason || ''),
      note: String(note || '')
    });
    res.json({ ok: true, counts: counts(row.items) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ── A3b. Natijani agentlik belgilaydi (suhbat / ishga olindi / mos kelmadi) ──
// Mijoz Mini App'da bosmasa ham — telefonda aytgan bo'lsa — siz qo'yasiz.
// Qoida mijozniki bilan bir xil (shortlist.setClientState): faqat kontakt
// ochilgandan keyin, ishga olindi/mos kelmadi — yakuniy.
router.post('/:id/outcome/:candidateId', guard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  try {
    const row = await sl.setClientState({
      agencyId: req.user.restaurantId,
      shortlistId: req.params.id,
      clientId: '',                       // agentlik — mijoz cheklovisiz
      candidateId: req.params.candidateId,
      state: String(b.state || ''),
      reason: String(b.reason || ''),
      interviewAt: b.interviewAt || null
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
      candidateId: req.params.candidateId,
      appBase: publicBase(req)
    });
    if (r.already) return res.json({ ok: true, already: true, message: 'Kontakt allaqachon ochilgan' });
    res.json({ ok: true, already: false, balance: r.balance, counts: counts(r.shortlist.items) });
  } catch (e) {
    // Kredit yetmasligi — mijozning muammosi, server xatosi emas
    const code = /[Kk]redit yetarli emas/.test(e.message) ? 402 : 400;
    res.status(code).json({ error: e.message });
  }
}));

// ── A5. Kreditni qaytarish (+1) — sabab ro'yxatdan (pipeline.REFUND_REASONS) ──
router.post('/:id/refund/:candidateId', guard, asyncHandler(async (req, res) => {
  try {
    const r = await sl.refund({
      agencyId: req.user.restaurantId,
      shortlistId: req.params.id,
      candidateId: req.params.candidateId,
      reason: String((req.body || {}).reason || '')
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

module.exports = router;
