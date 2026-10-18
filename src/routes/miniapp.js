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
const shortlistSvc = require('../services/shortlist');
const credits = require('../services/credits');
const pipeline = require('../data/pipeline');
const Vacancy = require('../models/Vacancy');
const Application = require('../models/Application');
const vac = require('../services/vacancy');
const vacAuto = require('../services/vacancyAuto');
const contactView = require('../services/contactView');
const agent = require('../services/agent');
const chat = require('../services/chat');
const ChatThread = require('../models/ChatThread');
const { publicBase } = require('../utils/publicBase');

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

  // Har tanlovning vakansiyasi bo'lsin — nomzod kontakt ochilgach
  // "qayerga, qanday shartda" ni ko'radi. Yiqilsa tanlov baribir saqlanadi.
  let vacancyId = '';
  try {
    const v = await vacAuto.ensureFromSearch({
      agencyId: ses.agencyId, client: req.client, criteria: ses.criteria || {}
    });
    vacancyId = v.id;
  } catch (e) {
    console.error('[MA] avtomatik vakansiya yaratilmadi:', e.message);
  }

  const sl = await Shortlist.create({
    id: uuidv4(),
    agencyId: ses.agencyId,
    clientId: req.client.id,
    vacancyId,
    summary: ses.summary || '',
    items: picked.map(candidateId => ({ candidateId, state: 'selected' })),
    status: 'new'
  });

  // Nomzodlarga "kimga ko'rsatilgan" belgisi — takror taklif qilmaslik uchun
  await Candidate.updateMany(
    { restaurantId: ses.agencyId, id: { $in: picked } },
    { $addToSet: { shownToClients: req.client.id } }
  );

  // Sizga xabar — TO'LIQ kontakt bilan (bu agentlik chati, mijoznikisi emas).
  //
  // Har nomzod ALOHIDA xabar bo'lib ketadi, chunki har biriga o'z tugmasi
  // kerak: tugma bosilgach o'sha xabarning o'zi natijaga almashtiriladi.
  // Hammasi bitta xabarda bo'lsa, bittasini bajargach qolganlari ham
  // yo'qolib ketardi.
  try {
    const agency = await Restaurant.findOne({ id: ses.agencyId });
    const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
    if (adminChat) {
      const token = tg.platformToken();
      const cands = await Candidate.find(
        { restaurantId: ses.agencyId, id: { $in: picked } },
        'id fullName phone email desiredPosition publicCode age location experienceYears'
      ).lean();
      const byId = Object.fromEntries(cands.map(c => [c.id, c]));

      await tg.sendMessage(token, adminChat,
        `📋 ${req.client.name} — ${picked.length} ta nomzod tanladi\n` +
        `So'rov: ${ses.summary}\n` +
        `Balans: ${req.client.credits} kredit\n\n` +
        `Har nomzod bilan gaplashib, pastdagi tugmalar bilan belgilang.`);

      // Tartib mijoz tanlagandek qolsin
      for (const id of picked) {
        const c = byId[id];
        if (!c) continue;

        const parts = [
          `${c.fullName || 'Nomsiz'}  (${c.publicCode || '—'})`,
          c.desiredPosition || '',
          [c.age ? c.age + ' yosh' : '', c.location || '',
           c.experienceYears ? c.experienceYears + ' yil tajriba' : '']
            .filter(Boolean).join(' · '),
          '',
          `📞 ${c.phone || 'telefon yo\'q'}`,
          c.email ? `✉️ ${c.email}` : ''
        ].filter(Boolean);

        await tg.sendMessage(token, adminChat, parts.join('\n'),
          { reply_markup: shortlistSvc.cbKeyboard(sl.id, c.id) });
      }
    }
  } catch (e) {
    console.error('[MA] adminga xabar ketmadi:', e.message);   // tanlov baribir saqlangan
  }

  // Mijozdan vakansiya shartlarini so'raymiz — tanlovdan KEYIN.
  // Oldin so'rasak bu anketa bo'lardi; hozir esa tabiiy: odam tanladi,
  // endi "nima taklif qilasiz?" mantiqiy savol. Javob nomzodga
  // qo'ng'iroq qilganda kerak bo'ladi.
  try {
    if (req.client.tgChatId) {
      await agent.askOffer(req.client.tgChatId, sl.id);
      await tg.sendMessage(tg.platformToken(), req.client.tgChatId,
        `${picked.length} ta nomzod qabul qilindi.\n\n` +
        `Ular bilan gaplashishim uchun ayting — nima taklif qilasiz? ` +
        `Maosh, smena, qachondan kerak.`);
    }
  } catch (e) {
    console.error('[MA] taklif so\'rovi yuborilmadi:', e.message);
  }

  res.json({ ok: true, shortlistId: sl.id, count: picked.length });
}));

