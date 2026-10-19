// ── HR AGENTI (mijoz tomoni) ─────────────────────────────────
// Bot mijoz bilan forma emas, SUHBAT olib boradi: "ofitsiant kerak"
// desa darhol qidiradi, keyin toraytirish taklif qiladi.
//
// Asosiy qoida: AVVAL NATIJA, KEYIN SAVOL. Savollar bilan boshlasa
// bu formaning sekinroq ko'rinishi bo'lardi. Odam nimadir ko'rgandan
// keyingina toraytirishni xohlaydi.
//
// Raqamlarni AI aytmaydi — bazadan sanab olinadi. Aks holda bot
// "47 ta bor" deb o'ylab topardi.

const Conversation = require('../models/Conversation');
const SearchSession = require('../models/SearchSession');
const Shortlist = require('../models/Shortlist');
const Restaurant = require('../models/Restaurant');
const candidateSearch = require('./candidateSearch');
const relay = require('./botRelay');
const tg = require('./telegram');
const ai = require('./ai');
const vacAuto = require('./vacancyAuto');
const Client = require('../models/Client');
const { ROLES } = require('../data/roles');
const I18N = require('../../public/js/th-i18n');
const { placeLabel } = require('../utils/labels');

const ROLE_HINT = ROLES.map(r => `${r.key} (${r.label})`).join(', ');
const MAX_TURNS = 6;

// ── Javob tili ──
// Mijoz tilni o'zi tanlagan bo'lsa (Client.lang) — AI faqat shu tilda
// javob beradi: tizim qo'shadigan qatorlar ("12 ta mos nomzod bor")
// ham shu tilda, aralash chiqmasin. Tanlamagan bo'lsa — u yozgan tilda,
// va AI shu tilni qaytaradi (lang maydoni). Telegram tiliga ishonmaymiz:
// O'zbekistonda ko'p odamning Telegrami ruscha, o'zi esa o'zbekcha yozadi.
const LANG_NAME = { uz: 'o\'zbek', ru: 'rus' };
const langRule = fixed => fixed
  ? `JAVOB TILI: faqat ${LANG_NAME[fixed]} tilida (reply va summary). Foydalanuvchi
boshqa tilda yozsa ham shu tilda javob ber. lang maydoniga "${fixed}" yoz.`
  : `Foydalanuvchi qaysi tilda yozsa — o'sha tilda javob ber (o'zbek yoki rus);
reply va summary shu tilda. lang maydoniga shu tilni yoz: "uz" yoki "ru".`;

const SYSTEM = fixed => `Sen TalentHub'ning HR agentisan. Restoran rahbarlari senga
xodim kerakligini aytadi, sen bazadan mos nomzodlarni topasan.

OHANG: qisqa va ishchan. Hamkasb kabi gapir, sotuvchi kabi emas.
Bir-ikki jumla yetarli. Hissiyotli iboralar, undov belgilari va "men sizning
shaxsiy yordamchingizman" kabi gaplar KERAK EMAS.

${langRule(fixed)}

MUHIM QOIDALAR:
1. Nomzodlar sonini, ismini yoki ma'lumotini O'YLAB TOPMA. Raqamlarni tizim
   qo'shadi, sen faqat gapirasan.
2. Bir xabarda ko'pi bilan BITTA savol ber.
3. Lavozim aniq bo'lsa — darhol qidir (intent="search"). Savol berib
   turma: avval natija ko'rsatiladi, toraytirishni tizim o'zi taklif qiladi.
4. Lavozim noaniq bo'lsa (masalan "odam kerak") — faqat o'shanda so'ra.
5. Narx, muddat yoki kafolat VA'DA QILMA. So'rashsa: "HR javob beradi".
6. Mavzudan chetga chiqsa qisqa javob ber va ishga qaytar.

Mavjud lavozimlar: ${ROLE_HINT}

Senga JORIY MEZONLAR beriladi — foydalanuvchining yangi gapini ularga
QO'SHIB qaytar. "Kechki smena" desa, oldingi lavozim saqlanadi.
Butunlay boshqa lavozim aytsa — eskisini tashlab yangisini qo'y.

Maydonlar:
  reply      - foydalanuvchiga aytiladigan matn (qisqa)
  intent     - "search" (qidirish kerak) yoki "chat" (shunchaki javob)
  role       - lavozim kaliti yoki null
  minExp     - eng kam tajriba (yil) yoki null
  languages  - tillar massivi yoki []
  location   - hudud yoki null
  shift      - "kunduzgi" | "kechki" yoki null
  maxSalary  - maosh shifti (so'm) yoki null
  keywords   - qolgan muhim so'zlar massivi
  summary    - so'rovning bir jumlalik tavsifi (javob tilida)
  lang       - javob tili: "uz" yoki "ru"`;

