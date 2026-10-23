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
const photoToken = require('../utils/photoToken');
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
const applyReveal = require('../services/applyReveal');
const { placeLabel, langsLabel } = require('../utils/labels');
const candidateSearch = require('../services/candidateSearch');
const relay = require('../services/botRelay');
const { isValidRole } = require('../data/roles');
const agent = require('../services/agent');
const chat = require('../services/chat');
const ChatThread = require('../models/ChatThread');
const { publicBase } = require('../utils/publicBase');
const appLife = require('../services/appLife');
const I18N = require('../../public/js/th-i18n');
const billing = require('../services/billing');
const PL = require('../data/plans');

const router = express.Router();

// ── Til ──
// req.lang — javobdagi matnlar (holat, rol, maosh, xato) shu tilda.
// Avval imzosiz initData'dan — FAQAT til uchun, limiter yoki guard rad
// etsa ham xato o'qiladigan tilda chiqsin. clientGuard keyin mijozning
// saqlangan tanlovi (Client.lang) bilan almashtiradi.
// Xatolar res.json ichida tarjima qilinadi: servislar o'zbekcha otadi
// (shortlist, credits, chat) va ularni har joyda ushlab o'tirmaymiz.
router.use((req, res, next) => {
  let code = '';
  try {
    const u = JSON.parse(new URLSearchParams(req.get('X-Telegram-Init-Data') || '').get('user') || 'null');
    code = (u && u.language_code) || '';
  } catch (e) { /* til taxmin qilinmaydi — o'zbekcha */ }
  req.lang = I18N.fromTelegram(code);
  const json = res.json.bind(res);
  res.json = body => json(body && typeof body.error === 'string'
    ? Object.assign({}, body, { error: I18N.errText(req.lang, body.error) })
    : body);
  next();
});
const tl = (req, key, vars) => I18N.t(req.lang, key, vars);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p so\'rov' }
});
router.use(limiter);

// initData'ni tekshirib, mijozni topadi. Har endpoint shundan boshlanadi.
// Kirish xatosi mijoz tilida va NIMA QILISH kerakligi bilan. Ilgari
// "Avtorizatsiya: imzo eskirgan" chiqardi — oddiy odamga tushunarsiz;
// eng ko'p uchraydigani — Mini App 24 soatdan ortiq ochiq turgani.
const AUTH_KEY = { 'imzo eskirgan': 'auth.expired', 'initData yo\'q': 'auth.none' };
const authText = (lang, err) => I18N.t(lang, AUTH_KEY[err] || 'auth.bad');

const clientGuard = asyncHandler(async (req, res, next) => {
  const raw = req.get('X-Telegram-Init-Data') || (req.body && req.body.initData) || '';
  const v = initData.verify(raw);
  if (!v.ok) {
    // Asl sabab (masalan 'Bot sozlanmagan' — server muammosi) logda qoladi
    console.warn('[MA] kirish rad etildi:', v.error);
    return res.status(401).json({ error: authText(req.lang, v.error), code: 'auth' });
  }

  // Rasm havolalari uchun qisqa muddatli token (utils/photoToken)
  res.set('X-Photo-Token', photoToken.sign(v.user.id));
  const client = await Client.findOne({ tgChatId: String(v.user.id) });
  if (!client) return res.status(403).json({ error: 'Mijoz topilmadi' });
  if (client.status !== 'active') {
    return res.status(403).json({
      error: client.status === 'blocked' ? 'Hisob to\'xtatilgan' : 'Hisob hali tasdiqlanmagan'
    });
  }
  req.client = client;
  // Tanlagan bo'lsa — o'sha; aks holda Telegram tili (yuqoridagi taxmin)
  if (I18N.LANGS.includes(client.lang)) req.lang = client.lang;
  // Telegram tili — bot bildirishnomalari uchun (u yerda initData yo'q).
  // Faqat o'zgarganda yoziladi: har so'rovda bazaga yozmaymiz.
  const tgLang = (v.user && v.user.language_code) || '';
  if (tgLang && tgLang !== client.tgLang) {
    Client.updateOne({ agencyId: client.agencyId, id: client.id }, { $set: { tgLang } })
      .catch(e => console.error('[MA] tgLang yozilmadi:', e.message));
  }
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

  // Anonim karta + kimlik qoidasi: oldin kontaktini ochgan nomzod qidiruvda
  // yana chiqsa — ism bilan; bir xil yozuv (lavozim, Toshkent, tillar)
  const ids = await identities(ses.agencyId, req.client.id, ordered, req.lang);
  const cards = anonymize.forClientList(ordered).map(card => Object.assign(card, ids[card.id], {
    roleLabel: ids[card.id].roleText,
    location: placeLabel(card.location, req.lang),
    languages: langsLabel(card.languages, req.lang)
  }));

  res.json({
    summary: ses.summary,
    credits: req.client.credits,
    clientName: req.client.name,
    lang: req.lang,
    candidates: cards
  });
}));

