// ── SUHBAT XIZMATI ───────────────────────────────────────────
// Mijoz<->nomzod va mijoz<->agentlik yozishmalari.
//
// Agentlik<->nomzod BU YERDA EMAS — u botRelay/BotMessage'da qoladi
// (Telegram reply plumbing'i bilan). Inbox ikkala manbani qo'shib
// ko'rsatadi.

const { v4: uuidv4 } = require('uuid');
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const BotMessage = require('../models/BotMessage');
const Shortlist = require('../models/Shortlist');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');

const PREVIEW = 120;   // ro'yxatda ko'rinadigan qism

// ── Thread topish yoki ochish ────────────────────────────────
// Poyga xavfsiz: unikal indeks (agencyId+clientId+candidateId+kind)
// ikkinchi threadni yaratishga yo'l qo'ymaydi, E11000 bo'lsa mavjudini
// o'qiymiz.
async function ensureThread({ agencyId, clientId, candidateId = '', shortlistId = '', kind }) {
  const q = { agencyId, clientId, kind };
  if (kind === 'cc') q.candidateId = candidateId;

  const found = await ChatThread.findOne(q);
  if (found) return found;

  try {
    return await ChatThread.create({
      id: uuidv4(), agencyId, kind, clientId,
      candidateId: kind === 'cc' ? candidateId : '',
      shortlistId
    });
  } catch (e) {
    if (e && e.code === 11000) return await ChatThread.findOne(q);
    throw e;
  }
}

// ── Xabar qo'yish ────────────────────────────────────────────
// `from` kim yozganini bildiradi. O'qilmaganlar hisobi faqat BOSHQA
// tomonlarga oshadi — o'z xabaringiz sizga o'qilmagan bo'lib ko'rinmaydi.
async function post({ agencyId, threadId, from, text, kind = 'text', appBase = '' }) {
  const clean = String(text || '').trim().slice(0, 4000);
  if (!clean) throw new Error('Xabar bo\'sh');

  const msg = await ChatMessage.create({
    id: uuidv4(), agencyId, threadId, from, kind, text: clean
  });

  const inc = {};
  if (from !== 'client')    inc.unreadClient = 1;
  if (from !== 'candidate') inc.unreadCandidate = 1;
  // Tizim xabari sizga "o'qilmagan" bo'lib chiqmasin — siz uni o'zingiz
  // keltirib chiqargansiz (kontakt ochish va h.k.)
  if (from !== 'agency' && from !== 'system') inc.unreadAgency = 1;

  const th = await ChatThread.findOneAndUpdate({ agencyId, id: threadId }, {
    $set: {
      lastMsgAt: msg.createdAt,
      lastMsgText: clean.slice(0, PREVIEW),
      lastMsgFrom: from,
      updatedAt: new Date()
    },
    $inc: inc
  }, { new: true });

  // Push — qarshi tomon Mini App'ni ochiq tutmaydi
  if (th && await pushNotify({ agencyId, th, from, text: clean, appBase })) {
    await ChatMessage.updateOne({ agencyId, id: msg.id }, { $set: { tgPushedAt: new Date() } });
  }

  return msg;
}


// ── TELEGRAM BILDIRISHNOMASI ─────────────────────────────────
// Mini App doim ochiq turmaydi va o'z push'i YO'Q. Bildirishnoma
// bo'lmasa odam yozadi, javob ko'rmaydi va chatni tashlab ketadi —
// keyin telefonga qaytadi. Shuning uchun har xabar bot orqali
// qarshi tomonga ham boradi.
//
// Yiqilsa jim o'tadi: xabar bazaga allaqachon yozilgan.
async function pushNotify({ agencyId, th, from, text, appBase }) {
  try {
    const token = tg.platformToken();
    if (!token || !appBase) return;

    const cut = String(text || '').slice(0, 140);
    const targets = [];

    // Kimga boradi: yozgan tomondan BOSHQASIGA.
    // 'system' uchun push yo'q — reveal o'z xabarlarini allaqachon
    // yuborgan, ikkinchisi takror bo'lardi.
    if (from === 'system') return;

    // lang — qabul qiluvchining tili. Mijoz — Client.lang/tgLang; nomzod
    // kabineti hali o'zbekcha, shuning uchun nomzodga 'uz'.
    if (from !== 'client') {
      const cl = await Client.findOne({ agencyId, id: th.clientId }, 'tgChatId lang tgLang').lean();
      if (cl && cl.tgChatId) targets.push({ chatId: cl.tgChatId, url: appBase + '/miniapp.html#chat',
        lang: I18N.resolve(cl.lang, cl.tgLang) });
    }
    if (from !== 'candidate' && th.kind === 'cc' && th.candidateId) {
      const cd = await Candidate.findOne({ restaurantId: agencyId, id: th.candidateId }, 'tgChatId').lean();
      if (cd && cd.tgChatId) targets.push({ chatId: cd.tgChatId, url: appBase + '/profil.html#chat', lang: 'uz' });
    }
    if (!targets.length) return;

    await Promise.all(targets.map(t => {
      const label = from === 'agency' ? 'TalentHub' : I18N.t(t.lang, 'push.new');
      return tg.sendMessage(token, t.chatId, `💬 ${label}\n\n${cut}`, {
        reply_markup: { inline_keyboard: [[{ text: I18N.t(t.lang, 'push.open'), web_app: { url: t.url } }]] }
      }).catch(e => console.error('[CHAT] push:', e.message));
    }));
    return true;
  } catch (e) {
    console.error('[CHAT] push umuman ketmadi:', e.message);
  }
}