const SCHEMA = {
  type: 'object',
  properties: {
    lang:      { type: 'string' },
    reply:     { type: 'string' },
    intent:    { type: 'string' },
    role:      { type: 'string', nullable: true },
    minExp:    { type: 'integer', nullable: true },
    languages: { type: 'array', items: { type: 'string' } },
    location:  { type: 'string', nullable: true },
    shift:     { type: 'string', nullable: true },
    maxSalary: { type: 'integer', nullable: true },
    keywords:  { type: 'array', items: { type: 'string' } },
    summary:   { type: 'string' }
  },
  required: ['lang','reply','intent','role','minExp','languages','location','shift','maxSalary','keywords','summary']
};

async function loadConv(client, chatId) {
  let c = await Conversation.findOne({ chatId });
  if (!c) {
    c = await Conversation.create({
      chatId, agencyId: client.agencyId, clientId: client.id, criteria: {}
    });
  }
  return c;
}

function historyText(turns) {
  if (!turns.length) return '(suhbat yangi)';
  return turns.map(t => `${t.r === 'u' ? 'Foydalanuvchi' : 'Sen'}: ${t.t}`).join('\n');
}

/**
 * Mijozning xabarini qayta ishlaydi.
 * @returns {Promise<{text:string, searchKey?:string, count?:number}>}
 */
