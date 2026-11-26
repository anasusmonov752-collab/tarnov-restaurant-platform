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
const Vacancy = require('../models/Vacancy');
const contactLog = require('../services/contactLog');

const router = express.Router();

// Agentlik qo'lidagi holatlar — shu yerda turgan nomzod sizni kutyapti
const WAITING = ['selected', 'contacting', 'candidate_ok'];

router.get('/today', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now - 7 * 864e5);

  // Yopilgan vakansiyaga kelgan arizalar sanoqqa kirmaydi (Arizalar — "Yakunlangan")
  const liveVac = await Vacancy.distinct('id', { agencyId, status: { $in: ['open', 'paused'] } });
  const [shortlists, appsNew, clients, candTotal, candWeek, unread, anketaUnseen, baseWeek, appsUnseen] = await Promise.all([
    Shortlist.find({ agencyId, status: { $ne: 'done' } }, 'id clientId items createdAt updatedAt summary').lean(),
    Application.countDocuments({ agencyId, state: 'new', isTest: { $ne: true }, vacancyId: { $in: liveVac } }),
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
    Application.countDocuments({ agencyId, agencySeenAt: null, state: { $in: ['new', 'seen'] }, isTest: { $ne: true }, vacancyId: { $in: liveVac } })
  ]);
  // Nomzodga KO'RINADIGAN ochiq ishlar. Tasdiqlanmagani (confirmedAt 14 kundan
  // eski — vac.STALE_DAYS) botda ham, nomzod kabinetida ham ko'rinmaydi: hammasi
  // eskirsa nomzod BO'SH ekran ko'radi. Shuning uchun bu yerda va yon menyuda.
  // "HR 24 soatda qo'ng'iroq qiladi" — bosh ko'rsatkich va yon menyu "Qo'ng'iroqlar" sanog'i.
  // Qoida bitta joyda — services/callQueue (ariza + anketa, bir odam bir marta, "javob bermadi"
  // deganlar ertagacha sanalmaydi)
  const calls = await require('../services/callQueue').counts(agencyId, now);

  const vacSvc = require('../services/vacancy');
  const fresh = new Date(Date.now() - vacSvc.STALE_DAYS * 864e5);
  const openQ = { agencyId, status: 'open', listed: { $ne: false }, isTest: { $ne: true } };
  const [openJobs, staleJobs] = await Promise.all([
    Vacancy.countDocuments(Object.assign({ confirmedAt: { $gte: fresh } }, openQ)),
    Vacancy.countDocuments(Object.assign({ confirmedAt: { $lt: fresh } }, openQ))
  ]);

  // Yon menyu "To'lovlar" — tasdiq kutayotgan tarif so'rovlari
  // Tasdiq kutayotgan: qo'lda/hisob-faktura so'rovi yoki "To'ladim" bosilgan kartali o'tkazma
  const ordersPending = await require('../models/Order').countDocuments({ agencyId, status: 'pending',
    $or: [{ provider: { $in: ['manual', 'invoice'] } }, { provider: 'card', claimedAt: { $ne: null } }] });

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
  // Sinov mijozlarining tanlovlari navbatga kirmaydi ("eng eskisi 48 kun" sinovdan edi)
  }).filter(q => q.waiting > 0 && !(byClient[q.clientId] || {}).isTest).sort((a, b) => new Date(a.since) - new Date(b.since));

  const active = clients.filter(c => c.status === 'active' && !c.isTest);
  res.json({
    appsNew, calls, callsDue: calls.due,
    waitingShortlists: queue.length,
    oldestWaitingDays: queue.length ? Math.floor((now - new Date(queue[0].since)) / 864e5) : 0,
    revealedMonth: (month[0] || {}).revealed || 0,
    hiredMonth: (month[0] || {}).hired || 0,
    clientCredits: active.reduce((s, c) => s + (c.credits || 0), 0),
    activeClients: active.length,
    candidates: candTotal, candidatesWeek: candWeek, anketaUnseen, baseWeek, appsUnseen, ordersPending,
    openJobs, staleJobs,
    unreadChats: (unread[0] || {}).n || 0,
    queue: queue.slice(0, 20)
  });
}));

