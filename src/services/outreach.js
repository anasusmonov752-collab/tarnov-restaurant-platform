// ── NOMZODGA BIRINCHI ALOQA ──────────────────────────────────
// Telegram boti o'zi birinchi bo'lib yoza olmaydi, shuning uchun deep link
// boshqa kanal orqali yetkaziladi. Kanal almashtiriladigan qilingan:
// SMS hali shartnoma kutayotgan bo'lsa, email yoki qo'lda (hh chati) ishlaydi.
//
// Kanallar:
//   sms    — Eskiz.uz (yuridik shaxs shartnomasi kerak)
//   manual — hech narsa yuborilmaydi, havola adminga qaytariladi
//            (admin uni hh chati / WhatsApp orqali o'zi tashlaydi)

const eskiz = require('./sms/eskiz');

const CHANNELS = ['sms', 'manual'];

function isConfigured(channel) {
  if (channel === 'manual') return true;
  if (channel === 'sms') return eskiz.isConfigured();
  return false;
}

// Mavjud kanallar ro'yxati — frontend qaysi tugmani ko'rsatishni shundan biladi
function available() {
  return CHANNELS.filter(isConfigured);
}

// Default kanal: SMS sozlangan bo'lsa SMS, aks holda qo'lda
function defaultChannel() {
  return eskiz.isConfigured() ? 'sms' : 'manual';
}

/**
 * @returns {Promise<{ok:boolean, channel:string, providerMsgId?:string, error?:string, manual?:boolean}>}
 * `manual: true` — hech narsa yuborilmadi, havolani admin o'zi uzatadi.
 */
async function send({ channel, to, text }) {
  const ch = channel || defaultChannel();

  if (ch === 'manual') {
    return { ok: true, channel: 'manual', manual: true };
  }

  if (ch === 'sms') {
    if (!eskiz.isConfigured()) {
      return { ok: false, channel: ch, error: 'SMS sozlanmagan (ESKIZ_EMAIL/ESKIZ_PASSWORD yo\'q)' };
    }
    try {
      const r = await eskiz.send({ to, text });
      return { ok: true, channel: ch, providerMsgId: r.messageId };
    } catch (e) {
      return { ok: false, channel: ch, error: e.message };
    }
  }

  return { ok: false, channel: ch, error: 'Noma\'lum kanal: ' + ch };
}

async function balance() {
  if (!eskiz.isConfigured()) return null;
  try { return await eskiz.balance(); } catch { return null; }
}

module.exports = { send, balance, available, defaultChannel, isConfigured, CHANNELS };
