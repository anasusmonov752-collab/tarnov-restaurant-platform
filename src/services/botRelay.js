// ── RELAY: nomzod <-> admin ──────────────────────────────────
// Bu yerda "kim kimga yozyapti" mantig'i jamlangan. Route'lar faqat
// HTTP bilan shug'ullanadi, qaror shu yerda qabul qilinadi.

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const BotMessage = require('../models/BotMessage');
const Candidate = require('../models/Candidate');
const tg = require('./telegram');
const outreach = require('./outreach');
const { roleLabel } = require('../data/roles');

// Deep link payload: 64 belgi chegarasi, faqat A-Z a-z 0-9 _ -
// 22 belgilik base64url ~132 bit entropiya — taxmin qilib bo'lmaydi.
function makeToken() {
  return crypto.randomBytes(16).toString('base64url').slice(0, 22);
}

function makeSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

// Nomzodning ko'rsatiladigan nomi. hh PDF'lari anonim bo'lgani uchun
// fullName "Женщина, 21 год..." bo'lishi mumkin — shunda lavozim foydaliroq.
function displayName(c) {
  const n = (c.fullName || '').trim();
  // (?![а-яё]) — \b emas: JS'da \b faqat lotin harflarini so'z deb biladi va
  // "Женщина, 21 год" hech qachon tanilmasdi (admin xabarlarida shu chiqardi)
  if (n && !/^\s*(женщина|мужчина)(?![а-яё])/i.test(n)) return n;
  return c.desiredPosition || roleLabel(c.role) || 'Nomzod';
}

function canSend(c) {
  if (!c) return 'Nomzod topilmadi';
  if (c.tgState === 'blocked') return 'Nomzod botni bloklagan';
  if (c.tgState === 'stopped') return 'Nomzod yozishmadan chiqqan';
  if (c.tgState !== 'linked' || !c.tgChatId) return 'Nomzod hali Telegramga ulanmagan';
  return null;
}

async function logMsg(fields) {
  return BotMessage.create({ id: uuidv4(), ...fields });
}

// ── Nomzodni taklif qilish ───────────────────────────────────
// Token yaratadi, havolani tanlangan kanal orqali yuboradi.
// channel='manual' bo'lsa hech narsa yuborilmaydi — havola qaytariladi,
// admin uni hh chati yoki WhatsApp orqali o'zi tashlaydi.
async function invite(restaurant, candidate, { channel } = {}) {
  if (!tg.isPlatformReady()) throw new Error('Bot sozlanmagan (TELEGRAM_BOT_TOKEN yo\'q)');

  if (candidate.tgState === 'linked') throw new Error('Nomzod allaqachon ulangan');

  // Server SMS yubormaydi (Eskiz yo'q — services/outreach): havola faqat qaytariladi.
  // Taklif navbatidan SMS'da havola ketgan bo'lsa — O'SHA token qaytadi: yangisi
  // yuborilgan SMS'dagi havolani o'ldirardi.
  const uname = await tg.platformUsername();
  if (candidate.tgInviteToken) {
    return { link: tg.deepLink(uname, candidate.tgInviteToken), channel: 'manual', manual: true, reused: true };
  }
  const token = outreach.newToken();
  const link = tg.deepLink(uname, token);
  const ch = 'manual';
  const result = { ok: true, channel: ch, manual: true };

  candidate.tgInviteToken   = token;
  candidate.tgInviteSentAt  = new Date();
  candidate.tgInviteChannel = ch;
  candidate.tgState         = 'invited';
  candidate.updatedAt       = new Date();
  await candidate.save();

  await logMsg({
    restaurantId: restaurant.id, candidateId: candidate.id,
    direction: 'out', kind: 'system', sentBy: 'system',
    text: ch === 'manual' ? `Havola yaratildi (qo'lda uzatish): ${link}` : `Taklif yuborildi (${ch})`
  });

  return { link, channel: ch, manual: !!result.manual };
}

