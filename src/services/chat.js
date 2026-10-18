// ── SUHBAT XIZMATI ───────────────────────────────────────────
// Mijoz<->nomzod va mijoz<->agentlik yozishmalari.
//
// Agentlik<->nomzod BU YERDA EMAS — u botRelay/BotMessage'da qoladi
// (Telegram reply plumbing'i bilan). Inbox ikkala manbani qo'shib
// ko'rsatadi.

const { v4: uuidv4 } = require('uuid');
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');

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

module.exports = { ensureThread, post, markRead, onReveal, PREVIEW };