// ── Nomzod fotosi ──
// Alohida endpoint: faqat shu mijozning seansidagi nomzod uchun.
router.get('/photo/:key/:id', asyncHandler(async (req, res) => {
  const uid = photoToken.verify(req.query.t);
  if (!uid) return res.status(401).end();

  const client = await Client.findOne({ tgChatId: uid, status: 'active' });
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

  // Faqat shu seansdagi nomzodlar — mijoz boshqa id yubora olmasin.
  // Takror id bitta tanlovda ikki element (ikki kredit) bo'lmasin.
  const picked = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String))]
    .filter(id => ses.candidateIds.includes(id))
    .slice(0, 20);
  if (!picked.length) return res.status(400).json({ error: 'Nomzod tanlanmadi' });

  // Har tanlovning vakansiyasi bo'lsin — nomzod kontakt ochilgach
  // "qayerga, qanday shartda" ni ko'radi. Yiqilsa tanlov baribir saqlanadi.
  //   vakansiyadan qidiruv ("Mos nomzodlar") -> o'sha vakansiya
  //   bot qidiruvi                           -> topiladi yoki yasaladi
  let vacancyId = '', fromVacancy = null;
  try {
    if (ses.vacancyId) {
      fromVacancy = await Vacancy.findOne({
        agencyId: ses.agencyId, clientId: req.client.id, id: ses.vacancyId
      }).lean();
    }
    if (fromVacancy) {
      vacancyId = fromVacancy.id;
    } else {
      const v = await vacAuto.ensureFromSearch({
        agencyId: ses.agencyId, client: req.client, criteria: ses.criteria || {}
      });
      vacancyId = v.id;
    }
  } catch (e) {
    console.error('[MA] tanlov vakansiyaga bog\'lanmadi:', e.message);
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
        'id fullName phone email desiredPosition publicCode age location experienceYears experienceMonths'
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
           c.experienceYears ? c.experienceYears + ' yil tajriba' : (c.experienceMonths ? '1 yilgacha tajriba' : '')]
            .filter(Boolean).join(' · '),
          '',
          `📞 ${c.phone || 'telefon yo\'q'}`,
          c.email ? `✉️ ${c.email}` : ''
        ].filter(Boolean);

        // Har karta alohida: bittasi yiqilsa (429 qayta urinishdan keyin
        // ham) qolganlari baribir yetib borsin — ular tugma bilan keladi
        try {
          await tg.sendMessage(token, adminChat, parts.join('\n'),
            { reply_markup: shortlistSvc.cbKeyboard(sl.id, c.id) });
        } catch (e) {
          console.error('[MA] nomzod kartasi ketmadi:', c.id, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[MA] adminga xabar ketmadi:', e.message);   // tanlov baribir saqlangan
  }

  // Mijozdan vakansiya shartlarini so'raymiz — tanlovdan KEYIN.
  // Oldin so'rasak bu anketa bo'lardi; hozir esa tabiiy: odam tanladi,
  // endi "nima taklif qilasiz?" mantiqiy savol. Javob nomzodga
  // qo'ng'iroq qilganda kerak bo'ladi.
  //
  // Vakansiyadan qidirilgan va unda maosh bor bo'lsa — so'ramaymiz:
  // shartlar allaqachon yozilgan, ikkinchi marta so'rash bezovta qiladi.
  try {
    // Mijoz tilida (req.lang — Client.lang yoki Telegram tili)
    if (req.client.tgChatId) {
      const accepted = tl(req, 'slb.accepted', { n: picked.length });
      if (fromVacancy && (fromVacancy.salaryFrom || fromVacancy.salaryTo)) {
        await tg.sendMessage(tg.platformToken(), req.client.tgChatId,
          `${accepted}\n\n${tl(req, 'slb.willTalk', { v: vac.titleFor(fromVacancy, req.lang) })}`);
      } else {
        await agent.askOffer(req.client.tgChatId, sl.id);
        await tg.sendMessage(tg.platformToken(), req.client.tgChatId,
          `${accepted}\n\n${tl(req, 'slb.askOffer')}`);
      }
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

// Ichki holat -> mijozga ko'rinadigan guruh. Yozuvi lug'atda: 'cs.<holat>'.
const CLIENT_STATE = {
  selected: 'waiting', contacting: 'waiting', candidate_ok: 'waiting',
  candidate_no: 'no', revealed: 'open', interview: 'open',
  hired: 'hired', not_fit: 'no', refunded: 'refunded'
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
    plan: billing.planView(req.client),
    lang: req.lang,
    stats: {
      searches: rows.length,
      picked,
      revealed,
      avgHours: avg == null ? null : Math.round(avg * 10) / 10
    }
  });
}));