// ── QO'NG'IROQ RO'YXATI (services/callQueue, panel /qongiroq.html) ──
router.get('/calls', guard, asyncHandler(async (req, res) => {
  const q = await require('../services/callQueue').build(req.user.restaurantId);
  res.json(q);
}));

router.post('/calls/:candId', guard, asyncHandler(async (req, res) => {
  try {
    const out = await require('../services/callQueue').record({ agencyId: req.user.restaurantId, candId: req.params.candId,
      result: String((req.body || {}).result || ''), appBase: require('../utils/publicBase').publicBase(req) });
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

// ── Baza hajmi (Atlas bepul tarifi 512 MB) — faqat o'qish ──
// Nomzod hujjatida PDF (fileData) va rasm (photo) base64 bo'lib yotadi; ular qancha joy
// egallashini bilmasdan alohida kolleksiyaga ko'chirish (katta migratsiya) kerakmi — aytib bo'lmaydi.
router.get('/storage', guard, asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  const db = mongoose.connection.db;
  const MB = 1024 * 1024, r1 = n => Math.round((n || 0) / MB * 10) / 10;
  const st = await db.stats();
  const cols = [];
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    let size = null, storage = null, idx = null, count = null;
    try {
      const [s] = await db.collection(c.name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
      const ss = (s && s.storageStats) || {};
      size = ss.size; storage = ss.storageSize; idx = ss.totalIndexSize; count = ss.count;
    } catch (e) { count = await db.collection(c.name).estimatedDocumentCount().catch(() => null); }
    cols.push({ name: c.name, count, dataMB: size == null ? null : r1(size), storageMB: storage == null ? null : r1(storage), indexMB: idx == null ? null : r1(idx) });
  }
  cols.sort((a, b) => (b.dataMB || 0) - (a.dataMB || 0));
  const [heavy] = await Candidate.aggregate([{ $group: { _id: null, n: { $sum: 1 },
    fileData: { $sum: { $strLenBytes: { $ifNull: ['$fileData', ''] } } },
    photo: { $sum: { $strLenBytes: { $ifNull: ['$photo', ''] } } },
    rawText: { $sum: { $strLenBytes: { $ifNull: ['$rawText', ''] } } },
    withFile: { $sum: { $cond: [{ $gt: [{ $strLenBytes: { $ifNull: ['$fileData', ''] } }, 0] }, 1, 0] } } } }]);
  res.json({
    limitMB: 512,
    dataMB: r1(st.dataSize), storageMB: r1(st.storageSize), indexMB: r1(st.indexSize),
    usedMB: r1((st.dataSize || 0) + (st.indexSize || 0)),
    candidates: heavy ? { count: heavy.n, withFile: heavy.withFile, fileDataMB: r1(heavy.fileData), photoMB: r1(heavy.photo), rawTextMB: r1(heavy.rawText) } : null,
    collections: cols
  });
}));

// ── ANALITIKA: nomzod yo'li (services/track) ─────────────────
// Bitta savolga javob: odamlar qayerda tushib qolyapti?
//   voronka (kohorta) · manba bo'yicha · anketaning qaysi savolida to'xtadi ·
//   qaysi lavozimni qidirishadi · vakansiyani kim/qachon ko'rdi · so'nggi harakatlar
router.get('/analytics', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const days = [1, 7, 30, 90].includes(+req.query.days) ? +req.query.days : 7;
  const track = require('../services/track');
  const survey = require('../services/survey');
  const SurveyResponse = require('../models/SurveyResponse');
  const Survey = require('../models/Survey');
  const { roleLabel, isValidRole } = require('../data/roles');
  const since = track.periodStart(days);

  const [funnel, roles, vacs, recent, drops, surveys] = await Promise.all([
    track.funnel(agencyId, days),
    track.roles(agencyId, days),
    track.vacancies(agencyId, days),
    track.recent(agencyId, 40),
    // Tugatilmagan anketalar oxirgi qaysi savolga javob bergan
    SurveyResponse.aggregate([
      { $match: { agencyId, status: 'started', isTest: { $ne: true }, startedAt: { $gte: since } } },
      { $group: { _id: '$step', n: { $sum: 1 } } }, { $sort: { n: -1 } }
    ]),
    Survey.find({ agencyId }, 'questions').lean()
  ]);

  // Savol nomi: standart savol — katalogdagi qisqa nom; o'z savoli — matni
  const qName = {};
  for (const sv of surveys) for (const q of sv.questions || []) {
    qName[q.id] = (survey.CATALOG[q.id] && survey.CATALOG[q.id].field) || (q.text && q.text.uz) || q.id;
  }
  const vIds = [...new Set(vacs.map(v => v.vacancyId).concat(
    recent.filter(e => (e.kind === 'view' || e.kind === 'apply') && e.ref).map(e => e.ref)))];
  const vRows = vIds.length ? await Vacancy.find({ agencyId, id: { $in: vIds } }, 'id title clientId status').lean() : [];
  const cRows = await Client.find({ agencyId, id: { $in: [...new Set(vRows.map(v => v.clientId))] } }, 'id name').lean();
  const cName = Object.fromEntries(cRows.map(c => [c.id, c.name]));
  const vById = Object.fromEntries(vRows.map(v => [v.id, v]));
  const chLabel = ch => survey.CHANNELS[ch] || (ch ? ch : 'Belgisiz');
  const refLabel = e => e.kind === 'role' ? (isValidRole(e.ref) ? roleLabel(e.ref) : e.ref)
    : (e.kind === 'view' || e.kind === 'apply') ? ((vById[e.ref] || {}).title || 'Vakansiya')
    : e.kind === 'lang' ? (e.ref === 'ru' ? 'Ruscha' : "O'zbekcha") : '';

  res.json({
    days,
    funnel: funnel.total,
    channels: funnel.channels.map(c => Object.assign({ label: chLabel(c.channel) }, c)),
    dropAt: drops.map(d => ({ step: d._id || '', label: d._id ? (qName[d._id] || d._id) : 'Birinchi savolgacha', n: d.n })),
    roles: roles.map(r => ({ role: r.role, label: isValidRole(r.role) ? roleLabel(r.role) : r.role, n: r.n })),
    vacancies: vacs.map(v => Object.assign({}, v, {
      title: (vById[v.vacancyId] || {}).title || '(o\'chirilgan)',
      client: cName[(vById[v.vacancyId] || {}).clientId] || '',
      closed: (vById[v.vacancyId] || {}).status === 'closed'
    })),
    recent: recent.map(e => ({ tgUserId: e.tgUserId, name: e.name, kind: e.kind, label: track.KINDS[e.kind],
      ref: refLabel(e), channel: e.channel ? chLabel(e.channel) : '', candidateId: e.candidateId, at: e.at }))
  });
}));