// ══ MIJOZ KABINETI ═══════════════════════════════════════════
//
// DIQQAT — anonim chegarasi: bu fayldan odatda kontakt CHIQMAYDI.
// Yagona istisno quyida: `state === 'revealed'` bo'lgan nomzod. Mijoz
// uning uchun kredit to'lagan, siz nomzod bilan gaplashib tasdiqlagansiz.
// Boshqa hech qaysi holatda ism/telefon/email qaytarilmaydi.

const CLIENT_STATE = {
  selected:     { key: 'waiting',  label: 'Ko\'rib chiqilmoqda' },
  contacting:   { key: 'waiting',  label: 'Bog\'lanilmoqda' },
  candidate_ok: { key: 'waiting',  label: 'Nomzod rozi — kontakt tayyorlanmoqda' },
  candidate_no: { key: 'no',       label: 'Nomzod rad etdi' },
  revealed:     { key: 'open',     label: 'Kontakt ochilgan' },
  interview:    { key: 'open',     label: 'Suhbat belgilandi' },
  hired:        { key: 'hired',    label: 'Ishga olindi' },
  not_fit:      { key: 'no',       label: 'Mos kelmadi' },
  refunded:     { key: 'refunded', label: 'Javob bermadi — kredit qaytarildi' }
};

// ── Mijoz haqida: balans va qisqa statistika ──
router.get('/me', clientGuard, asyncHandler(async (req, res) => {
  const rows = await Shortlist.find({ agencyId: req.client.agencyId, clientId: req.client.id }).lean();

  let picked = 0, revealed = 0, hours = [];
  for (const r of rows) {
    for (const it of r.items) {
      picked++;
      if (it.state === 'revealed' && it.revealedAt) {
        revealed++;
        hours.push((new Date(it.revealedAt) - new Date(r.createdAt)) / 36e5);
      }
    }
  }
  const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;

  res.json({
    name: req.client.name,
    credits: req.client.credits,
    stats: {
      searches: rows.length,
      picked,
      revealed,
      avgHours: avg == null ? null : Math.round(avg * 10) / 10
    }
  });
}));

// ── Tanlovlarim ──
router.get('/shortlists', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const rows = await Shortlist.find({ agencyId, clientId: req.client.id })
    .sort({ createdAt: -1 }).limit(50).lean();
  if (!rows.length) return res.json([]);

  const ids = [...new Set(rows.flatMap(r => r.items.map(i => i.candidateId)))];
  const cands = await Candidate.find(
    { restaurantId: agencyId, id: { $in: ids } },
    'id publicCode role desiredPosition age location experienceYears hasPhoto ' +
    'languages shift jobStatus fullName phone email'
  ).lean();
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));

  res.json(rows.map(r => ({
    id: r.id,
    summary: r.summary || 'Qidiruv',
    createdAt: r.createdAt,
    items: r.items.map(it => {
      const c = byId[it.candidateId];
      const st = CLIENT_STATE[it.state] || CLIENT_STATE.selected;
      // Kontakt kredit to'langandan keyin KO'RINIB TURAVERADI. Ilgari shart
      // `state === 'revealed'` edi: mijoz "suhbat belgilandi" qo'ygani zahoti
      // holat o'zgarib, TO'LANGAN kontakt kabinetdan yo'qolardi.
      // 'refunded' istisno — kredit qaytarilgan, kontakt ham qaytariladi.
      const open = !!it.revealedAt && it.state !== 'refunded';

      return {
        candidateId: it.candidateId,
        publicCode: c ? c.publicCode : '',
        role: c ? c.role : '',
        desiredPosition: c ? c.desiredPosition : '',
        age: c ? c.age : null,
        location: c ? c.location : '',
        experienceYears: c ? c.experienceYears : 0,
        languages: c ? c.languages : [],
        shift: c ? c.shift : '',
        hasPhoto: c ? !!c.hasPhoto : false,
        state: st.key,
        stateLabel: st.label,
        reason: it.reason ? pipeline.reasonLabel(it.reason) : '',
        interviewAt: it.interviewAt,
        canAct: ['revealed', 'interview'].includes(it.state),
        revealedAt: it.revealedAt,
        // Kontakt FAQAT ochilganda — yuqoridagi izohga qarang
        contact: open && c ? { fullName: c.fullName, phone: c.phone, email: c.email } : null
      };
    })
  })));
}));