// ── Interfeys tili ──
// Mijozga yoziladi (brauzerga emas) — keyin bot xabarlari ham shu tilda.
router.patch('/lang', clientGuard, asyncHandler(async (req, res) => {
  const lang = String((req.body || {}).lang || '');
  if (!I18N.LANGS.includes(lang)) return res.status(400).json({ error: 'Amal noto\'g\'ri' });
  await Client.updateOne({ agencyId: req.client.agencyId, id: req.client.id }, { $set: { lang } });
  // Chatdagi "Kabinet" tugmasi ham yangi tilda
  if (req.client.tgChatId) {
    tg.setChatMenuButton(tg.platformToken(), req.client.tgChatId, I18N.t(lang, 'bot.menu'),
      `${publicBase(req)}/miniapp.html`).catch(e => console.error('[MA] menyu tugmasi:', e.message));
  }
  res.json({ ok: true, lang });
}));

// ── Tanlovlarim ──
router.get('/shortlists', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const rows = await Shortlist.find({ agencyId, clientId: req.client.id })
    .sort({ createdAt: -1 }).limit(50).lean();
  if (!rows.length) return res.json([]);

  res.json(await shortlistView(agencyId, req.client.id, rows, req.lang));
}));

// ── Tanlov elementlarining ko'rinishi ──
// Bitta joyda: "Tanlovlar" ekrani ham, vakansiya sahifasi ham shundan oladi —
// biri boshqacha ko'rsatib qo'ymasin.


// Lavozim — rezyumedagi xom matn ("Хостес") emas, rol bo'yicha bir xil
// lang — mijoz tili; rol yozuvi lug'atdan ('role.<kalit>')
function roleText(c, lang = 'uz') {
  if (isValidRole(c.role)) return I18N.t(lang, 'role.' + c.role);
  // Rol 'boshqa' — lavozimni rezyume matnidan taniymiz
  // ("Хостес" -> Xostess), aks holda mijozga xom ruscha matn chiqadi
  const g = vac.guessRole(c.desiredPosition);
  if (g) return I18N.t(lang, 'role.' + g);
  const d = String(c.desiredPosition || '').trim();
  return d ? d[0].toUpperCase() + d.slice(1) : I18N.t(lang, 'role.candidate');
}

// ── Nomzod "kimligi" — HAMMA JOYDA bitta qoida ──
// Kontakt ochilgan (contactView) — ism va telefon; aks holda null (anonim,
// kod). Lavozim — rol bo'yicha bir xil (roleText). Frontend whoOf() shundan
// sarlavha quradi: ochiq -> ism / lavozim, yopiq -> lavozim / kod.
// Ilgari Arizalar va qidiruv kartalari kontakt ochilgandan keyin ham
// kodni ko'rsatardi — har joy o'zicha anonim bo'lib qolgan edi.
async function identities(agencyId, clientId, cands, lang) {
  const ids = cands.map(c => c.id);
  if (!ids.length) return {};
  const [pairs, threads] = await Promise.all([
    contactView.openPairs({ agencyId, clientId, candidateIds: ids }),
    ChatThread.find({ agencyId, clientId, kind: 'cc', candidateId: { $in: ids } }, 'id candidateId').lean()
  ]);
  const open = new Set(pairs.map(p => p.candidateId));
  const tBy = Object.fromEntries(threads.map(t => [t.candidateId, t.id]));
  const out = {};
  for (const c of cands) {
    const o = open.has(c.id);
    out[c.id] = {
      roleText: roleText(c, lang),
      contact: o ? { fullName: c.fullName, phone: c.phone, email: c.email } : null,
      threadId: o ? (tBy[c.id] || '') : ''
    };
  }
  return out;
}

// Voronka bosqichi (bosqichlar chizig'i uchun). Kontaktgacha — null.
const STAGE = { revealed: 'contact', interview: 'interview', hired: 'hired', not_fit: 'not_fit' };