// ── Adminga yo'naltirish ─────────────────────────────────────
// Nomzod yozgan xabarni admin chatiga ko'chiradi. Admin keyin shu
// xabarga REPLY qilib javob yozadi — shu yo'l bilan qaysi nomzodga
// tegishli ekani aniqlanadi (adminMsgId orqali).
async function forwardToAdmin(restaurant, candidate, text) {
  const t = restaurant.telegram || {};
  if (!t.adminChatId) return null;

  // Bot bitta (TalentHub), lekin mijoz restoranlar ko'p — sarlavhada
  // restoran nomi ham bo'lishi kerak, aks holda admin kimdan kelganini
  // bilmaydi (bir admin bir nechta restoranni boshqarishi mumkin).
  const header = `${restaurant.name} · ${displayName(candidate)} — ${roleLabel(candidate.role)}`;
  const sent = await tg.sendMessage(
    tg.platformToken(), t.adminChatId,
    `${header}\n${'—'.repeat(20)}\n${text}\n\nJavob berish uchun shu xabarga reply qiling.`
  );
  return sent && sent.message_id;
}

// ── Nomzoddan kelgan xabar ───────────────────────────────────
// Ikki kirish yo'li bor: Telegram webhook va Mini App'dagi qadalgan
// "TalentHub" suhbati. Ikkalasi ham SHU yerdan o'tadi. Ilgari Mini App
// faqat forwardToAdmin'ni chaqirardi: BotMessage yozilmasdi, xabar
// nomzodning o'z suhbatidan yo'qolardi, adminMsgId bo'lmagani uchun
// admin reply qilganda javob nomzodga yetmasdi.
//
// Telegram yiqilsa ham xabar bazaga yoziladi — panelda ko'rinadi,
// nomzod esa "yuborilmadi" deb qayta yozishga majbur bo'lmaydi.
async function receiveFromCandidate(restaurant, candidate, text,
    { kind = 'text', tgMessageId = null, sentBy = 'telegram' } = {}) {
  let adminMsgId = null;
  try {
    adminMsgId = await forwardToAdmin(restaurant, candidate, text);
  } catch (e) {
    console.error('[RELAY] adminga yetmadi:', e.message);
  }

  const m = await logMsg({
    restaurantId: restaurant.id, candidateId: candidate.id,
    direction: 'in', kind, sentBy, text, tgMessageId, adminMsgId
  });

  // $inc — webhook va Mini App bir vaqtda yozsa hisob yo'qolmasin
  await Candidate.updateOne(
    { restaurantId: candidate.restaurantId, id: candidate.id },
    { $inc: { tgUnread: 1 }, $set: { tgLastMsgAt: new Date() } }
  );
  return m;
}

// ── Nomzodga xabar yuborish ──────────────────────────────────
async function sendToCandidate(restaurant, candidate, text, sentBy = 'panel') {
  const err = canSend(candidate);
  if (err) throw new Error(err);

  try {
    const sent = await tg.sendMessage(tg.platformToken(), candidate.tgChatId, text);
    await logMsg({
      restaurantId: restaurant.id, candidateId: candidate.id,
      direction: 'out', kind: 'text', sentBy,
      text, tgMessageId: sent && sent.message_id
    });
    candidate.tgUnread = 0;
    candidate.tgLastMsgAt = new Date();
    await candidate.save();
    return { ok: true };
  } catch (e) {
    // 403 = nomzod botni bloklagan; qayta urinish befoyda
    if (e.fatal && e.code === 403) {
      candidate.tgState = 'blocked';
      await candidate.save();
    }
    await logMsg({
      restaurantId: restaurant.id, candidateId: candidate.id,
      direction: 'out', kind: 'text', sentBy, text, error: e.message
    });
    throw e;
  }
}

module.exports = {
  makeToken, makeSecret, displayName, canSend, logMsg,
  invite, forwardToAdmin, receiveFromCandidate, sendToCandidate
};
