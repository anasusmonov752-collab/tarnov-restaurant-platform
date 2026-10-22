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
const appLife = require('../services/appLife');
const { publicBase } = require('../utils/publicBase');

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

// ══ ARIZALAR — HAMMA VAKANSIYALAR BO'YICHA BITTA QUTI ══
// (/:id dan OLDIN — aks holda 'applications' id deb o'qiladi)
// Ilgari arizani ko'rish uchun har vakansiyani alohida ochish kerak edi
// va agentlikka faqat Telegram xabari kelardi. Bu yerda: kim, qaysi
// vakansiyaga, qachon, ko'rildimi, bog'lanildimi, qaysi bosqichda.
// tab: new — hali bog'lanilmagan, work — jarayonda, done — yakunlangan
const DAY = 864e5;
router.get('/applications/inbox', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const apps = await Application.find({ agencyId }).sort({ createdAt: -1 }).limit(300).lean();
  const [cands, vs, sls] = await Promise.all([
    Candidate.find({ restaurantId: agencyId, id: { $in: [...new Set(apps.map(a => a.candidateId))] } },
      'id publicCode fullName phone role desiredPosition experienceYears age location source channel phoneVerifiedAt hasPhoto tgState updatedAt').lean(),
    Vacancy.find({ agencyId, id: { $in: [...new Set(apps.map(a => a.vacancyId))] } }, 'id title clientId venue role').lean(),
    Shortlist.find({ agencyId, id: { $in: apps.map(a => a.shortlistId).filter(Boolean) } }, 'id items').lean()
  ]);
  const clients = await Client.find({ agencyId, id: { $in: [...new Set(vs.map(v => v.clientId))] } }, 'id name status').lean();
  const C = Object.fromEntries(cands.map(x => [x.id, x])), V = Object.fromEntries(vs.map(x => [x.id, x]));
  const K = Object.fromEntries(clients.map(x => [x.id, x])), S = Object.fromEntries(sls.map(x => [x.id, x]));

  const now = Date.now();
  const items = apps.map(a => {
    const sl = S[a.shortlistId];
    const item = sl ? (sl.items || []).find(i => i.candidateId === a.candidateId) : null;
    const life = appLife.stepsFor(a, item);
    const v = V[a.vacancyId] || {};
    const decided = a.state === 'shortlisted' || a.state === 'rejected';
    const tab = life.final ? 'done' : (!a.contactedAt && !decided ? 'new' : 'work');
    return {
      id: a.id, vacancyId: a.vacancyId, state: a.state, message: a.message,
      createdAt: a.createdAt, contactedAt: a.contactedAt, agencySeenAt: a.agencySeenAt,
      unseen: !a.agencySeenAt && !decided,
      // Javobsiz: hali bog'lanilmagan va qaror yo'q — 24 soatdan oshsa sariq
      waitingMs: tab === 'new' ? now - new Date(a.createdAt).getTime() : 0,
      tab, stage: life.stage, stageLabel: life.stageLabel, tone: life.tone,
      vacancy: { id: v.id, title: v.title || 'Vakansiya o\'chirilgan', venue: v.venue || '' },
      client: { id: v.clientId, name: (K[v.clientId] || {}).name || '', status: (K[v.clientId] || {}).status || '' },
      candidate: C[a.candidateId] || null
    };
  });
  const count = t => items.filter(x => x.tab === t).length;
  res.json({
    items,
    counts: { new: count('new'), work: count('work'), done: count('done'), all: items.length,
              unseen: items.filter(x => x.unseen).length,
              waitingOld: items.filter(x => x.waitingMs > DAY).length }
  });
}));

// Ko'rildi (kartani ochganda) va bog'lanildi ("Qo'ng'iroq qildim") —
// faqat birinchi marta yoziladi. Nomzod "ko'rib chiqildi / HR bog'landi"ni
// sana bilan ko'radi (appLife.stepsFor).
router.post('/applications/:appId/:mark(seen|contacted)', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const field = req.params.mark === 'seen' ? 'agencySeenAt' : 'contactedAt';
  const set = { [field]: new Date() };
  const a = await Application.findOneAndUpdate({ agencyId, id: req.params.appId, [field]: null }, { $set: set }, { new: true });
  if (!a && !await Application.exists({ agencyId, id: req.params.appId })) return res.status(404).json({ error: 'Ariza topilmadi' });
  // Bog'lanildi — ko'rildi ham (ochmasdan qo'ng'iroq qilingan bo'lishi mumkin)
  if (field === 'contactedAt') await Application.updateOne({ agencyId, id: req.params.appId, agencySeenAt: null }, { $set: { agencySeenAt: new Date() } });
  res.json({ ok: true });
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

  const v0 = await Vacancy.findOne({ agencyId, id: a.vacancyId }, 'title').lean();
  const cand = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId }, 'id tgChatId tgState').lean();
  if (!a.agencySeenAt) a.agencySeenAt = new Date();

  if (act === 'reject') {
    a.state = 'rejected'; a.reason = 'agency'; a.decidedAt = new Date();
    await a.save();
    await appLife.notify(cand, 'rejected', { vacTitle: v0 && v0.title, appBase: publicBase(req) });
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
  await appLife.notify(cand, 'proposed', { vacTitle: v0 && v0.title, appBase: publicBase(req) });
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

// ── Agentlik tekshirdi ──
// Ish beruvchiga qo'ng'iroq qilib "o'rin ochiq" deb tasdiqlatganda bosiladi.
// Nomzod "TalentHub tekshirgan ✓" belgisini ko'radi — faqat shundan keyin.
// off:true — belgini olib tashlash (xato bosilgan bo'lsa).
router.post('/:id/verify', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const off = !!(req.body && req.body.off);
  const set = off ? { verifiedAt: null, updatedAt: new Date() }
                  : { verifiedAt: new Date(), confirmedAt: new Date(), updatedAt: new Date() };
  const v = await Vacancy.findOneAndUpdate({ agencyId, id: req.params.id }, { $set: set }, { new: true });
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
  res.json(vac.full(v));
}));

module.exports = router;