async function shortlistView(agencyId, clientId, rows, lang = 'uz') {
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap(r => r.items.map(i => i.candidateId)))];
  const vids = [...new Set(rows.map(r => r.vacancyId).filter(Boolean))];
  const [cands, vs, threads] = await Promise.all([
    Candidate.find({ restaurantId: agencyId, id: { $in: ids } },
      'id publicCode role desiredPosition age location experienceYears experienceMonths hasPhoto ' +
      'languages shift jobStatus fullName phone email').lean(),
    // role/shift — avtomatik sarlavhani mijoz tilida ko'rsatish uchun (titleFor)
    vids.length ? Vacancy.find({ agencyId, id: { $in: vids } }, 'id title status role shift').lean() : [],
    // "Yozish" tugmasi to'g'ridan-to'g'ri suhbatni ochishi uchun
    ChatThread.find({ agencyId, clientId, kind: 'cc', candidateId: { $in: ids } }, 'id candidateId').lean()
  ]);
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));
  const vById = Object.fromEntries(vs.map(v => [v.id, v]));
  const tBy = Object.fromEntries(threads.map(t => [t.candidateId, t.id]));

  return rows.map(r => ({
    id: r.id,
    summary: r.summary || I18N.t(lang, 'summary.default'),
    createdAt: r.createdAt,
    vacancyId: r.vacancyId || '',
    vacancyTitle: vById[r.vacancyId] ? vac.titleFor(vById[r.vacancyId], lang) : '',
    vacancyStatus: (vById[r.vacancyId] || {}).status || '',
    items: r.items.map(it => {
      const c = byId[it.candidateId] || {};
      const stKey = CLIENT_STATE[it.state] ? it.state : 'selected';
      // Kontakt kredit to'langandan keyin KO'RINIB TURAVERADI (3c6caca).
      // 'refunded' istisno — kredit qaytarilgan, kontakt ham qaytariladi.
      const open = contactView.isOpen(it);

      return {
        shortlistId: r.id,
        candidateId: it.candidateId,
        publicCode: c.publicCode || '',
        role: c.role || '',
        roleText: roleText(c, lang),
        desiredPosition: c.desiredPosition || '',
        age: c.age || null,
        location: placeLabel(c.location, lang),
        experienceYears: c.experienceYears || 0,
        experienceMonths: c.experienceMonths || 0,
        languages: c.languages || [],
        shift: c.shift || '',
        hasPhoto: !!c.hasPhoto,
        state: CLIENT_STATE[stKey],
        stateLabel: I18N.t(lang, 'cs.' + stKey),
        stage: open ? (STAGE[it.state] || 'contact') : null,
        // Lug'atda yo'q eski sabab bo'lsa — pipeline'dagi yozuv
        reason: !it.reason ? ''
          : (I18N.D.uz['reason.' + it.reason] ? I18N.t(lang, 'reason.' + it.reason) : pipeline.reasonLabel(it.reason)),
        interviewAt: it.interviewAt,
        canAct: ['revealed', 'interview'].includes(it.state),
        revealedAt: it.revealedAt,
        since: r.createdAt,                       // "HR bog'lanmoqda · 3 soat"
        threadId: open ? (tBy[it.candidateId] || '') : '',
        // Kontakt FAQAT ochilganda
        contact: open && c.id ? { fullName: c.fullName, phone: c.phone, email: c.email } : null
      };
    })
  }));
}

// ── Vakansiyadan qidiruv mezonlari ──
// AI'siz, to'g'ridan-to'g'ri maydonlardan. "Mos nomzodlar" ham, kartadagi
// "N mos" soni ham shundan — ikkalasi bir xil natija bersin.
function vacancyCriteria(v, excludeIds = []) {
  // EMPTY asosida: search() keywords/languages massiv bo'lishini kutadi
  return Object.assign({}, candidateSearch.EMPTY, {
    role: v.role,
    includeTest: !!v.isTest,           // sinov mijozining vakansiyasi — sinov nomzodi ham chiqadi
    minExp: v.minExp || null,
    languages: v.languages || [],
    location: v.location || null,
    shift: v.shift === 'kunduzgi' || v.shift === 'kechki' ? v.shift : null,
    maxSalary: v.salaryTo || null,
    excludeIds
  });
}

// ── Vakansiya voronkasi: mos · tanlangan · kontakt · ishga olindi ──
// "mos" — hali tanlanmagan, mezonga tushadigan nomzodlar (search bilan
// bir xil yumshatish). Faqat ochiq va lavozimi bor vakansiyada sanaladi.
async function funnelFor(agencyId, clientId, vacancies) {
  const ids = vacancies.map(v => v.id);
  if (!ids.length) return {};
  const [sls, apps] = await Promise.all([
    Shortlist.find({ agencyId, clientId, vacancyId: { $in: ids } }, 'vacancyId items').lean(),
    Application.aggregate([
      { $match: { agencyId, clientId, vacancyId: { $in: ids } } },
      { $group: { _id: '$vacancyId', n: { $sum: 1 }, fresh: { $sum: { $cond: [{ $eq: ['$state', 'new'] }, 1, 0] } } } }
    ])
  ]);
  const aBy = Object.fromEntries(apps.map(a => [a._id, a]));
  const out = {};
  for (const v of vacancies) {
    const items = sls.filter(s => s.vacancyId === v.id).flatMap(s => s.items || []);
    const picked = [...new Set(items.map(i => i.candidateId))];
    let mos = null;
    if (v.status === 'open' && isValidRole(v.role)) {
      try { mos = await candidateSearch.countRelaxed(vacancyCriteria(v, picked), agencyId); }
      catch (e) { console.error('[MA] mos sanog\'i:', e.message); }
    }
    out[v.id] = {
      mos,
      picked: picked.length,
      contact: items.filter(contactView.isOpen).length,
      hired: items.filter(i => i.state === 'hired').length,
      apps: (aBy[v.id] || {}).n || 0,
      appsNew: (aBy[v.id] || {}).fresh || 0
    };
  }
  return out;
}

