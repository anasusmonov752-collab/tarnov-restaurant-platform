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
const pipeline = require('../data/pipeline');
const chat = require('./chat');

const MANUAL_STATES = pipeline.AGENCY_STATES;

function isManualState(s) { return MANUAL_STATES.includes(s); }

// ── Nomzod holatini qo'lda o'zgartirish (agentlik tomoni) ──
async function setItemState({ agencyId, shortlistId, candidateId, state, reason = '', note = '' }) {
  if (!isManualState(state)) throw new Error('Holat noto\'g\'ri');
  if (reason && !pipeline.CAND_REASON_KEYS.includes(reason)) throw new Error('Sabab noto\'g\'ri');

  const set = {
    'items.$.state': state,
    'items.$.note': note,
    updatedAt: new Date()
  };
  // Sabab faqat rad etishda saqlanadi — boshqa holatga o'tganda
  // eski sabab osilib qolmasligi kerak.
  set['items.$.reason'] = state === 'candidate_no' ? reason : '';

  // Ochilgan va yakuniy holatlarni orqaga qaytarib bo'lmaydi: pul
  // harakatlangan yoki mijoz qaror qilgan, tarix buzilmasligi kerak.
  const locked = ['revealed', 'refunded', 'interview', 'hired', 'not_fit'];
  const sl = await Shortlist.findOneAndUpdate(
    {
      agencyId, id: shortlistId,
      items: { $elemMatch: { candidateId, state: { $nin: locked } } }
    },
    { $set: set },
    { new: true }
  );

  if (!sl) {
    const exists = await Shortlist.findOne({ agencyId, id: shortlistId, 'items.candidateId': candidateId });
    throw new Error(exists
      ? 'Bu bosqichdan keyin holatni o\'zgartirib bo\'lmaydi'
      : 'Tanlov yoki nomzod topilmadi');
  }
  await syncKanban(agencyId, candidateId, state);
  return sl;
}

// ── Kanbanni tanlov bo'yicha oldinga surish ──────────────────
// Tanlovda nomzod suhbatga chiqsa, kanbanda ham suhbatda bo'lishi kerak.
// Faqat OLDINGA: bir mijoz rad etsa, boshqasida erishilgan bosqich
// yo'qolmaydi.
//
// Yiqilsa throw qilmaydi — asosiy amal (kredit, holat) allaqachon
// bajarilgan, kanban esa ko'rsatma qatlam.
async function syncKanban(agencyId, candidateId, state) {
  const target = pipeline.STATE_TO_KANBAN[state];
  if (!target) return;

  try {
    const c = await Candidate.findOne({ restaurantId: agencyId, id: candidateId }, 'status').lean();
    if (!c || !pipeline.isForward(c.status, target)) return;

    const set = { status: target, statusChangedAt: new Date(), updatedAt: new Date() };
    // Ishga olindi — bu global fakt: boshqa mijozlarga ko'rsatmaymiz
    if (target === 'hired') {
      set.jobStatus = 'not_looking';
      set.jobStatusAt = new Date();
    }
    await Candidate.updateOne({ restaurantId: agencyId, id: candidateId }, { $set: set });
  } catch (e) {
    console.error('[SL] kanban sinxronlanmadi:', e.message);
  }
}