// ── O'qildi deb belgilash ────────────────────────────────────
async function markRead({ agencyId, threadId, side }) {
  const field = { client: 'unreadClient', candidate: 'unreadCandidate', agency: 'unreadAgency' }[side];
  if (!field) return;
  await ChatThread.updateOne({ agencyId, id: threadId }, { $set: { [field]: 0 } });
}

// ── Kontakt ochilganda ───────────────────────────────────────
// Suhbatni ochadi va BITTA tizim xabarini qo'yadi. Ikki tomonga ikki
// xil matn yozmaymiz: thread bitta, ikkalasi bir xil narsani ko'radi —
// shunda nizoda "menga boshqacha ko'rsatilgan" degan gap chiqmaydi.
//
// Tizim xabari ataylab 'system' — uni tomonlardan biri yozgandek
// ko'rsatish yozishmani dalil sifatida ishlatishni buzardi.
async function onReveal({ agencyId, clientId, candidateId, shortlistId, clientName, publicCode }) {
  const th = await ensureThread({ agencyId, clientId, candidateId, shortlistId, kind: 'cc' });
  await post({
    agencyId, threadId: th.id, from: 'system', kind: 'system',
    text: `Kontakt ochildi — «${clientName || 'Mijoz'}» va ${publicCode || 'nomzod'} endi bevosita yozisha oladi.`
  });
  return th;
}



// ── Eski ochilgan kontaktlarga suhbat ────────────────────────
// Chat kontakt ochish oqimidan KEYIN qo'shildi: ungacha ochilgan
// kontaktlarda thread yo'q va mijoz ularni inboxda ko'rmaydi.
//
// Migratsiya skripti o'rniga inbox ochilganda to'ldirib boramiz —
// o'zini o'zi tuzatadi va kelajakda ham (reveal yiqilib thread
// ochilmay qolsa) bo'shliq qolmaydi. ensureThread idempotent.
async function backfill({ agencyId, clientId = '', candidateId = '' }) {
  const q = { agencyId };
  if (clientId) q.clientId = clientId;
  if (candidateId) q['items.candidateId'] = candidateId;

  const rows = await Shortlist.find(q, 'id clientId items').limit(200).lean();
  for (const s of rows) {
    for (const it of (s.items || [])) {
      if (!it.revealedAt) continue;                 // to'lanmagan — suhbat yo'q
      if (it.state === 'refunded') continue;        // kredit qaytarilgan
      if (candidateId && it.candidateId !== candidateId) continue;
      try {
        await ensureThread({
          agencyId, clientId: s.clientId, candidateId: it.candidateId,
          shortlistId: s.id, kind: 'cc'
        });
      } catch (e) { console.error('[CHAT] backfill:', e.message); }
    }
  }
}
// ── INBOX ────────────────────────────────────────────────────
// Ikkala kabinetda bir xil ko'rinish: tepada qadalgan "TalentHub ✓",
// ostida haqiqiy suhbatlar.
//
// Qadalgan suhbat IKKI XIL MANBADAN keladi va buni shu yerda yashiramiz,
// UI bilmasin:
//   mijoz tomoni  -> ChatThread kind='ca'   (yangi)
//   nomzod tomoni -> BotMessage             (mavjud relay, Telegram
//                    reply plumbing'i bilan — ko'chirmaymiz)
// Nomzod tomonidagi qadalgan suhbatning id'si — AGENCY_THREAD.
const AGENCY_THREAD = 'agency';

