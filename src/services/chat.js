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
async function post({ agencyId, threadId, from, text, kind = 'text' }) {
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

  await ChatThread.updateOne({ agencyId, id: threadId }, {
    $set: {
      lastMsgAt: msg.createdAt,
      lastMsgText: clean.slice(0, PREVIEW),
      lastMsgFrom: from,
      updatedAt: new Date()
    },
    $inc: inc
  });

  return msg;
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
  const [pin, threads] = await Promise.all([
    ensureThread({ agencyId, clientId, kind: 'ca' }),
    ChatThread.find({ agencyId, clientId, kind: 'cc' }).sort({ lastMsgAt: -1 }).limit(100).lean()
  ]);
  const head = Object.assign(row(pin.toObject ? pin.toObject() : pin, 'client'), {
    pinned: true, title: 'TalentHub', verified: true,
    subtitle: pin.lastMsgText || 'Yordam kerakmi? Yozing'
  });
  return [head, ...threads.map(t => row(t, 'client'))];
}

// Nomzod inboxi: qadalgan agentlik (BotMessage'dan) + uni ochgan mijozlar
async function inboxForCandidate(agencyId, candidateId) {
  const [last, threads] = await Promise.all([
    BotMessage.findOne({ restaurantId: agencyId, candidateId }).sort({ createdAt: -1 }).lean(),
    ChatThread.find({ agencyId, candidateId, kind: 'cc' }).sort({ lastMsgAt: -1 }).limit(100).lean()
  ]);
  const head = {
    id: AGENCY_THREAD, kind: 'ca', state: 'open', pinned: true,
    title: 'TalentHub', verified: true,
    subtitle: (last && last.text) ? String(last.text).slice(0, PREVIEW) : 'Yordam kerakmi? Yozing',
    lastMsgAt: last ? last.createdAt : null,
    lastMsgFrom: last ? (last.direction === 'in' ? 'candidate' : 'agency') : '',
    unread: 0
  };
  return [head, ...threads.map(t => row(t, 'candidate'))];
}

// ── Xabarlar ─────────────────────────────────────────────────
// Nomzodning qadalgan suhbati uchun BotMessage'ni bir xil shaklga
// keltiramiz — UI ikkala manbani farqlamasin.
async function messages({ agencyId, threadId, candidateId = '', limit = 200 }) {
  if (threadId === AGENCY_THREAD) {
    const rows = await BotMessage.find({ restaurantId: agencyId, candidateId })
      .sort({ createdAt: -1 }).limit(limit).lean();
    return rows.reverse().map(m => ({
      id: m.id,
      from: m.kind === 'system' ? 'system' : (m.direction === 'in' ? 'candidate' : 'agency'),
      kind: m.kind === 'system' ? 'system' : 'text',
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
  ensureThread, post, markRead, onReveal,
  inboxForClient, inboxForCandidate, messages,
  PREVIEW, AGENCY_THREAD
};