async function handleClient({ client, chatId, input, lang = 'uz' }) {
  const conv = await loadConv(client, chatId);
  // Mijoz o'zi tanlagan til (bo'lmasa null — AI yozilgan tildan aniqlaydi).
  // lang — chaqiruvchining taxmini (Telegram tili), AI'siz javoblar uchun.
  const fixed = I18N.LANGS.includes(client.lang) ? client.lang : null;
  let L = fixed || lang;
  const T = (k, v) => I18N.t(L, k, v);

  // ── Vakansiya shartlarini yig'ish bosqichi ──
  // Tanlov yuborilgandan keyin "nima taklif qilasiz?" so'raladi.
  // Xom matn tanlovda qoladi (agentlik uchun), vakansiyaga esa AI
  // ajratgan SHABLON maydonlari yoziladi (vacancyAuto.applyOffer).
  if (conv.stage === 'offer' && conv.shortlistId && input.text) {
    const offer = String(input.text).slice(0, 600);
    await Shortlist.updateOne(
      { agencyId: client.agencyId, id: conv.shortlistId },
      { $set: { offer, updatedAt: new Date() } }
    );

    let applied = { vacancy: null, parsed: false };
    try {
      applied = await vacAuto.applyOffer({ agencyId: client.agencyId, shortlistId: conv.shortlistId, text: offer });
    } catch (e) { console.error('[AGENT] taklif vakansiyaga yozilmadi:', e.message); }
    const card = applied.vacancy && applied.parsed ? vacAuto.templateText(applied.vacancy, L) : '';
    // Agentlikka — o'zbekcha karta (admin xabari)
    const cardUz = card && L !== 'uz' ? vacAuto.templateText(applied.vacancy, 'uz') : card;

    // Sizga darhol yetib borsin: qo'ng'iroq qilayotganda nima
    // taklif qilinayotganini bilishingiz kerak
    try {
      const agency = await Restaurant.findOne({ id: client.agencyId });
      const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
      if (adminChat) {
        await tg.sendMessage(tg.platformToken(), adminChat,
          `💼 ${client.name} taklif shartlarini yubordi:\n\n${offer}` +
          (cardUz ? `\n\nVakansiyaga yozildi:\n${cardUz}` : ''));
      }
    } catch (e) { console.error('[AGENT] taklif xabari ketmadi:', e.message); }

    conv.stage = 'search';
    conv.shortlistId = '';
    conv.updatedAt = new Date();
    await conv.save();

    // Mijoz nima yozib olinganini ko'rsin — AI adashgan bo'lsa shu
    // yerda payqaydi va kabinetda tuzatadi
    // Yopiq vakansiya bo'lsa — ostida "E'lon qilish" tugmasi. Qaror shu
    // yerda qulay: mijoz shartlarni endigina ko'rdi, nimani e'lon
    // qilayotganini biladi. Kabinetdagi tugmani esa topmasligi mumkin.
    const hidden = card && applied.vacancy.listed === false;
    return {
      text: card
        ? T('ag.recorded', { card }) + (hidden ? T('ag.askPublish') : '')
        : T('ag.recordedShort'),
      publishVacancyId: hidden ? applied.vacancy.id : '',
      lang: L
    };
  }

  const userText = input.text || '[ovozli xabar]';

  const content = input.audio
    ? [{ audio: input.audio },
       `JORIY MEZONLAR: ${JSON.stringify(conv.criteria)}\n\n` +
       `OLDINGI SUHBAT:\n${historyText(conv.turns)}\n\n` +
       `Ovozli xabarni tingla va javob ber.`]
    : `JORIY MEZONLAR: ${JSON.stringify(conv.criteria)}\n\n` +
      `OLDINGI SUHBAT:\n${historyText(conv.turns)}\n\n` +
      `Foydalanuvchi: ${userText}`;

  const r = await ai.complete({
    system: SYSTEM(fixed),
    messages: [{ role: 'user', content }],
    json: true,
    schema: SCHEMA,
    maxTokens: 700,
    tier: input.audio ? 'smart' : 'fast',
    restaurantId: client.agencyId
  });

  // Tanlanmagan til — mijoz yozgan tildan. Bir marta saqlaymiz: keyingi
  // xabarlar, Mini App va bildirishnomalar ham shu tilda bo'ladi
  // (o'zgartirish — /til yoki Mini App). Juda qisqa gap ("ok", "ha") —
  // ishonchli belgi emas, saqlanmaydi; ovozli xabar esa — ishonchli.
  if (!fixed && I18N.LANGS.includes(r.lang)) {
    L = r.lang;
    const words = String(input.text || '').trim().split(/\s+/).filter(Boolean).length;
    if (input.audio || words >= 3) {
      await Client.updateOne({ agencyId: client.agencyId, id: client.id, lang: { $in: ['', null] } },
        { $set: { lang: r.lang } }).catch(e => console.error('[AGENT] til saqlanmadi:', e.message));
      client.lang = r.lang;
    }
  }

  const criteria = {
    // Model lavozimni har xil yozadi ("Хостес", "hostess") — bitta
    // kalitga keltirmasa filtr ishlamaydi
    role:      candidateSearch.normalizeRole(r.role),
    minExp:    r.minExp,
    languages: Array.isArray(r.languages) ? r.languages : [],
    location:  r.location,
    shift:     candidateSearch.normalizeShift(r.shift),
    maxSalary: r.maxSalary,
    keywords:  Array.isArray(r.keywords) ? r.keywords : [],
    summary:   r.summary || userText,
    limit:     null
  };

  const reply = String(r.reply || '').trim();

  // Lavozim yo'q — qidirib bo'lmaydi, AI savolini yuboramiz
  if (r.intent !== 'search' || !criteria.role) {
    await remember(conv, userText, reply, criteria);
    return { text: reply || T('ag.whoNeeded'), lang: L };
  }

  // ── Qidiruv ──
  // search() shartlarni bosqichma-bosqich yumshatadi. countFor esa
  // QAT'IY sanaydi. Ikkalasi kerak: qat'iy son nol bo'lsa ham
  // yumshatilgan natija foydali — "topilmadi" deb to'xtatish eng yomon
  // javob, chunki bazada mos odam bor, faqat bitta shart halaqit beradi.
  const total = await candidateSearch.countFor(criteria, client.agencyId);
  // 20 ta — Mini App'da aylantirib ko'rish qulay bo'lgan chegara.
  // Qolgani "Yana nomzodlar" tugmasi orqali.
  const result = await candidateSearch.search(criteria, client.agencyId, { limit: 20 });

  if (!result.rows.length) {
    const msg = (reply ? reply + '\n\n' : '') + T('ag.notFound');
    await remember(conv, userText, msg, criteria);
    return { text: msg, lang: L };
  }

  const key = await saveSession(client, criteria, result.rows);

  // Sahifalash holati: "Yana" bosilganda shu yerdan davom etadi
  conv.page = 0;
  conv.relaxFields = result.relaxFields || [];

  // Qat'iy son nol bo'lsa, yumshatilgan to'plamning haqiqiy hajmini
  // olamiz — "yana bormi?" degan savolga shu javob beradi.
  const pool = total || (await candidateSearch.page(criteria, client.agencyId,
    { skip: 0, limit: 1, relaxFields: conv.relaxFields })).total;

  const lines = [];
  if (reply) lines.push(reply);

  if (total) {
    lines.push(T('ag.total', { n: total }));
  } else {
    // Qat'iy shartga hech kim tushmadi, lekin yumshatib topildi.
    // Nimani hisobga olmaganimizni ochiq aytamiz — mijoz o'zi qaror
    // qilsin, biz shartni jimgina yo'qotmaymiz.
    const relaxed = (result.relaxFields || []).map(f => T('relax.' + f)).join(', ');
    lines.push(
      T('ag.relaxed', { x: relaxed || T('ag.relaxedSome') }),
      T('ag.closest', { n: result.rows.length }));
  }

  // Natija ko'p bo'lsa toraytirish taklif qilamiz. 30 tagacha bo'lsa
  // aralashmaymiz — odam o'zi ko'rib chiqa oladi, ortiqcha savol
  // bermaymiz.
  if (total > 30) {
    const f = await candidateSearch.facets(criteria, client.agencyId, total);
    if (f.length) {
      lines.push('', T('ag.narrow'));
      for (const x of f) lines.push(T('ag.facet', { label: facetLabel(x, L), n: x.count }));
      lines.push('', T('ag.narrowHint'));
    }
  }

  const shown = result.rows.length;
  const more = Math.max(0, pool - shown);
  if (more) lines.push('', T('ag.moreLeft', { n: more }));

  await remember(conv, userText, lines.join('\n'), criteria, total);
  // Tugmadagi son — haqiqatan ochiladigan nomzodlar soni
  return { text: lines.join('\n'), searchKey: key, count: shown, more, lang: L };
}