// ── Kabinetdagi nomzod fotosi ──
// Qidiruvdagi foto endpointi seans kalitiga bog'langan, seans esa 24 soatda
// o'chadi. Kabinetda tanlov umrbod turadi, shuning uchun tekshiruv ham
// tanlov bo'yicha: nomzod shu mijozning tanlovida bo'lishi shart.
router.get('/photo-sl/:shortlistId/:id', asyncHandler(async (req, res) => {
  const uid = photoToken.verify(req.query.t);
  if (!uid) return res.status(401).end();

  const client = await Client.findOne({ tgChatId: uid, status: 'active' });
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

  // Voronka raqamlari — mijozga "N tanlov" emas, natija kerak
  const fun = await funnelFor(req.client.agencyId, req.client.id, rows);
  res.json(rows.map(v => vac.full(v, { funnel: fun[v.id] }, req.lang)));
}));

// ── Vakansiya sahifasi: shablon + voronka + shu vakansiyaning nomzodlari ──
router.get('/vacancies/:id/detail', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const v = await Vacancy.findOne({ agencyId, clientId: req.client.id, id: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const [fun, sls] = await Promise.all([
    funnelFor(agencyId, req.client.id, [v]),
    Shortlist.find({ agencyId, clientId: req.client.id, vacancyId: v.id }).sort({ createdAt: -1 }).lean()
  ]);
  const view = await shortlistView(agencyId, req.client.id, sls, req.lang);
  // Bir nomzod bir necha tanlovda bo'lsa — eng yangisi
  const seen = new Set();
  const items = view.flatMap(s => s.items).filter(it => !seen.has(it.candidateId) && seen.add(it.candidateId));

  res.json({ vacancy: vac.full(v, { funnel: fun[v.id] }, req.lang), items });
}));

// Formadagi avtomatik sarlavha mijoz tilida keladi ("Официант, вечерняя
// смена"). Bazaga o'zbekcha shakl yoziladi: aks holda PATCH uni "qo'lda
// o'zgartirilgan" deb source='manual' qilib qo'yardi va agentlik/bot
// xabarlarida ruscha chiqardi. Ko'rsatishda vac.full() o'quvchi tiliga qaytaradi.
function autoTitleUz(data, prev = {}) {
  // Sharoitlar ham: forma rus tilida "Питание · Форма" qaytaradi
  if (data.conditions) data.conditions = I18N.perksText(data.conditions, 'uz');
  if (!data.title) return;
  const role = data.role !== undefined ? data.role : prev.role;
  const shift = data.shift !== undefined ? data.shift : prev.shift;
  if (I18N.LANGS.some(l => data.title === I18N.vacTitle(role, shift, l))) {
    data.title = I18N.vacTitle(role, shift, 'uz');
  }
}

router.post('/vacancies', clientGuard, asyncHandler(async (req, res) => {
  const data = vac.clean(req.body || {});
  if (!data.title) return res.status(400).json({ error: 'Vakansiya nomini yozing' });
  autoTitleUz(data);

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

  res.json(vac.full(v, {}, req.lang));
}));

router.patch('/vacancies/:id', clientGuard, asyncHandler(async (req, res) => {
  const v = await Vacancy.findOne({
    agencyId: req.client.agencyId, clientId: req.client.id, id: req.params.id
  });
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });

  const data = vac.clean(req.body || {}, v.toObject());
  autoTitleUz(data, v);
  // Mijoz sarlavhani o'zi o'zgartirsa — endi u qo'lda yozilgan vakansiya,
  // shablon keyingi taklifda sarlavhani qayta yasab, uni bosib ketmasin
  if (v.source === 'search' && data.title && data.title !== v.title) v.source = 'manual';
  Object.assign(v, data);
  v.updatedAt = new Date();
  await v.save();
  res.json(vac.full(v, {}, req.lang));
}));

// Tasdiqlash — "bu o'rin hali ochiq". Nomzod kartada "2 kun oldin
// tasdiqlangan" deb ko'radi, soxta e'lon muammosi shunday yopiladi.
// ── Mos nomzodlar — vakansiyadan qidiruv ──
// Botdagi qidiruvning teskari kirishi: u yerda gapdan vakansiya
// yasaladi, bu yerda vakansiyadan qidiruv. Ikkalasi bir xil seans va
// anonim kartalarga olib keladi, tanlov esa shu vakansiyaga bog'lanadi.
// Mezonlar AI'siz, to'g'ridan-to'g'ri vakansiya maydonlaridan olinadi.
router.post('/vacancies/:id/matches', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const v = await Vacancy.findOne({ agencyId, clientId: req.client.id, id: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
  if (v.status === 'closed') return res.status(400).json({ error: 'Vakansiya yopilgan' });
  if (!isValidRole(v.role)) {
    return res.status(400).json({ error: 'Vakansiyada lavozim ko\'rsatilmagan — "Tahrirlash" orqali tanlang' });
  }

  // Shu vakansiyaga allaqachon tanlanganlar qayta chiqmasin
  const prev = await Shortlist.find({ agencyId, clientId: req.client.id, vacancyId: v.id }, 'items.candidateId').lean();
  const excludeIds = [...new Set(prev.flatMap(s => (s.items || []).map(i => i.candidateId)))];

  const criteria = vacancyCriteria(v, excludeIds);
  const result = await candidateSearch.search(criteria, agencyId, { limit: 20 });
  if (!result.rows.length) {
    return res.json({ key: '', count: 0,
      message: tl(req, excludeIds.length ? 'match.noneNew' : 'match.noneYet') });
  }

  // Yumshatilgan bo'lsa ochiq aytamiz — shartni jimgina yo'qotmaymiz.
  // Seans xulosasi mijoz tilida saqlanadi (seans 24 soat yashaydi).
  const relaxed = (result.relaxFields || []).map(f => tl(req, 'relax.' + f));
  const note = relaxed.length ? tl(req, 'match.relaxed', { x: relaxed.join(', ') }) : '';
  const key = relay.makeToken();
  await SearchSession.create({
    key, agencyId, clientId: req.client.id,
    criteria: { role: criteria.role, minExp: criteria.minExp, languages: criteria.languages,
                location: criteria.location, shift: criteria.shift, maxSalary: criteria.maxSalary, keywords: [] },
    summary: vac.titleFor(v, req.lang) + note,
    candidateIds: result.rows.map(r => r.id),
    vacancyId: v.id
  });
  res.json({ key, count: result.rows.length, relaxed: result.relaxed });
}));