// BotMessage'dagi 'system' yozuvlar — agentlikning ichki jurnali
// ("Havola yaratildi (qo'lda uzatish): <link>", "Taklif yuborildi (sms)",
// "Nomzod Telegramga ulandi", ovozli xabar belgisi). Ular adminga
// yozilgan va uchinchi shaxsda; nomzod ularni o'z suhbatida ko'rmasin.
const CANDIDATE_VISIBLE = (agencyId, candidateId) =>
  ({ restaurantId: agencyId, candidateId, kind: { $ne: 'system' } });

function row(t, side) {
  const unread = { client: t.unreadClient, candidate: t.unreadCandidate, agency: t.unreadAgency }[side] || 0;
  return {
    id: t.id, kind: t.kind, state: t.state,
    candidateId: t.candidateId, clientId: t.clientId,
    lastMsgAt: t.lastMsgAt, lastMsgText: t.lastMsgText, lastMsgFrom: t.lastMsgFrom,
    unread, pinned: false
  };
}

// Mijoz inboxi: qadalgan agentlik + kontakt ochilgan nomzodlar
async function inboxForClient(agencyId, clientId) {
  await backfill({ agencyId, clientId });
  const [pin, threads] = await Promise.all([
    ensureThread({ agencyId, clientId, kind: 'ca' }),
    ChatThread.find({ agencyId, clientId, kind: 'cc' }).sort({ lastMsgAt: -1 }).limit(100).lean()
  ]);
  const head = Object.assign(row(pin.toObject ? pin.toObject() : pin, 'client'), {
    pinned: true, title: 'TalentHub', verified: true,
    subtitle: pin.lastMsgText || 'Yordam chati — savolingizni yozing'
  });
  return [head, ...threads.map(t => row(t, 'client'))];
}

// Qadalgan "TalentHub" suhbatida o'qilmaganlar: agentlik xabarlari nomzod
// shu suhbatni oxirgi ochganidan (Candidate.supportSeenAt) keyin. BotMessage'da
// o'qilganlik maydoni yo'q — vaqt bo'yicha sanaymiz. seenAt yo'q — 0
// (birinchi ko'rishda chegara qo'yiladi, eski xabarlar "yangi" bo'lib chiqmasin).
async function supportUnread(agencyId, candidateId, seenAt) {
  if (!seenAt) return 0;
  return BotMessage.countDocuments(Object.assign(CANDIDATE_VISIBLE(agencyId, candidateId),
    { direction: { $ne: 'in' }, createdAt: { $gt: new Date(seenAt) } }));
}

// Nomzod inboxi: qadalgan agentlik (BotMessage'dan) + uni ochgan mijozlar
async function inboxForCandidate(agencyId, candidateId, seenAt = null) {
  await backfill({ agencyId, candidateId });
  const [last, threads] = await Promise.all([
    BotMessage.findOne(CANDIDATE_VISIBLE(agencyId, candidateId)).sort({ createdAt: -1 }).lean(),
    ChatThread.find({ agencyId, candidateId, kind: 'cc' }).sort({ lastMsgAt: -1 }).limit(100).lean()
  ]);
  const head = {
    id: AGENCY_THREAD, kind: 'ca', state: 'open', pinned: true,
    title: 'TalentHub', verified: true,
    subtitle: (last && last.text) ? String(last.text).slice(0, PREVIEW) : 'Yordam chati — savolingizni yozing',
    lastMsgAt: last ? last.createdAt : null,
    lastMsgFrom: last ? (last.direction === 'in' ? 'candidate' : 'agency') : '',
    unread: await supportUnread(agencyId, candidateId, seenAt)
  };
  return [head, ...threads.map(t => row(t, 'candidate'))];
}

// ── Xabarlar ─────────────────────────────────────────────────
// Nomzodning qadalgan suhbati uchun BotMessage'ni bir xil shaklga
// keltiramiz — UI ikkala manbani farqlamasin.
async function messages({ agencyId, threadId, candidateId = '', limit = 200 }) {
  if (threadId === AGENCY_THREAD) {
    const rows = await BotMessage.find(CANDIDATE_VISIBLE(agencyId, candidateId))
      .sort({ createdAt: -1 }).limit(limit).lean();
    return rows.reverse().map(m => ({
      id: m.id,
      from: m.direction === 'in' ? 'candidate' : 'agency',
      kind: 'text',
      text: m.text, createdAt: m.createdAt
    }));
  }
  const rows = await ChatMessage.find({ agencyId, threadId })
    .sort({ createdAt: -1 }).limit(limit).lean();
  return rows.reverse().map(m => ({
    id: m.id, from: m.from, kind: m.kind, text: m.text, createdAt: m.createdAt
  }));
}
module.exports = {
  ensureThread, post, markRead, onReveal, backfill,
  inboxForClient, inboxForCandidate, supportUnread, messages,
  PREVIEW, AGENCY_THREAD
};
