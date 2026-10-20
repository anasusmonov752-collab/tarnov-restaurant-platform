// ── XATOLAR HAQIDA OGOHLANTIRISH ─────────────────────────────
// Server xatolari ilgari faqat Render konsoliga yozilardi — hech kim
// ko'rmasdi (2026-10-20 audit: "monitoring yo'q"). Endi 500 xatolar va
// tutilmagan promise'lar egasining Telegramiga keladi. Sentry kabi
// alohida xizmat va ro'yxatdan o'tish shart emas — bot allaqachon bor.
//
// Qayerga: ALERT_CHAT_ID (Render env). Berilmagan bo'lsa — agentlik
// admin chati (Restaurant.telegram.adminChatId), birinchi topilgani.
//
// Spam bo'lmasin: bir xil xato 30 daqiqada bir marta, jami soatiga 20 ta.
// Xabarda shaxsiy ma'lumot YO'Q: faqat yo'l, xato matni va vaqt.

const tg = require('./telegram');

const SAME_KEY_MS = 30 * 60 * 1000;
const HOUR_LIMIT = 20;
const seen = new Map();          // kalit -> oxirgi yuborilgan vaqt
let hourStart = 0, hourCount = 0, suppressed = 0;
let chatCache = null;

async function targetChat() {
  if (process.env.ALERT_CHAT_ID) return process.env.ALERT_CHAT_ID;
  if (chatCache) return chatCache;
  try {
    const Restaurant = require('../models/Restaurant');
    const r = await Restaurant.findOne({ 'telegram.adminChatId': { $nin: [null, ''] } }, 'telegram').lean();
    chatCache = (r && r.telegram && r.telegram.adminChatId) || null;
  } catch { chatCache = null; }
  return chatCache;
}

/**
 * @param {string} where  qayerda (masalan "POST /api/ma/shortlist")
 * @param {Error|string} err
 */
async function report(where, err) {
  try {
    const msg = String((err && err.message) || err || 'nomaʼlum xato').slice(0, 500);
    const key = where + '|' + msg.slice(0, 120);
    const now = Date.now();
    if (seen.has(key) && now - seen.get(key) < SAME_KEY_MS) return;
    if (now - hourStart > 3600e3) { hourStart = now; hourCount = 0; }
    if (hourCount >= HOUR_LIMIT) { suppressed++; return; }
    seen.set(key, now); hourCount++;
    if (seen.size > 500) seen.delete(seen.keys().next().value);

    const chat = await targetChat();
    const token = tg.platformToken();
    if (!chat || !token) return;
    const stack = err && err.stack ? String(err.stack).split('\n').slice(1, 4).map(s => s.trim()).join('\n') : '';
    const extra = suppressed ? `\n(oldingi soatda yana ${suppressed} ta xato yuborilmadi)` : '';
    suppressed = 0;
    await tg.sendMessage(token, chat,
      `⚠️ Server xatosi\n${where}\n\n${msg}${stack ? '\n\n' + stack : ''}${extra}\n\n` +
      new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }));
  } catch (e) {
    console.error('[ALERT] yuborilmadi:', e.message);
  }
}

module.exports = { report };