// Toraytirish varianti yozuvi — candidateSearch.facets kaliti bo'yicha
// (u o'zbekcha yorliq beradi; hudud — bazadagi nom)
function facetLabel(x, lang) {
  if (x.key === 'minExp') return I18N.t(lang, 'facet.minExp');
  if (x.key === 'shift_k') return I18N.t(lang, 'shiftT.kechki');
  if (x.key === 'shift_d') return I18N.t(lang, 'shiftT.kunduzgi');
  if (String(x.key).startsWith('loc_')) return placeLabel(x.label, lang);
  return x.label;
}

/**
 * "Yana ko'rsat" — xuddi shu mezonlar bo'yicha keyingi sahifa.
 * Mezonlar va yumshatish suhbatdan olinadi, qayta so'ralmaydi.
 */
async function morePage({ client, chatId, lang = 'uz' }) {
  const T = (k, v) => I18N.t(lang, k, v);
  const conv = await Conversation.findOne({ chatId, clientId: client.id });
  if (!conv || !conv.criteria || !conv.criteria.role) {
    return { text: T('ag.moreFirst') };
  }

  const criteria = { ...candidateSearch.EMPTY, ...conv.criteria };
  const nextPage = (conv.page || 0) + 1;
  const SIZE = 20;

  const r = await candidateSearch.page(criteria, client.agencyId, {
    skip: nextPage * SIZE, limit: SIZE, relaxFields: conv.relaxFields || []
  });

  if (!r.rows.length) {
    const msg = T('ag.noneLeft');
    await remember(conv, '[yana]', msg, criteria, conv.lastCount);
    return { text: msg };
  }

  const key = await saveSession(client, criteria, r.rows);
  conv.page = nextPage;

  const from = nextPage * SIZE + 1;
  const lines = [T('ag.range', { a: from, b: from + r.rows.length - 1, n: r.total })];
  if (r.hasMore) lines.push(T('ag.left', { n: r.total - (nextPage * SIZE + r.rows.length) }));

  await remember(conv, '[yana]', lines.join('\n'), criteria, conv.lastCount);
  return { text: lines.join('\n'), searchKey: key, count: r.rows.length, more: r.hasMore ? 1 : 0 };
}