router.post('/vacancies/:id/confirm', clientGuard, asyncHandler(async (req, res) => {
  const v = await Vacancy.findOneAndUpdate(
    { agencyId: req.client.agencyId, clientId: req.client.id, id: req.params.id },
    { $set: { confirmedAt: new Date(), updatedAt: new Date() } },
    { new: true }
  );
  if (!v) return res.status(404).json({ error: 'Vakansiya topilmadi' });
  res.json(vac.full(v, {}, req.lang));
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
  res.json({ vacancy: vac.full(v, {}, req.lang), items: await appsView(agencyId, req.client.id, apps, req.lang) });
}));

// ── Barcha arizalar — "Arizalar" bo'limi ──
// Har kuni ishlatiladi, shuning uchun alohida tab (Balans o'rnida).
// Vakansiya bo'yicha guruhlash frontend'da; bu yerda vakansiya nomi beriladi.
router.get('/applications', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const apps = await Application.find({ agencyId, clientId: req.client.id })
    .sort({ createdAt: -1 }).limit(200).lean();
  const vids = [...new Set(apps.map(a => a.vacancyId))];
  const vs = vids.length ? await Vacancy.find({ agencyId, id: { $in: vids } }, 'id title status role shift').lean() : [];
  const vBy = Object.fromEntries(vs.map(v => [v.id, v]));
  const items = await appsView(agencyId, req.client.id, apps, req.lang);
  res.json(items.map(it => Object.assign(it, {
    vacancyTitle: vBy[it.vacancyId] ? vac.titleFor(vBy[it.vacancyId], req.lang) : tl(req, 'vacancy.default'),
    vacancyStatus: (vBy[it.vacancyId] || {}).status || ''
  })));
}));

// applyReveal sababi mijoz tilida (kod -> lug'at 'why.<kod>')
const whyText = (lang, el) => el.code
  ? I18N.t(lang, 'why.' + el.code, { n: applyReveal.FRESH_DAYS })
  : (el.why || '');

// Ariza elementlarining ko'rinishi — ikkala endpoint uchun bitta.
// Arizachi ANONIM (anonymize). Ochilganda 'new' -> 'seen' bo'ladi:
// nomzod "Ko'rildi" holatini ko'radi, mijozdagi qizil belgi o'chadi.
async function appsView(agencyId, clientId, apps, lang = 'uz') {
  if (!apps.length) return [];
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
  const ids = await identities(agencyId, clientId, cands, lang);

  return apps.map(a => {
    const c = byId[a.candidateId];
    // Kontaktni o'zi ocha oladimi (applyReveal). Faqat qaror qilinmagan
    // arizada; "why" — nega oddiy yo'l (HR tekshiradi) ekanini aytadi.
    const open = a.state !== 'shortlisted' && a.state !== 'rejected';
    const el = open && c ? applyReveal.eligibility(a, c) : { ok: false, why: '' };
    const ac = c ? anon[c.publicCode] || null : null;
    // Bir xil yozuv + kimlik qoidasi (kontakt ochilgan bo'lsa — ism, chat)
    if (ac) {
      Object.assign(ac, ids[c.id]);
      ac.location = placeLabel(ac.location, lang); ac.languages = langsLabel(ac.languages, lang); ac.roleLabel = ac.roleText;
    }
    return {
      id: a.id,
      vacancyId: a.vacancyId,
      state: a.state === 'new' ? 'seen' : a.state,
      isNew: a.state === 'new',            // shu ochilishda birinchi marta ko'rildi
      message: a.message,
      createdAt: a.createdAt,
      instant: el.ok,
      why: el.ok ? '' : whyText(lang, el),
      candidate: ac
    };
  });
}