// ── Mijoz tomoni: suhbat / ishga olish / rad ──
// Faqat kontakt ochilgandan keyin mantiqiy — ochilmagan nomzodni
// suhbatga chaqirib bo'lmaydi, uning raqami mijozda yo'q.
async function setClientState({ agencyId, shortlistId, clientId, candidateId, state, reason = '', interviewAt = null }) {
  if (!pipeline.CLIENT_STATES.includes(state)) throw new Error('Holat noto\'g\'ri');
  if (reason && !pipeline.CLIENT_REASON_KEYS.includes(reason)) throw new Error('Sabab noto\'g\'ri');

  const now = new Date();
  const set = { 'items.$.state': state, updatedAt: now };
  set['items.$.reason'] = state === 'not_fit' ? reason : '';

  if (state === 'interview') {
    const d = interviewAt ? new Date(interviewAt) : null;
    if (!d || isNaN(d.getTime())) throw new Error('Suhbat sanasi noto\'g\'ri');
    set['items.$.interviewAt'] = d;
  } else {
    set['items.$.decidedAt'] = now;
  }

  // Oldingi holat: kontakt ochilgan yoki suhbat belgilangan bo'lishi
  // kerak. 'hired'/'not_fit' esa yakuniy — qayta o'zgartirilmaydi.
  const allowedFrom = state === 'interview' ? ['revealed'] : ['revealed', 'interview'];
  const sl = await Shortlist.findOneAndUpdate(
    {
      agencyId, id: shortlistId, clientId,
      items: { $elemMatch: { candidateId, state: { $in: allowedFrom } } }
    },
    { $set: set },
    { new: true }
  );

  if (!sl) throw new Error('Bu nomzod uchun hali kontakt ochilmagan yoki qaror qabul qilingan');
  await syncKanban(agencyId, candidateId, state);
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
async function reveal({ agencyId, shortlistId, candidateId, appBase = '' }) {
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
      items: { $elemMatch: { candidateId, state: { $in: pipeline.REVEALABLE_STATES } } }
    },
    { $set: { 'items.$.state': 'revealed', 'items.$.revealedAt': now, updatedAt: now } },
    { new: true }
  );

  // Band qilib bo'lmadi — yo allaqachon ochilgan, yo umuman yo'q
  if (!claimed) {
    const sl = await Shortlist.findOne({ agencyId, id: shortlistId, 'items.candidateId': candidateId });
    if (!sl) throw new Error('Tanlov yoki nomzod topilmadi');

    const it = (sl.items || []).find(x => x.candidateId === candidateId);
    const st = (it && it.state) || '';

    // Nomzod bosh tortgan — ochadigan narsa yo'q. Avval bu holatdan ham
    // ochilib, kredit bekorga yechilardi.
    if (st === 'candidate_no') {
      throw new Error('Nomzod bu ishdan bosh tortgan — kontakt ochilmaydi');
    }
    // Ochilgan yoki undan keyingi holat (interview/hired/not_fit/refunded):
    // takroriy bosish. Pul yechilmaydi va mijozning qarori saqlanadi.
    return { already: true, shortlist: sl, state: st };
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
  const client = await Client.findOne({ agencyId, id: claimed.clientId }).lean();
  await notifyClient({ agencyId, clientId: claimed.clientId, cand, balance });

  // Suhbat ochish va nomzodga xabar — ikkalasi yiqilsa ham jim o'tadi:
  // kredit yechilgan, kontakt mijozda. Bular ustiga qo'shimcha qatlam.
  try {
    await chat.onReveal({
      agencyId, clientId: claimed.clientId, candidateId, shortlistId,
      clientName: client && client.name, publicCode: cand && cand.publicCode
    });
  } catch (e) { console.error('[SL] suhbat ochilmadi:', e.message); }

  await notifyCandidate({ cand, clientName: client && client.name, appBase });
  await syncKanban(agencyId, candidateId, 'revealed');

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

// ── Kontakt ochilganini NOMZODGA bildirish ──
// Ilgari nomzod hech narsa bilmasdi: mijozda uning telefoni bor edi,
// o'zi esa kim qo'ng'iroq qilishini bilmasdi. Kontakt ochilish payti —
// o'zaro tanishtirish payti, shuning uchun restoran nomini aytamiz.
//
// Yiqilsa throw qilmaydi — kredit allaqachon yechilgan.
async function notifyCandidate({ cand, clientName, appBase }) {
  try {
    if (!cand || !cand.tgChatId) return;
    const who = clientName || 'Ish beruvchi';
    const lines = [
      `🏢 «${who}» sizning kontaktingizni oldi.`,
      '',
      'Ular tez orada bog\'lanadi. Siz ham ilovadagi yozishma orqali',
      'savol bera olasiz.'
    ];
    const opts = appBase ? { reply_markup: { inline_keyboard: [[
      { text: '💬 Yozishmani ochish', web_app: { url: `${appBase}/profil.html#chat` } }
    ]]}} : {};
    await tg.sendMessage(tg.platformToken(), cand.tgChatId, lines.join('\n'), opts);
  } catch (e) {
    console.error('[SL] nomzodga xabar ketmadi:', e.message);
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
  setItemState, setClientState, reveal, notifyClient, notifyCandidate,
  MANUAL_STATES, isManualState,
  cbData, parseCb, cbKeyboard
};
