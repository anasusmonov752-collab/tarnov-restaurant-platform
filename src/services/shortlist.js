// ── TANLOV USTIDA AMALLAR ────────────────────────────────────
// Mijoz Mini App'da nomzodlarni tanlaydi -> siz nomzod bilan gaplashasiz
// -> rozi bo'lsa kontakt ochiladi va kredit yechiladi.
//
// Bu fayl AYNAN shu mantiqni saqlaydi, chunki uni IKKI joydan chaqiramiz:
//   1. sayt    — /api/shortlists/:id/reveal/:candidateId
//   2. Telegram — xabardagi inline tugma
// Mantiq ikkiga bo'linsa, bir kun bittasida kredit yechilmay qoladi.

const Shortlist = require('../models/Shortlist');
const Candidate = require('../models/Candidate');
const Client = require('../models/Client');
const credits = require('./credits');
const tg = require('./telegram');

// Nomzod bosqichlari. 'revealed' va 'refunded' — yakuniy, qo'lda qo'yilmaydi.
const MANUAL_STATES = ['selected', 'contacting', 'candidate_ok', 'candidate_no'];

function isManualState(s) { return MANUAL_STATES.includes(s); }

// ── Nomzod holatini qo'lda o'zgartirish ──
async function setItemState({ agencyId, shortlistId, candidateId, state, note = '' }) {
  if (!isManualState(state)) throw new Error('Holat noto\'g\'ri');

  // Ochilgan/qaytarilgan nomzodni orqaga qaytarib bo'lmaydi — pul
  // harakatlangan, tarix buzilmasligi kerak.
  const sl = await Shortlist.findOneAndUpdate(
    {
      agencyId, id: shortlistId,
      items: { $elemMatch: { candidateId, state: { $nin: ['revealed', 'refunded'] } } }
    },
    { $set: { 'items.$.state': state, 'items.$.note': note, updatedAt: new Date() } },
    { new: true }
  );

  if (!sl) {
    const exists = await Shortlist.findOne({ agencyId, id: shortlistId, 'items.candidateId': candidateId });
    throw new Error(exists ? 'Kontakt allaqachon ochilgan — holatni o\'zgartirib bo\'lmaydi' : 'Tanlov yoki nomzod topilmadi');
  }
  return sl;
}

// ── Kontaktni mijozga ochish (-1 kredit) ──
//
// Tartib muhim:
//   1. nomzodni atomik "band qilamiz" (ikki parallel so'rov ikki marta
//      yechmasin)
//   2. kredit yechamiz
//   3. yechilmasa — bandlikni bekor qilamiz
//   4. mijozga xabar yuboramiz (bu bosqich yiqilsa ham ochilgan holda qoladi:
//      kontakt kabinetda ko'rinadi, kredit bekorga ketmaydi)
async function reveal({ agencyId, shortlistId, candidateId }) {
  const now = new Date();

  // Oldingi holatni band qilishdan OLDIN o'qiymiz — kredit yetmay qolsa
  // aynan shu holatga qaytaramiz. Qattiq 'candidate_ok' yozsak, 'selected'
  // dan ochishga urinilganda holat noto'g'ri o'zgarib qolardi.
  const before = await Shortlist.findOne(
    { agencyId, id: shortlistId, 'items.candidateId': candidateId },
    { 'items.$': 1 }
  ).lean();
  const prevState = (before && before.items && before.items[0] && before.items[0].state) || 'candidate_ok';

  const claimed = await Shortlist.findOneAndUpdate(
    {
      agencyId, id: shortlistId,
      items: { $elemMatch: { candidateId, state: { $ne: 'revealed' } } }
    },
    { $set: { 'items.$.state': 'revealed', 'items.$.revealedAt': now, updatedAt: now } },
    { new: true }
  );

  // Band qilib bo'lmadi — yo allaqachon ochilgan, yo umuman yo'q
  if (!claimed) {
    const sl = await Shortlist.findOne({ agencyId, id: shortlistId, 'items.candidateId': candidateId });
    if (!sl) throw new Error('Tanlov yoki nomzod topilmadi');
    return { already: true, shortlist: sl };      // takroriy bosish — pul yechilmaydi
  }

  let balance;
  try {
    const r = await credits.reveal({ agencyId, clientId: claimed.clientId, shortlistId, candidateId });
    balance = r.balance;
  } catch (e) {
    // Kredit yetmadi — bandlikni qaytaramiz, aks holda nomzod "ochilgan"
    // bo'lib qoladi-yu, mijoz uni ko'rmaydi.
    await Shortlist.updateOne(
      { agencyId, id: shortlistId, 'items.candidateId': candidateId },
      { $set: { 'items.$.state': prevState, 'items.$.revealedAt': null } }
    );
    throw e;
  }

  const cand = await Candidate.findOne({ restaurantId: agencyId, id: candidateId }).lean();
  await notifyClient({ agencyId, clientId: claimed.clientId, cand, balance });

  return { already: false, shortlist: claimed, balance, candidate: cand, prevState };
}