// ── Arizachini tanlash yoki rad etish ──
router.post('/applications/:id/:action', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId;
  const act = req.params.action;
  // pick   — tanlash, agentlik tekshiradi (oddiy yo'l)
  // open   — kontaktni mijoz O'ZI ochadi (yangi ariza, -1 kredit, applyReveal)
  // reject — rad etish
  if (!['pick', 'open', 'reject'].includes(act)) return res.status(400).json({ error: 'Amal noto\'g\'ri' });

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
    // Nomzodga yumshoq xabar (appLife) — "Arizalarim"da ham ko'rinadi
    const rv = await Vacancy.findOne({ agencyId, id: a.vacancyId }, 'title').lean();
    const rc = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId }, 'id tgChatId tgState').lean();
    await appLife.notify(rc, 'rejected', { vacTitle: rv && rv.title, appBase: publicBase(req) });
    return res.json({ ok: true, state: a.state });
  }

  // Arizadan o'zi ochish: shart SERVERDA qayta tekshiriladi — tugma
  // ko'rinishiga ishonmaymiz. Kredit oldindan tekshiriladi: yetmasa ariza
  // "tanlangan" bo'lib qolib, mijozga xato chiqmasin (reveal() baribir
  // atomik yechadi — bu faqat tushunarli xabar uchun).
  if (act === 'open') {
    const cand = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId },
      'id phone jobStatus jobStatusAt').lean();
    const el = applyReveal.eligibility(a, cand);
    if (!el.ok) return res.status(400).json({ error: whyText(req.lang, el) });
    if ((req.client.credits || 0) < 1) {
      return res.status(400).json({ error: 'Kredit yetarli emas', noCredits: true });
    }
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

  if (act === 'open') {
    // Oddiy kontakt ochish oqimi: atomik band qilish, -1 kredit, chat,
    // mijoz va nomzodga xabar — hammasi reveal() da, bu yerda takrorlamaymiz
    let r;
    try {
      r = await shortlistSvc.reveal({ agencyId, shortlistId: sl.id, candidateId: a.candidateId,
        appBase: publicBase(req), viaApplication: true });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    // Sizga — nazoratdan chiqmaysiz, lekin tugma kerak emas: kontakt ochilgan
    try {
      const agency = await Restaurant.findOne({ id: agencyId });
      const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
      const c = r.candidate;
      if (adminChat && c && !r.already) {
        await tg.sendMessage(tg.platformToken(), adminChat,
          `✅ ${req.client.name} arizadan kontaktni o'zi ochdi (-1 kredit)\n` +
          `Vakansiya: ${(v && v.title) || '—'}\n\n` +
          `${c.fullName || 'Nomsiz'} (${c.publicCode || '—'})\n📞 ${c.phone || 'telefon yo\'q'}\n` +
          `Mijoz balansi: ${r.balance} kredit`);
      }
    } catch (e) { console.error('[MA] ochish xabari ketmadi:', e.message); }

    return res.json({ ok: true, state: a.state, shortlistId: sl.id, candidateId: a.candidateId,
      balance: r.balance, already: !!r.already });
  }

  // Nomzodga: arizasi ish beruvchiga o'tdi ('open' yo'lida reveal() o'zi
  // restoran nomi bilan xabar beradi — bu yerda faqat 'pick')
  {
    const pc = await Candidate.findOne({ restaurantId: agencyId, id: a.candidateId }, 'id tgChatId tgState').lean();
    await appLife.notify(pc, 'proposed', { vacTitle: v && v.title, appBase: publicBase(req) });
  }

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

// ── Tariflar: ro'yxat, holat, ulangan to'lov usullari ──
// providers bo'sh — to'lov tizimi hali ulanmagan: Mini App qo'lda so'rov yuboradi
router.get('/plans', clientGuard, asyncHandler(async (req, res) => {
  const Order = require('../models/Order');
  const pending = await Order.findOne({ agencyId: req.client.agencyId, clientId: req.client.id, status: 'pending', provider: 'manual' },
    'id planKey createdAt').sort({ createdAt: -1 }).lean();
  res.json({
    plans: PL.PLAN_KEYS.map(k => PL.PLANS[k]),
    trial: PL.TRIAL,
    current: billing.planView(req.client),
    credits: req.client.credits,
    providers: billing.providers(),
    pendingManual: pending ? { id: pending.id, planKey: pending.planKey, createdAt: pending.createdAt } : null
  });
}));

// ── Tarif sotib olish: buyurtma + to'lov havolasi (yoki qo'lda so'rov) ──
router.post('/orders', clientGuard, asyncHandler(async (req, res) => {
  const b = req.body || {};
  try {
    const o = await billing.createOrder({ client: req.client, planKey: String(b.plan || ''), provider: String(b.provider || 'manual') });
    // To'lovdan keyin — botga qaytadi: u yerda "tarif yoqildi" xabari turadi
    const back = 'https://t.me/' + ((await tg.platformUsername().catch(() => '')) || 'TalentHubUzBot');
    res.json({ id: o.id, provider: o.provider, amount: o.amount, url: billing.checkoutUrl(o, back) });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));

// ── Bepul sinov: 3 kredit, 7 kun (bir marta) ──
router.post('/trial', clientGuard, asyncHandler(async (req, res) => {
  try { const r = await billing.startTrial(req.client); res.json({ ok: true, balance: r.balance, endsAt: r.endsAt }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
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
    // Qadalgan agentlik: xabar bo'lmasa taklif matni — mijoz tilida
    if (!r.candidateId) {
      return r.pinned && !r.lastMsgText ? Object.assign({}, r, { subtitle: tl(req, 'chat.helpPrompt') }) : r;
    }
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

// Mijoz bu nomzodni ko'rishga haqlimi: tanlovida bor yoki uning
// vakansiyasiga ariza bergan. Boshqa nomzodni id bilan ochib bo'lmasin.
async function clientKnows(agencyId, clientId, candidateId) {
  const [s, a] = await Promise.all([
    Shortlist.exists({ agencyId, clientId, 'items.candidateId': candidateId }),
    Application.exists({ agencyId, clientId, candidateId })
  ]);
  return !!(s || a);
}

// ── Nomzod rezyumesi ──
// Kontakt ochilgan — to'liq (ism, telefon). Ungacha — ANONIM, qidiruv
// kartasi bilan bir xil: anonymize'dan o'tadi (ism yo'q, matnlardagi ism
// kod bilan almashtirilgan). Mijoz kimni tanlaganini ko'rib turadi.
router.get('/candidates/:id', clientGuard, asyncHandler(async (req, res) => {
  const agencyId = req.client.agencyId, id = req.params.id;
  const open = await contactView.isOpenPair({ agencyId, clientId: req.client.id, candidateId: id });
  if (!open && !await clientKnows(agencyId, req.client.id, id)) {
    return res.status(404).json({ error: 'Nomzod topilmadi' });
  }
  const c = await Candidate.findOne({ restaurantId: agencyId, id },
    '-fileData -rawText -photo -tgInviteToken').lean();
  if (!c) return res.status(404).json({ error: 'Nomzod topilmadi' });
  // Bir xil yozuv: lavozim rol bo'yicha, "Toshkent", tillar o'zbekcha —
  // rezyume hh'dan ruscha kelsa ham mijozga aralash til chiqmasin
  const same = { roleText: roleText(c, req.lang), location: placeLabel(c.location, req.lang),
                 languages: langsLabel(c.languages, req.lang) };
  if (open) return res.json(Object.assign(contactView.resumeOf(c), same, { open: true }));

  await assignCodes(agencyId, [c]);
  const a = anonymize.forClient(c);
  // AI bahosi (fitScore/fitReason) agentlikning ichki fikri — rezyumega kirmaydi
  delete a.fitScore; delete a.fitReason;
  res.json(Object.assign(a, same, { open: false }));
}));

// ── Nomzod fotosi (chat, rezyume, arizalar uchun) ──
// Kabinetdagi photo-sl tanlov id'siga bog'liq; chat va arizada tanlov
// yo'q. Foto qidiruv kartasida ham ko'rinadi (anonim emas), shuning uchun
// shart: nomzod shu mijozning tanlovida yoki unga ariza bergan.
router.get('/candidates/:id/photo', asyncHandler(async (req, res) => {
  const uid = photoToken.verify(req.query.t);
  if (!uid) return res.status(401).end();
  const client = await Client.findOne({ tgChatId: uid, status: 'active' });
  if (!client) return res.status(403).end();
  if (!await clientKnows(client.agencyId, client.id, req.params.id)) return res.status(403).end();

  const c = await Candidate.findOne({ restaurantId: client.agencyId, id: req.params.id }, 'photo').lean();
  if (!c || !c.photo) return res.status(404).end();
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(c.photo);
  if (!m) return res.status(404).end();
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
}));

// ── O'qilmaganlar soni — pastki paneldagi qizil nuqta uchun ──
// Yengil: inbox'ni (backfill, nomzodlar) yuklamaydi, faqat sanaydi.
// Mini App'ning o'z push'i yo'q — kirganda darhol ko'rinadigan nuqta
// odamni suhbatga qaytaradi.
router.get('/unread', clientGuard, asyncHandler(async (req, res) => {
  const [r, apps] = await Promise.all([
    ChatThread.aggregate([
      { $match: { agencyId: req.client.agencyId, clientId: req.client.id, unreadClient: { $gt: 0 } } },
      { $group: { _id: null, n: { $sum: '$unreadClient' } } }
    ]),
    // Ko'rilmagan arizalar — "Vakansiya" tabidagi nuqta. Arizalar ro'yxati
    // ochilganda ular 'seen' bo'ladi (GET .../applications).
    Application.countDocuments({ agencyId: req.client.agencyId, clientId: req.client.id, state: 'new' })
  ]);
  res.json({ chats: (r[0] && r[0].n) || 0, apps });
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
