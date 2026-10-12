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
const { ROLES } = require('../data/roles');

const ROLE_HINT = ROLES.map(r => `${r.key} (${r.label})`).join(', ');
const MAX_TURNS = 6;

const SYSTEM = `Sen TalentHub'ning HR agentisan. Restoran rahbarlari senga
xodim kerakligini aytadi, sen bazadan mos nomzodlarni topasan.

OHANG: qisqa va ishchan. Hamkasb kabi gapir, sotuvchi kabi emas.
Bir-ikki jumla yetarli. Foydalanuvchi qaysi tilda yozsa — o'sha tilda javob ber
(o'zbek yoki rus). Hissiyotli iboralar, undov belgilari va "men sizning shaxsiy
yordamchingizman" kabi gaplar KERAK EMAS.

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
  summary    - so'rovning bir jumlalik tavsifi (o'zbekcha)`;

const SCHEMA = {
  type: 'object',
  properties: {
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
  required: ['reply','intent','role','minExp','languages','location','shift','maxSalary','keywords','summary']
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
async function handleClient({ client, chatId, input }) {
  const conv = await loadConv(client, chatId);

  // ── Vakansiya shartlarini yig'ish bosqichi ──
  // Tanlov yuborilgandan keyin "nima taklif qilasiz?" so'raladi.
  // Javob AI'siz saqlanadi: bu erkin matn, tahlil shart emas.
  if (conv.stage === 'offer' && conv.shortlistId && input.text) {
    const offer = String(input.text).slice(0, 600);
    await Shortlist.updateOne(
      { agencyId: client.agencyId, id: conv.shortlistId },
      { $set: { offer, updatedAt: new Date() } }
    );

    // Sizga darhol yetib borsin: qo'ng'iroq qilayotganda nima
    // taklif qilinayotganini bilishingiz kerak
    try {
      const agency = await Restaurant.findOne({ id: client.agencyId });
      const adminChat = agency && agency.telegram && agency.telegram.adminChatId;
      if (adminChat) {
        await tg.sendMessage(tg.platformToken(), adminChat,
          `💼 ${client.name} taklif shartlarini yubordi:\n\n${offer}`);
      }
    } catch (e) { console.error('[AGENT] taklif xabari ketmadi:', e.message); }

    conv.stage = 'search';
    conv.shortlistId = '';
    conv.updatedAt = new Date();
    await conv.save();
    return { text: 'Yozib oldim. Nomzodlar bilan gaplashib, javobini yozaman.' };
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
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    json: true,
    schema: SCHEMA,
    maxTokens: 700,
    tier: input.audio ? 'smart' : 'fast',
    restaurantId: client.agencyId
  });

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
    return { text: reply || 'Kim kerakligini ayting — ofitsiant, xostes, menejer?' };
  }

  // ── Qidiruv ──
  const total = await candidateSearch.countFor(criteria, client.agencyId);

  if (!total) {
    const msg = (reply ? reply + '\n\n' : '') +
      'Shu shartlarga mos nomzod topilmadi. Shartlardan birini yumshataymizmi — ' +
      'masalan tajriba yoki hudud?';
    await remember(conv, userText, msg, criteria);
    return { text: msg };
  }

  const result = await candidateSearch.search(criteria, client.agencyId, { limit: 12 });
  const key = await saveSession(client, criteria, result.rows);

  const lines = [];
  if (reply) lines.push(reply);
  lines.push(`${total} ta mos nomzod bor.`);

  // Natija ko'p bo'lsa toraytirish taklif qilamiz. 30 tagacha bo'lsa
  // aralashmaymiz — odam o'zi ko'rib chiqa oladi, ortiqcha savol
  // bermaymiz.
  if (total > 30) {
    const f = await candidateSearch.facets(criteria, client.agencyId, total);
    if (f.length) {
      lines.push('', 'Toraytiramizmi?');
      for (const x of f) lines.push(`· ${x.label} — ${x.count} ta`);
      lines.push('', 'Yozib yuboring, yoki hammasini ko\'ring.');
    }
  }

  await remember(conv, userText, lines.join('\n'), criteria, total);
  return { text: lines.join('\n'), searchKey: key, count: Math.min(total, result.rows.length) };
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
      keywords: criteria.keywords
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

/** Tanlov yuborilgandan keyin vakansiya shartlarini so'rash rejimiga o'tadi. */
async function askOffer(chatId, shortlistId) {
  await Conversation.updateOne(
    { chatId },
    { $set: { stage: 'offer', shortlistId, updatedAt: new Date() } }
  );
}

module.exports = { handleClient, askOffer };
