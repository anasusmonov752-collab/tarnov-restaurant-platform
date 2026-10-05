// ── MINI APP (mijoz tomoni) ──────────────────────────────────
// ALOHIDA route oilasi. Sabab: bu yerdan FAQAT anonim ma'lumot
// chiqadi. Mijoz endpointlarini rekruting route'lari bilan aralashtirsak,
// bir kun kimdir to'liq nomzod obyektini qaytarib yuboradi va kontakt
// sizib chiqadi. Chegara arxitektura darajasida.
//
// Avtorizatsiya: cookie emas, Telegram initData imzosi.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler } = require('../middleware/errorHandler');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Restaurant = require('../models/Restaurant');
const SearchSession = require('../models/SearchSession');
const Shortlist = require('../models/Shortlist');
const initData = require('../services/tgInitData');
const anonymize = require('../services/anonymize');
const tg = require('../services/telegram');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p so\'rov' }
});
router.use(limiter);

// initData'ni tekshirib, mijozni topadi. Har endpoint shundan boshlanadi.
const clientGuard = asyncHandler(async (req, res, next) => {
  const raw = req.get('X-Telegram-Init-Data') || (req.body && req.body.initData) || '';
  const v = initData.verify(raw);
  if (!v.ok) return res.status(401).json({ error: 'Avtorizatsiya: ' + v.error });

  const client = await Client.findOne({ tgChatId: String(v.user.id) });
  if (!client) return res.status(403).json({ error: 'Mijoz topilmadi' });
  if (client.status !== 'active') {
    return res.status(403).json({
      error: client.status === 'blocked' ? 'Hisob to\'xtatilgan' : 'Hisob hali tasdiqlanmagan'
    });
  }
  req.client = client;
  next();
});

// Kodi yo'q nomzodlarga qisqa kod beradi ("A-3F7C").
// Kod takrorlanmasligi kerak — unikal indeks yo'q, shuning uchun
// bandligini tekshirib, bir necha marta urinamiz.
async function assignCodes(agencyId, rows) {
  const need = rows.filter(r => !r.publicCode);
  if (!need.length) return;

  const taken = new Set(
    (await Candidate.find({ restaurantId: agencyId, publicCode: { $ne: '' } }, 'publicCode').lean())
      .map(c => c.publicCode)
  );

  for (const r of need) {
    let code = null;
    for (let i = 0; i < 12 && !code; i++) {
      const c = anonymize.makeCode();
      if (!taken.has(c)) code = c;
    }
    if (!code) continue;                       // juda kam ehtimol; kodsiz qoladi
    taken.add(code);
    r.publicCode = code;
    await Candidate.updateOne({ restaurantId: agencyId, id: r.id }, { $set: { publicCode: code } });
  }
}

// ── Qidiruv seansi: anonim kartalar ──
router.post('/session/:key', clientGuard, asyncHandler(async (req, res) => {
  const ses = await SearchSession.findOne({ key: req.params.key, clientId: req.client.id });
  if (!ses) return res.status(404).json({ error: 'Qidiruv topilmadi yoki muddati tugagan' });

  const rows = await Candidate.find(
    { restaurantId: ses.agencyId, id: { $in: ses.candidateIds } },
    '-fileData -rawText -photo -tgInviteToken'
  ).lean();

  // Qisqa kodni KO'RSATILGANDA beramiz — migratsiya kerak emas, va kod
  // faqat mijoz haqiqatan ko'rgan nomzodlarda paydo bo'ladi.
  await assignCodes(ses.agencyId, rows);

  // Tartib seansdagidek bo'lsin — bot aytgan tartib saqlanadi
  const byId = {};
  for (const r of rows) byId[r.id] = r;
  const ordered = ses.candidateIds.map(id => byId[id]).filter(Boolean);

  res.json({
    summary: ses.summary,
    credits: req.client.credits,
    clientName: req.client.name,
    candidates: anonymize.forClientList(ordered)
  });
}));

// ── Nomzod fotosi ──
// Alohida endpoint: faqat shu mijozning seansidagi nomzod uchun.
router.get('/photo/:key/:id', asyncHandler(async (req, res) => {
  const v = initData.verify(req.query.i || '');
  if (!v.ok) return res.status(401).end();

  const client = await Client.findOne({ tgChatId: String(v.user.id), status: 'active' });
  if (!client) return res.status(403).end();

  const ses = await SearchSession.findOne({ key: req.params.key, clientId: client.id });
  if (!ses || !ses.candidateIds.includes(req.params.id)) return res.status(404).end();

  const c = await Candidate.findOne({ restaurantId: ses.agencyId, id: req.params.id }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ── Tanlovni yuborish ──
router.post('/shortlist', clientGuard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const ses = await SearchSession.findOne({ key: String(b.key || ''), clientId: req.client.id });
  if (!ses) return res.status(404).json({ error: 'Qidiruv topilmadi yoki muddati tugagan' });

  // Faqat shu seansdagi nomzodlar — mijoz boshqa id yubora olmasin
  const picked = (Array.isArray(b.ids) ? b.ids : [])
    .filter(id => ses.candidateIds.includes(id))
    .slice(0, 20);
  if (!picked.length) return res.status(400).json({ error: 'Nomzod tanlanmadi' });

  const sl = await Shortlist.create({
    id: uuidv4(),
    agencyId: ses.agencyId,
    clientId: req.client.id,
    vacancyId: '',
    items: picked.map(candidateId => ({ candidateId, state: 'selected' })),
    status: 'new'
  });

  // Nomzodlarga "kimga ko'rsatilgan" belgisi — takror taklif qilmaslik uchun
  await Candidate.updateMany(
    { restaurantId: ses.agencyId, id: { $in: picked } },
    { $addToSet: { shownToClients: req.client.id } }
  );

  // Sizga xabar — TO'LIQ kontakt bilan (bu agentlik chati, mijoznikisi emas)
  try {
    const agency = await Restaurant.findOne({ id: ses.agencyId });
    const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
    if (adminChat) {
      const cands = await Candidate.find(
        { restaurantId: ses.agencyId, id: { $in: picked } },
        'fullName phone email desiredPosition publicCode'
      ).lean();

      const lines = cands.map((c, i) =>
        `${i + 1}. ${c.fullName || 'Nomsiz'} (${c.publicCode || '—'})\n` +
        `   ${c.desiredPosition || ''}\n` +
        `   ${c.phone || 'telefon yo\'q'}${c.email ? ' · ' + c.email : ''}`
      ).join('\n\n');

      await tg.sendMessage(tg.platformToken(), adminChat,
        `${req.client.name} ${picked.length} ta nomzod tanladi\n` +
        `So'rov: ${ses.summary}\n` +
        `${'—'.repeat(22)}\n\n${lines}\n\n` +
        `Nomzodlar bilan bog'laning, keyin panelda kontaktni oching.`);
    }
  } catch (e) {
    console.error('[MA] adminga xabar ketmadi:', e.message);   // tanlov baribir saqlangan
  }

  res.json({ ok: true, shortlistId: sl.id, count: picked.length });
}));

module.exports = router;