// Bitta odamning yo'li — "So'nggi harakatlar" dan bosilganda
router.get('/analytics/user/:tg', guard, asyncHandler(async (req, res) => {
  const agencyId = req.user.restaurantId;
  const track = require('../services/track');
  const { roleLabel, isValidRole } = require('../data/roles');
  const evs = await track.timeline(agencyId, req.params.tg);
  const vIds = [...new Set(evs.filter(e => e.ref && (e.kind === 'view' || e.kind === 'apply' || e.kind === 'start')).map(e => e.ref))];
  const vRows = vIds.length ? await Vacancy.find({ agencyId, id: { $in: vIds } }, 'id title').lean() : [];
  const vT = Object.fromEntries(vRows.map(v => [v.id, v.title]));
  const candId = (evs.find(e => e.candidateId) || {}).candidateId || '';
  const cand = candId ? await Candidate.findOne({ restaurantId: agencyId, id: candId }, 'id fullName phone role status').lean() : null;
  res.json({
    name: (evs.find(e => e.name) || {}).name || '',
    candidate: cand,
    events: evs.map(e => ({ kind: e.kind, label: track.KINDS[e.kind], at: e.at, channel: e.channel,
      ref: e.kind === 'role' ? (isValidRole(e.ref) ? roleLabel(e.ref) : e.ref) : (vT[e.ref] || '') }))
  });
}));

module.exports = router;