async function saveSession(client, criteria, rows) {
  const key = relay.makeToken();
  await SearchSession.create({
    key,
    agencyId: client.agencyId,
    clientId: client.id,
    criteria: {
      role: criteria.role, minExp: criteria.minExp,
      languages: criteria.languages, location: criteria.location,
      keywords: criteria.keywords,
      // Tanlovdan avtomatik vakansiya yasalganda kerak (vacancyAuto)
      shift: criteria.shift, maxSalary: criteria.maxSalary
    },
    summary: criteria.summary,
    candidateIds: rows.map(r => r.id)
  });
  return key;
}

async function remember(conv, userText, botText, criteria, count) {
  conv.turns.push({ r: 'u', t: String(userText).slice(0, 400) });
  conv.turns.push({ r: 'b', t: String(botText).slice(0, 400) });
  if (conv.turns.length > MAX_TURNS) conv.turns = conv.turns.slice(-MAX_TURNS);
  conv.criteria = criteria;
  if (count != null) conv.lastCount = count;
  conv.updatedAt = new Date();
  await conv.save();
}

// ══ NOMZOD TOMONI ════════════════════════════════════════════
// Nomzod tugma bosmay yozishi mumkin: "maoshim 6 mln bo'ldi",
// "endi kechki smenada ishlayman". Bot tushunib profilni yangilaydi.
//
// MUHIM: bot relayni YUTIB YUBORMASLIGI kerak. Nomzodning savoli
// sizga yetib borishi shart — aks holda odam javobsiz qoladi va
// botni tashlab ketadi. Shubhali holatda doim sizga uzatiladi.

const CAND_SYSTEM = `Sen TalentHub'ning HR agentisan. Ish qidirayotgan odam
bilan gaplashyapsan. Uning profili bazada bor — u o'zgarish aytishi,
savol berishi yoki shunchaki yozishi mumkin.

OHANG: qisqa, iliq, ortiqcha rasmiyatchiliksiz. Bir-ikki jumla.
Foydalanuvchi qaysi tilda yozsa — o'sha tilda javob ber.

Sening vazifang — xabarni uch turga ajratish:

  "update"   - profilidagi ma'lumotni o'zgartirmoqchi
               ("maoshim 6 mln", "Chilonzorga ko'chdim", "ish topdim")
  "question" - savol beryapti yoki HR bilan gaplashmoqchi
               ("qachon javob berasiz?", "qanday ish bor?")
  "chat"     - salomlashish yoki qisqa gap

QOIDALAR:
1. Ish taklif qilma, maosh aytma, muddat va'da qilma. Bularni
   faqat HR biladi. So'rashsa: "HR javob beradi".
2. Ishonching komil bo'lmasa — "question" deb belgila. Savol HR'ga
   boradi, bu xavfsizroq.
3. Faqat AYTILGAN maydonni o'zgartir. Boshqasiga tegma.
4. "Ish topdim" yoki "qidirmayapman" desa — jobStatus = "not_looking".
   "Yana qidiryapman" desa — "active".

O'zgartirish mumkin bo'lgan maydonlar:
  phone, desiredPosition, location, shift, salaryExpectation,
  experienceYears, languages (massiv), skills (massiv),
  experienceSummary, jobStatus ("active"|"considering"|"not_looking")

reply - foydalanuvchiga aytiladigan matn.

Qolgan maydonlarni FAQAT o'zgartirilayotgan bo'lsa to'ldir, aks holda
null (massivlar uchun []) qoldir.`;