// ── Ochilgan kontaktni mijozga yuborish ──
// Yiqilsa throw qilmaydi: kontakt ochilgan, kredit yechilgan — xabar
// ketmagani butun amalni bekor qilishga asos emas.
async function notifyClient({ agencyId, clientId, cand, balance }) {
  try {
    const client = await Client.findOne({ agencyId, id: clientId }).lean();
    if (!client || !client.tgChatId || !cand) return;

    const lines = [
      `✅ Kontakt ochildi — ${cand.publicCode || ''}`,
      '',
      cand.fullName || 'Nomsiz',
      cand.desiredPosition || '',
      '',
      `📞 ${cand.phone || 'telefon yo\'q'}`
    ];
    if (cand.email) lines.push(`✉️ ${cand.email}`);
    lines.push('', `Balans: ${balance} kredit`);
    lines.push('Nomzod siz bilan bog\'lanishni kutmoqda — biz u bilan gaplashdik.');

    await tg.sendMessage(tg.platformToken(), client.tgChatId, lines.join('\n'));
  } catch (e) {
    console.error('[SL] mijozga kontakt xabari ketmadi:', e.message);
  }
}

// ── Telegram inline tugma formati ────────────────────────────
// callback_data 64 baytdan oshmasligi kerak, UUID esa 36 ta belgi —
// ikkitasi sig'maydi. Har ikkalasining birinchi 8 belgisini yuboramiz,
// prefiks bo'yicha topamiz. 8 ta hex = 4 mlrd variant, bitta agentlik
// ichida to'qnashuv amalda bo'lmaydi.
//
//   r:<sl8>:<c8>  — kontaktni och (-1 kredit)
//   n:<sl8>:<c8>  — nomzod rozi emas (kredit yechilmaydi)
//
// Format shu yerda turadi: uni yuboruvchi (miniapp) va qabul qiluvchi
// (telegram webhook) alohida fayllarda, ikki joyda yozilsa ajralib ketadi.
const CB_RE = /^([rn]):([0-9a-f]{8}):([0-9a-f]{8})$/;

function cbData(action, shortlistId, candidateId) {
  return `${action}:${shortlistId.slice(0, 8)}:${candidateId.slice(0, 8)}`;
}

function parseCb(data) {
  const m = CB_RE.exec(String(data || ''));
  return m ? { action: m[1], sl8: m[2], c8: m[3] } : null;
}

// Nomzod kartasi uchun tugmalar
function cbKeyboard(shortlistId, candidateId) {
  return { inline_keyboard: [[
    { text: '✅ Rozi — ochish', callback_data: cbData('r', shortlistId, candidateId) },
    { text: '❌ Yo\'q',          callback_data: cbData('n', shortlistId, candidateId) }
  ]]};
}

module.exports = {
  setItemState, reveal, notifyClient, MANUAL_STATES, isManualState,
  cbData, parseCb, cbKeyboard
};