// ── Kabinetdagi nomzod fotosi ──
// Qidiruvdagi foto endpointi seans kalitiga bog'langan, seans esa 24 soatda
// o'chadi. Kabinetda tanlov umrbod turadi, shuning uchun tekshiruv ham
// tanlov bo'yicha: nomzod shu mijozning tanlovida bo'lishi shart.
router.get('/photo-sl/:shortlistId/:id', asyncHandler(async (req, res) => {
  const v = initData.verify(req.query.i || '');
  if (!v.ok) return res.status(401).end();

  const client = await Client.findOne({ tgChatId: String(v.user.id), status: 'active' });
  if (!client) return res.status(403).end();

  const sl = await Shortlist.findOne({
    agencyId: client.agencyId, id: req.params.shortlistId, clientId: client.id,
    'items.candidateId': req.params.id
  }).lean();
  if (!sl) return res.status(404).end();

  const c = await Candidate.findOne({ restaurantId: client.agencyId, id: req.params.id }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ── Mijoz qarori: suhbat / ishga oldim / mos kelmadi ──
// Faqat kontakt ochilgandan keyin. "Ishga oldim" — butun tizimning
// yakuniy ko'rsatkichi: busiz necha foiz ishga joylashayotganini
// bilib bo'lmaydi.
router.post('/shortlists/:id/items/:candidateId', clientGuard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  try {
    const row = await shortlistSvc.setClientState({
      agencyId: req.client.agencyId,
      shortlistId: req.params.id,
      clientId: req.client.id,
      candidateId: req.params.candidateId,
      state: String(b.state || ''),
      reason: String(b.reason || ''),
      interviewAt: b.interviewAt || null
    });

    // Sizga xabar — mijoz qaror qilganini bilishingiz kerak
    try {
      const agency = await Restaurant.findOne({ id: req.client.agencyId });
      const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
      if (adminChat) {
        const c = await Candidate.findOne(
          { restaurantId: req.client.agencyId, id: req.params.candidateId },
          'fullName publicCode').lean();
        const who = (c && (c.fullName || c.publicCode)) || 'Nomzod';
        const txt = b.state === 'hired' ? `✅ ${req.client.name}: ${who} ISHGA OLINDI`
                  : b.state === 'interview' ? `📅 ${req.client.name}: ${who} suhbatga chaqirildi`
                  : `❌ ${req.client.name}: ${who} mos kelmadi` +
                    (b.reason ? ` — ${pipeline.reasonLabel(b.reason)}` : '');
        await tg.sendMessage(tg.platformToken(), adminChat, txt);
      }
    } catch (e) { console.error('[MA] qaror xabari ketmadi:', e.message); }

    res.json({ ok: true, shortlistId: row.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ══ MIJOZNING VAKANSIYALARI ══════════════════════════════════
// Mijoz o'zi yaratadi va yangilaydi. Siz ham panel orqali kirita
// olasiz (/api/vacancies) — telefonda aytsa qo'lda yozasiz.

router.get('/vacancies', clientGuard, asyncHandler(async (req, res) => {
  const rows = await Vacancy.find({ agencyId: req.client.agencyId, clientId: req.client.id })
    .sort({ createdAt: -1 }).limit(50).lean();

  // Har vakansiyaga nechta nomzod tanlangan
  const counts = await Shortlist.aggregate([
    { $match: { agencyId: req.client.agencyId, clientId: req.client.id,
                vacancyId: { $in: rows.map(r => r.id) } } },
    { $group: { _id: '$vacancyId', n: { $sum: 1 } } }
  ]);
  const cMap = Object.fromEntries(counts.map(c => [c._id, c.n]));

  res.json(rows.map(v => vac.full(v, { shortlists: cMap[v.id] || 0 })));
}));

router.post('/vacancies', clientGuard, asyncHandler(async (req, res) => {
  const data = vac.clean(req.body || {});
  if (!data.title) return res.status(400).json({ error: 'Vakansiya nomini yozing' });

  const v = await Vacancy.create(Object.assign({
    id: uuidv4(),
    agencyId: req.client.agencyId,
    clientId: req.client.id,
    location: data.location || req.client.location || ''
  }, data));

  // Sizga xabar — yangi vakansiya ochilganini bilishingiz kerak
  try {
    const agency = await Restaurant.findOne({ id: req.client.agencyId });
    // 'chat' deb atamaymiz — yuqorida chat SERVISI import qilingan,
    // bu yerda soyalab qo'yardi va keyin kimdir chat.post() yozsa yiqilardi.
    const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
    if (adminChat) {
      await tg.sendMessage(tg.platformToken(), adminChat,
        `📋 Yangi vakansiya — ${req.client.name}\n\n` +
        `${v.title}\n` +
        (vac.salaryText(v) ? vac.salaryText(v) + '\n' : '') +
        (v.shift ? v.shift + ' smena\n' : '') +
        (v.headcount > 1 ? `${v.headcount} ta odam\n` : '') +
        `\nPanel -> Vakansiyalar`);
    }
  } catch (e) { console.error('[MA] vakansiya xabari ketmadi:', e.message); }

  res.json(vac.full(v));
}));

router.patch('/vacancies/:id', clientGuard, asyncHandler(async (req, res) => {
  const v = await Vacancy.findOne({
    agencyId: req.client.agencyId, clientId: req.client.id, id: req.params.id
  });
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const data = vac.clean(req.body || {}, v.toObject());
  // Mijoz sarlavhani o'zi o'zgartirsa — endi u qo'lda yozilgan vakansiya,
  // shablon keyingi taklifda sarlavhani qayta yasab, uni bosib ketmasin
  if (v.source === 'search' && data.title && data.title !== v.title) v.source = 'manual';
  Object.assign(v, data);
  v.updatedAt = new Date();
  await v.save();
  res.json(vac.full(v));
}));

// Tasdiqlash — "bu o'rin hali ochiq". Nomzod kartada "2 kun oldin
// tasdiqlangan" deb ko'radi, soxta e'lon muammosi shunday yopiladi.
router.post('/vacancies/:id/confirm', clientGuard, asyncHandler(async (req, res) => {
  const v = await Vacancy.findOneAndUpdate(
    { agencyId: req.client.agencyId, clientId: req.client.id, id: req.params.id },
    { $set: { confirmedAt: new Date(), updatedAt: new Date() } },
    { new: true }
  );
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
  res.json(vac.full(v));
}));

// ══ VAKANSIYAGA KELGAN ARIZALAR ══════════════════════════════
// Arizachi ham qidiruvdagidek ANONIM ko'rinadi. Tanlangach oddiy
// tanlov oqimiga quyiladi: siz tekshirasiz, kontakt ochiladi, kredit
// yechiladi. Arizaga alohida pul modeli yaratmadik.

router.get('/vacancies/:id/applications', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const v = await Vacancy.findOne({ agencyId, clientId: req.client.id, id: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const apps = await Application.find({ agencyId, vacancyId: v.id })
    .sort({ createdAt: -1 }).limit(100).lean();
  if (!apps.length) return res.json({ vacancy: vac.full(v), items: [] });

  const cands = await Candidate.find(
    { restaurantId: agencyId, id: { $in: apps.map(a => a.candidateId) } },
    '-fileData -rawText -photo -tgInviteToken'
  ).lean();
  await assignCodes(agencyId, cands);
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));

  // Ko'rilgan deb belgilaymiz — nomzod "Ko'rildi" holatini ko'radi
  const unseen = apps.filter(a => a.state === 'new').map(a => a.id);
  if (unseen.length) {
    await Application.updateMany(
      { agencyId, id: { $in: unseen } },
      { $set: { state: 'seen', seenAt: new Date() } }
    );
  }

  const anon = Object.fromEntries(
    anonymize.forClientList(cands.filter(Boolean)).map(c => [c.publicCode, c])
  );

  res.json({
    vacancy: vac.full(v),
    items: apps.map(a => {
      const c = byId[a.candidateId];
      return {
        id: a.id,
        state: a.state === 'new' ? 'seen' : a.state,
        message: a.message,
        createdAt: a.createdAt,
        candidate: c ? anon[c.publicCode] || null : null
      };
    })
  });
}));

// ── Arizachini tanlash yoki rad etish ──
router.post('/applications/:id/:action', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const act = req.params.action;
  if (!['pick', 'reject'].includes(act)) return res.status(400).json({ error: 'Amal noto\'g\'ri' });

  const a = await Application.findOne({ agencyId, clientId: req.client.id, id: req.params.id });
  if (!a) return res.status(404).json({ error: 'Ariza topilmadi' });
  if (a.state === 'shortlisted' || a.state === 'rejected') {
    return res.status(400).json({ error: 'Bu ariza bo\'yicha qaror qabul qilingan' });
  }

  if (act === 'reject') {
    a.state = 'rejected';
    a.reason = String((req.body || {}).reason || '').slice(0, 60);
    a.decidedAt = new Date();
    await a.save();
    return res.json({ ok: true, state: a.state });
  }

  // Shu vakansiya bo'yicha ochiq tanlov bormi — bo'lsa unga qo'shamiz,
  // aks holda yangisini ochamiz. Har arizaga alohida tanlov yaratsak,
  // sizda o'nlab mayda tanlov yig'ilib ketardi.
  const v = await Vacancy.findOne({ agencyId, id: a.vacancyId }).lean();
  let sl = await Shortlist.findOne({
    agencyId, clientId: req.client.id, vacancyId: a.vacancyId, status: { $ne: 'done' }
  });

  if (!sl) {
    sl = await Shortlist.create({
      id: uuidv4(), agencyId, clientId: req.client.id,
      vacancyId: a.vacancyId,
      summary: (v && v.title) || 'Arizalar',
      items: [], status: 'new'
    });
  }
  if (!sl.items.some(i => i.candidateId === a.candidateId)) {
    sl.items.push({ candidateId: a.candidateId, state: 'selected' });
    sl.updatedAt = new Date();
    await sl.save();
  }

  a.state = 'shortlisted';
  a.shortlistId = sl.id;
  a.decidedAt = new Date();
  await a.save();

  await Candidate.updateOne(
    { restaurantId: agencyId, id: a.candidateId },
    { $addToSet: { shownToClients: req.client.id } }
  );

  // Sizga to'liq kontakt bilan xabar
  try {
    const agency = await Restaurant.findOne({ id: agencyId });
    // 'chat' deb atamaymiz — yuqorida chat SERVISI import qilingan.
    const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
    if (adminChat) {
      const c = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId },
        'fullName phone desiredPosition publicCode').lean();
      if (c) {
        await tg.sendMessage(tg.platformToken(), adminChat,
          `${req.client.name} arizachini tanladi\n` +
          `Vakansiya: ${(v && v.title) || '—'}\n` +
          `${'—'.repeat(22)}\n\n` +
          `${c.fullName || 'Nomsiz'} (${c.publicCode || '—'})\n` +
          `${c.desiredPosition || ''}\n📞 ${c.phone || 'telefon yo\'q'}`,
          { reply_markup: shortlistSvc.cbKeyboard(sl.id, a.candidateId) });
      }
    }
  } catch (e) { console.error('[MA] ariza xabari ketmadi:', e.message); }

  res.json({ ok: true, state: a.state, shortlistId: sl.id });
}));

// ── Kredit tarixi ──
router.get('/credits', clientGuard, asyncHandler(async (req, res) => {
  const rows = await credits.history(req.client.agencyId, req.client.id, 100);
  res.json(rows.map(r => ({
    delta: r.delta, reason: r.reason, balanceAfter: r.balanceAfter,
    note: r.note, createdAt: r.createdAt
  })));
}));

// ── Kredit so'rash ──
// To'lov tizimi hali yo'q — so'rov sizga xabar bo'lib keladi, qo'lda qo'shasiz.
router.post('/topup', clientGuard, asyncHandler(async (req, res) => {
  const want = Math.max(1, Math.min(parseInt((req.body || {}).amount, 10) || 10, 500));

  const agency = await Restaurant.findOne({ id: req.client.agencyId });
  const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
  if (adminChat) {
    await tg.sendMessage(tg.platformToken(), adminChat,
      `💳 Kredit so'rovi\n\n${req.client.name}\n` +
      `So'ralgan: ${want} kredit\nJoriy balans: ${req.client.credits}\n\n` +
      `Panel -> Mijozlar -> Kredit`).catch(() => {});
  }
  res.json({ ok: true });
}));

// ══ SUHBATLAR ═══════════════════════════════════════════════
// Tepada qadalgan "TalentHub ✓" (agentlik), ostida kontakt ochilgan
// nomzodlar. Suhbat kontakt ochilganda avtomatik ochiladi — mijoz
// o'zi boshlay olmaydi, chunki to'lanmagan nomzodga yozib bo'lmaydi.

router.get('/chats', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const rows = await chat.inboxForClient(agencyId, req.client.id);

  // Kontakt ochilgan nomzod — ISM va foto bilan (contactView qoidasi).
  // Kredit qaytarilgan bo'lsa kod qoladi: kontakt ham qaytarilgan.
  const ids = rows.filter(r => r.candidateId).map(r => r.candidateId);
  const [cands, pairs] = ids.length ? await Promise.all([
    Candidate.find({ restaurantId: agencyId, id: { $in: ids } },
      'id publicCode desiredPosition fullName hasPhoto').lean(),
    contactView.openPairs({ agencyId, clientId: req.client.id, candidateIds: ids })
  ]) : [[], []];
  const by = Object.fromEntries(cands.map(c => [c.id, c]));
  const open = new Set(pairs.map(p => p.candidateId));

  res.json(rows.map(r => {
    if (!r.candidateId) return r;
    const c = by[r.candidateId] || {};
    const isOpen = open.has(r.candidateId);
    return Object.assign({}, r, {
      title: (isOpen && c.fullName) || c.publicCode || '—',
      subtitle: r.lastMsgText || c.desiredPosition || '',
      position: c.desiredPosition || '',
      open: isOpen,
      hasPhoto: isOpen && !!c.hasPhoto
    });
  }));
}));