// Tekis sxema, hamma maydon required. Ichma-ich obyekt va majburiy
// bo'lmagan maydonlarda Gemini qismlarni tashlab ketadi — bu
// candidateSearch'da allaqachon sinalgan.
const CAND_SCHEMA = {
  type: 'object',
  properties: {
    reply:             { type: 'string' },
    intent:            { type: 'string' },
    phone:             { type: 'string', nullable: true },
    desiredPosition:   { type: 'string', nullable: true },
    location:          { type: 'string', nullable: true },
    shift:             { type: 'string', nullable: true },
    salaryExpectation: { type: 'string', nullable: true },
    experienceSummary: { type: 'string', nullable: true },
    jobStatus:         { type: 'string', nullable: true },
    experienceYears:   { type: 'integer', nullable: true },
    languages:         { type: 'array', items: { type: 'string' } },
    skills:            { type: 'array', items: { type: 'string' } }
  },
  required: ['reply','intent','phone','desiredPosition','location','shift',
             'salaryExpectation','experienceSummary','jobStatus','experienceYears',
             'languages','skills']
};

// Oq ro'yxat: AI boshqa maydonga tegib qo'ymasin (rol tasnifi, AI
// bahosi, manba — bular agentlikning tahlili)
const CAND_TEXT = ['phone','desiredPosition','location','shift','salaryExpectation','experienceSummary'];
const CAND_LIST = ['languages','skills'];
const CAND_STATUS = ['active','considering','not_looking'];

/**
 * Nomzodning xabarini qayta ishlaydi.
 * @returns {Promise<{text:string, forward:boolean, changed:string[]}>}
 */
async function handleCandidate({ cand, chatId, text }) {
  let conv = await Conversation.findOne({ chatId });
  if (!conv) {
    conv = await Conversation.create({
      chatId, agencyId: cand.restaurantId, candidateId: cand.id, criteria: {}
    });
  }

  const profile = {
    desiredPosition: cand.desiredPosition, location: cand.location,
    shift: cand.shift, salaryExpectation: cand.salaryExpectation,
    experienceYears: cand.experienceYears, languages: cand.languages,
    jobStatus: cand.jobStatus
  };

  const r = await ai.complete({
    system: CAND_SYSTEM,
    messages: [{ role: 'user', content:
      `UNING PROFILI: ${JSON.stringify(profile)}\n\n` +
      `OLDINGI SUHBAT:\n${historyText(conv.turns)}\n\n` +
      `Foydalanuvchi: ${text}` }],
    json: true,
    schema: CAND_SCHEMA,
    maxTokens: 600,
    tier: 'fast',
    restaurantId: cand.restaurantId
  });

  const reply = String(r.reply || '').trim();
  const u = r;                 // sxema tekis — maydonlar javobning o'zida
  const changed = [];

  if (r.intent === 'update') {
    for (const k of CAND_TEXT) {
      if (u[k] != null && String(u[k]).trim() && String(u[k]) !== String(cand[k] || '')) {
        cand[k] = String(u[k]).trim().slice(0, 200);
        changed.push(k);
      }
    }
    for (const k of CAND_LIST) {
      if (Array.isArray(u[k]) && u[k].length) {
        cand[k] = u[k].map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 30);
        changed.push(k);
      }
    }
    if (Number.isFinite(u.experienceYears) && u.experienceYears >= 0 && u.experienceYears <= 60) {
      cand.experienceYears = u.experienceYears;
      changed.push('experienceYears');
    }
    if (u.jobStatus && CAND_STATUS.includes(u.jobStatus)) {
      cand.jobStatus = u.jobStatus;
      cand.jobStatusAt = new Date();
      changed.push('jobStatus');
    }
    if (changed.length) {
      cand.updatedAt = new Date();
      await cand.save();
    }
  }

  conv.turns.push({ r: 'u', t: String(text).slice(0, 400) });
  conv.turns.push({ r: 'b', t: reply.slice(0, 400) });
  if (conv.turns.length > MAX_TURNS) conv.turns = conv.turns.slice(-MAX_TURNS);
  conv.candidateId = cand.id;
  conv.updatedAt = new Date();
  await conv.save();

  // Profil o'zgarmagan bo'lsa — xabar sizga boradi. Shubhada ham
  // shunday: javobsiz qolgan nomzod yo'qoladi.
  return {
    text: reply,
    forward: r.intent !== 'update' || !changed.length,
    changed
  };
}

/** Tanlov yuborilgandan keyin vakansiya shartlarini so'rash rejimiga o'tadi. */
async function askOffer(chatId, shortlistId) {
  await Conversation.updateOne(
    { chatId },
    { $set: { stage: 'offer', shortlistId, updatedAt: new Date() } }
  );
}

module.exports = { handleClient, handleCandidate, morePage, askOffer };
