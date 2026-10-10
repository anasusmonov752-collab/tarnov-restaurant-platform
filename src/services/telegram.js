// ── TELEGRAM BOT API ─────────────────────────────────────────
// Kutubxona ishlatilmaydi — bizga atigi bir nechta metod kerak va Node 18+
// da `fetch` tayyor. Suhbat holati kerak bo'lganda (bot screening, suhbat
// belgilash) grammY qo'shiladi; hozir ortiqcha bog'liqlik bo'lardi.

const API = 'https://api.telegram.org/bot';

// Telegram xabar uzunligi chegarasi
const MAX_LEN = 4096;

// Nomzod botni bloklagan yoki chat o'chirilgan — qayta urinish befoyda
const FATAL_CODES = [400, 403];

class TelegramError extends Error {
  constructor(message, code, fatal) {
    super(message);
    this.code = code;
    this.fatal = fatal;   // true bo'lsa qayta urinilmaydi
  }
}

async function call(token, method, payload, { timeoutMs = 15000 } = {}) {
  if (!token) throw new TelegramError('Bot tokeni sozlanmagan', 0, true);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res, body;
  try {
    res = await fetch(`${API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ctl.signal
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    throw new TelegramError(
      e.name === 'AbortError' ? 'Telegram javob bermadi (timeout)' : e.message,
      0, false                     // tarmoq xatosi — qayta urinish mumkin
    );
  } finally {
    clearTimeout(timer);
  }

  if (!body.ok) {
    const code = body.error_code || res.status;
    throw new TelegramError(
      body.description || 'Telegram xatosi',
      code,
      FATAL_CODES.includes(code)
    );
  }
  return body.result;
}

// Matnni Telegram chegarasiga moslaymiz (4096 belgi)
function clamp(text) {
  const t = String(text == null ? '' : text);
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN - 1) + '…' : t;
}

// ── Metodlar ──

function getMe(token) {
  return call(token, 'getMe');
}

async function sendMessage(token, chatId, text, opts = {}) {
  return call(token, 'sendMessage', {
    chat_id: chatId,
    text: clamp(text),
    disable_web_page_preview: true,
    ...opts
  });
}

// Inline tugma bosilganda Telegram javob kutadi. Javob bermasak,
// tugmada aylanuvchi soat ~30 soniya osilib qoladi.
async function answerCallback(token, callbackQueryId, text = '', showAlert = false) {
  return call(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: clamp(text),
    show_alert: showAlert
  });
}

// Amal bajarilgandan keyin eski xabarni yangilaymiz — tugmalar
// o'chadi, natija o'rniga yoziladi. Shunda takror bosilmaydi.
async function editMessageText(token, chatId, messageId, text, opts = {}) {
  return call(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: clamp(text),
    disable_web_page_preview: true,
    ...opts
  });
}

// Yozuv maydoni yonidagi doimiy tugma. Faqat MIJOZ chatiga qo'yiladi:
// nomzod va admin uchun kabinet yo'q, ularda tugma chalg'itadi.
async function setChatMenuButton(token, chatId, text, url) {
  return call(token, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text, web_app: { url } }
  });
}

function setWebhook(token, url, secret) {
  return call(token, 'setWebhook', {
    url,
    secret_token: secret,
    // Bizga faqat xabarlar kerak — qolgan update turlari shovqin
    allowed_updates: ['message'],
    drop_pending_updates: true
  });
}

function deleteWebhook(token) {
  return call(token, 'deleteWebhook', { drop_pending_updates: true });
}

function getWebhookInfo(token) {
  return call(token, 'getWebhookInfo');
}

// Deep link: t.me/<bot>?start=<payload>
// Payload cheklovi — 64 belgi, faqat A-Z a-z 0-9 _ -
function deepLink(botUsername, payload) {
  return `https://t.me/${botUsername}?start=${payload}`;
}

// ── Fayl yuklab olish ────────────────────────────────────────
// Ovozli xabar uchun: getFile -> file_path -> yuklab olish.
// Telegram Bot API orqali 20 MB gacha fayl olish mumkin; ovozli xabar
// odatda bir necha yuz KB, shuning uchun chegara qo'yamiz.
const MAX_DOWNLOAD = 20 * 1024 * 1024;

async function getFileBase64(token, fileId, { maxBytes = MAX_DOWNLOAD } = {}) {
  const info = await call(token, 'getFile', { file_id: fileId });
  if (!info || !info.file_path) throw new TelegramError('Fayl topilmadi', 0, true);
  if (info.file_size && info.file_size > maxBytes) {
    throw new TelegramError('Fayl juda katta', 0, true);
  }

  const url = `https://api.telegram.org/file/bot${token}/${info.file_path}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new TelegramError('Fayl yuklanmadi: ' + res.status, res.status, false);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new TelegramError('Fayl juda katta', 0, true);
    return { base64: buf.toString('base64'), bytes: buf.length, path: info.file_path };
  } catch (e) {
    if (e instanceof TelegramError) throw e;
    throw new TelegramError(e.name === 'AbortError' ? 'Fayl yuklash timeout' : e.message, 0, false);
  } finally {
    clearTimeout(timer);
  }
}

// ── PLATFORMA BOTI ───────────────────────────────────────────
// Bitta bot (TalentHub) barcha mijoz restoranlarga xizmat qiladi.
// Token muhit o'zgaruvchisida — bazada saqlanmaydi, API javoblarida
// chiqmaydi, mijoz admini uni ko'rmaydi.

function platformToken()  { return process.env.TELEGRAM_BOT_TOKEN || ''; }
function platformSecret() { return process.env.TELEGRAM_WEBHOOK_SECRET || ''; }
function isPlatformReady() { return !!(platformToken() && platformSecret()); }

// Username deep link uchun kerak. Env'da berilmasa getMe'dan olinadi
// va xotirada saqlanadi (jarayon qayta ishga tushsa qayta so'raladi).
let cachedUsername = process.env.TELEGRAM_BOT_USERNAME || '';
async function platformUsername() {
  if (cachedUsername) return cachedUsername;
  const me = await getMe(platformToken());
  cachedUsername = me.username;
  return cachedUsername;
}

module.exports = {
  getMe, sendMessage, answerCallback, editMessageText, setChatMenuButton,
  setWebhook, deleteWebhook, getWebhookInfo, getFileBase64,
  deepLink, TelegramError, MAX_LEN,
  platformToken, platformSecret, platformUsername, isPlatformReady
};