// ── Nomzod rezyumesi — faqat kontakt ochilgan bo'lsa ──
router.get('/candidates/:id', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  if (!await contactView.isOpenPair({ agencyId, clientId: req.client.id, candidateId: req.params.id })) {
    return res.status(403).json({ error: 'Kontakt ochilmagan' });
  }
  const c = await Candidate.findOne({ restaurantId: agencyId, id: req.params.id },
    '-fileData -rawText -photo -tgInviteToken').lean();
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  res.json(contactView.resumeOf(c));
}));

// ── Nomzod fotosi (chat va rezyume uchun) ──
// Kabinetdagi photo-sl tanlov id'siga bog'liq; chatda esa tanlov yo'q,
// shuning uchun tekshiruv to'g'ridan-to'g'ri "kontakt ochiqmi" bo'yicha.
router.get('/candidates/:id/photo', asyncHandler(async (req, res) => {
  const v = initData.verify(req.query.i || '');
  if (!v.ok) return res.status(401).end();
  const client = await Client.findOne({ tgChatId: String(v.user.id), status: 'active' });
  if (!client) return res.status(403).end();
  if (!await contactView.isOpenPair({ agencyId: client.agencyId, clientId: client.id, candidateId: req.params.id })) {
    return res.status(403).end();
  }

  const c = await Candidate.findOne({ restaurantId: client.agencyId, id: req.params.id }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

router.get('/chats/:id/messages', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  // clientId shart: boshqa mijozning suhbatini id bilan ocholmasin
  const th = await ChatThread.findOne({ agencyId, id: req.params.id, clientId: req.client.id });
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  const msgs = await chat.messages({ agencyId, threadId: th.id });
  await chat.markRead({ agencyId, threadId: th.id, side: 'client' });
  res.json({ id: th.id, kind: th.kind, state: th.state, messages: msgs });
}));

router.post('/chats/:id/messages', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const th = await ChatThread.findOne({ agencyId, id: req.params.id, clientId: req.client.id });
  if (!th) return res.status(404).json({ error: 'Suhbat topilmadi' });

  try {
    const m = await chat.post({ agencyId, threadId: th.id, from: 'client',
      text: (req.body || {}).text, appBase: publicBase(req) });
    res.json({ ok: true, id: m.id, createdAt: m.createdAt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

module.exports = router;
